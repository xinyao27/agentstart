use crate::hosts::HostFilesystem;
use crate::projects::ProjectKind;

use super::{
    ProjectHostSetupAuthority, ProjectHostSetupError, SetupClone, SetupExisting, SetupMethod,
    SetupRepositoryEnvelope, host_effects, model::PreparedRepository,
};

fn selected_github(project: &crate::projects::RuntimeProject) -> Option<super::GitHubIdentity> {
    project.provider_identity.as_ref().map(|identity| {
        let (owner, repo) = identity.github_coordinates();
        super::GitHubIdentity { owner, repo }
    })
}

impl ProjectHostSetupAuthority {
    pub(crate) async fn setup_existing(
        &self,
        input: SetupExisting,
    ) -> Result<SetupRepositoryEnvelope, ProjectHostSetupError> {
        let project = self.project(&input.project_id).await?;
        self.assert_revision(input.expected_revision).await?;
        let host = self.hosts.execution_host(&input.host_id).await?;
        let kind = input.kind.unwrap_or(ProjectKind::Git);
        let inspected = host_effects::inspect(host.clone(), &input.path, kind).await?;
        let display_name = self
            .projects
            .list()
            .await?
            .into_iter()
            .find(|repo| repo.execution_host_id == input.host_id && repo.path == inspected.path)
            .map_or_else(
                || HostFilesystem::new(host).paths().basename(&inspected.path),
                |repo| repo.display_name,
            );
        let selected_github = selected_github(&project);
        self.attach(
            input.expected_revision,
            project,
            PreparedRepository {
                display_name,
                host_id: input.host_id,
                kind,
                path: inspected.path,
                project_id: input.project_id,
                remotes: inspected.remotes,
                setup_method: input
                    .setup_method
                    .unwrap_or(SetupMethod::ImportedExistingFolder),
                selected_github,
            },
        )
        .await
    }

    pub(crate) async fn clone_repository(
        &self,
        input: SetupClone,
    ) -> Result<SetupRepositoryEnvelope, ProjectHostSetupError> {
        let project = self.project(&input.project_id).await?;
        self.assert_revision(input.expected_revision).await?;
        let host = self.hosts.execution_host(&input.host_id).await?;
        let selected_github = selected_github(&project);
        let lease = self
            .acquire_clone(&input.host_id, &input.url, &input.destination)
            .await?;
        let existing_before_clone = self
            .projects
            .list()
            .await?
            .into_iter()
            .find(|repo| repo.execution_host_id == input.host_id && repo.path == lease.path());
        if let Some(existing) = existing_before_clone
            .as_ref()
            .filter(|repo| repo.kind != ProjectKind::Folder)
        {
            let inspected = host_effects::inspect(host, &existing.path, ProjectKind::Git).await?;
            return self
                .attach(
                    input.expected_revision,
                    project,
                    PreparedRepository {
                        display_name: existing.display_name.clone(),
                        host_id: input.host_id,
                        kind: ProjectKind::Git,
                        path: inspected.path,
                        project_id: input.project_id,
                        remotes: inspected.remotes,
                        setup_method: SetupMethod::Cloned,
                        selected_github,
                    },
                )
                .await;
        }
        let completed = self.execute_clone(lease, &input.url).await?;
        let inspected =
            match host_effects::inspect(host.clone(), completed.path(), ProjectKind::Git).await {
                Ok(inspected) => inspected,
                Err(error) => {
                    completed.cleanup().await;
                    return Err(error);
                }
            };
        let prepared = PreparedRepository {
            display_name: existing_before_clone.map_or_else(
                || {
                    HostFilesystem::new(host.clone())
                        .paths()
                        .basename(&inspected.path)
                },
                |repo| repo.display_name,
            ),
            host_id: input.host_id,
            kind: ProjectKind::Git,
            path: inspected.path,
            project_id: input.project_id,
            remotes: inspected.remotes,
            setup_method: SetupMethod::Cloned,
            selected_github,
        };
        match self
            .attach(input.expected_revision, project, prepared)
            .await
        {
            Ok(result) => {
                completed.commit();
                Ok(result)
            }
            Err(error) => {
                completed.cleanup().await;
                Err(error)
            }
        }
    }
}

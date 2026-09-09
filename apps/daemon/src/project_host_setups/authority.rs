use std::path::Path;

use tokio::sync::oneshot;

use crate::host_progress::HostProgressAuthority;
use crate::host_registry::HostRegistry;
use crate::projects::{ProjectCatalog, ProjectCatalogError, RuntimeProject};
use crate::workspace_session::WorkspaceSessionAuthority;

use super::{
    CleanupTombstone, ProjectHostSetup, ProjectHostSetupError, SetupCreate, SetupCreateEnvelope,
    SetupCreateResult, SetupDelete, SetupListResult, SetupMethod, SetupRepositoryEnvelope,
    SetupRepositoryResult, SetupUpdate, SetupUpdateEnvelope, SetupUpdateResult, StoredMutation,
    clone_lock::CloneCoordinator,
    host_effects,
    model::{PreparedRepository, SetupListSnapshot},
};

#[derive(Clone)]
pub(crate) struct ProjectHostSetupAuthority {
    pub(super) clones: CloneCoordinator,
    pub(super) clone_cleanup: super::clone_engine::CloneCleanup,
    pub(super) hosts: HostRegistry,
    pub(super) projects: ProjectCatalog,
    pub(super) progress: HostProgressAuthority,
    pub(super) sessions: WorkspaceSessionAuthority,
    pub(super) state_cleanup: super::state_cleanup::StateCleanup,
}

pub(crate) enum ProjectHostSetupRequest {
    Attach {
        expected_revision: i64,
        prepared: PreparedRepository,
        response: oneshot::Sender<Result<StoredMutation, ProjectCatalogError>>,
    },
    AckCleanup {
        cleanup: CleanupTombstone,
        response: oneshot::Sender<Result<(), ProjectCatalogError>>,
    },
    Create {
        input: SetupCreate,
        response: oneshot::Sender<Result<StoredMutation, ProjectCatalogError>>,
    },
    Delete {
        input: SetupDelete,
        response: oneshot::Sender<Result<StoredMutation, ProjectCatalogError>>,
    },
    List {
        response: oneshot::Sender<Result<SetupListSnapshot, ProjectCatalogError>>,
    },
    PendingCleanups {
        response: oneshot::Sender<Result<Vec<CleanupTombstone>, ProjectCatalogError>>,
    },
    Update {
        input: SetupUpdate,
        response: oneshot::Sender<Result<StoredMutation, ProjectCatalogError>>,
    },
}

impl ProjectHostSetupAuthority {
    pub(crate) fn new(
        user_data_path: &Path,
        projects: ProjectCatalog,
        hosts: HostRegistry,
        progress: HostProgressAuthority,
        sessions: WorkspaceSessionAuthority,
    ) -> Self {
        Self {
            clones: CloneCoordinator::new(),
            clone_cleanup: super::clone_engine::CloneCleanup::new(),
            hosts,
            projects,
            progress,
            sessions,
            state_cleanup: super::state_cleanup::StateCleanup::new(user_data_path),
        }
    }

    pub(crate) fn abort_clone(&self) {
        self.clones.abort();
    }

    pub(crate) async fn shutdown(&self) {
        self.clones.abort();
        self.clone_cleanup.shutdown().await;
    }

    pub(crate) async fn list(&self) -> Result<SetupListResult, ProjectHostSetupError> {
        let (response, result) = oneshot::channel();
        self.projects
            .submit_project_host_setups(ProjectHostSetupRequest::List { response })
            .await?;
        let snapshot = receive(result).await?;
        let mut setups = snapshot.setups;
        for repo in snapshot.projects {
            if setups
                .iter()
                .any(|setup| setup.storage_repo_id == repo.storage_id)
            {
                continue;
            }
            let Some(project) = snapshot
                .runtime_projects
                .iter()
                .find(|project| project.source_repo_ids.contains(&repo.id))
            else {
                continue;
            };
            setups.push(ProjectHostSetup {
                created_at: repo.added_at,
                display_name: repo.display_name,
                execution_host_id: Some(repo.execution_host_id.clone()),
                git_username: None,
                host_id: repo.execution_host_id,
                id: repo.storage_id.clone(),
                kind: Some(repo.kind),
                path: repo.path,
                project_id: project.id.clone(),
                repo_id: repo.id,
                setup_method: SetupMethod::LegacyRepo,
                setup_state: super::SetupState::Ready,
                storage_id: repo.storage_id.clone(),
                storage_repo_id: repo.storage_id,
                updated_at: repo.added_at,
                upstream: None,
                worktree_base_path: repo.worktree_base_path,
            });
        }
        setups
            .sort_by(|left, right| (left.created_at, &left.id).cmp(&(right.created_at, &right.id)));
        Ok(SetupListResult {
            revision: snapshot.revision,
            setups,
        })
    }

    pub(crate) async fn create(
        &self,
        mut input: SetupCreate,
    ) -> Result<SetupCreateEnvelope, ProjectHostSetupError> {
        let project = self.project(&input.project_id).await?;
        let existing = self.list().await?.setups;
        if let Some(duplicate) = existing
            .iter()
            .find(|setup| setup.project_id == input.project_id && setup.host_id == input.host_id)
        {
            return Err(ProjectCatalogError::SetupExists(duplicate.id.clone()).into());
        }
        super::create_input::normalize(&mut input, &project, &existing);
        let mutation_guard = self.projects.mutation_guard().await;
        let (response, result) = oneshot::channel();
        self.projects
            .submit_project_host_setups(ProjectHostSetupRequest::Create { input, response })
            .await?;
        let mutation = receive(result).await?;
        drop(mutation_guard);
        Ok(SetupCreateEnvelope {
            result: SetupCreateResult {
                project,
                setup: mutation.setup,
            },
            revision: mutation.revision,
        })
    }

    pub(crate) async fn update(
        &self,
        mut input: SetupUpdate,
    ) -> Result<SetupUpdateEnvelope, ProjectHostSetupError> {
        let prepare_worktree_root = input.worktree_base_path_present;
        let fallback = self
            .list()
            .await?
            .setups
            .into_iter()
            .find(|setup| setup.id == input.setup_id)
            .ok_or_else(|| ProjectCatalogError::SetupNotFound(input.setup_id.clone()))?;
        input.fallback = Some(Box::new(fallback));
        let mutation_guard = self.projects.mutation_guard().await;
        let (response, result) = oneshot::channel();
        self.projects
            .submit_project_host_setups(ProjectHostSetupRequest::Update { input, response })
            .await?;
        let mutation = receive(result).await?;
        let project = self.project(&mutation.setup.project_id).await?;
        let envelope = envelope(project, mutation);
        drop(mutation_guard);
        if prepare_worktree_root
            && !envelope.result.setup.repo_id.is_empty()
            && envelope.result.setup.kind != Some(crate::projects::ProjectKind::Folder)
            && let Some(base) = envelope.result.setup.worktree_base_path.as_deref()
            && let Ok(host) = self
                .hosts
                .execution_host(&envelope.result.setup.host_id)
                .await
        {
            host_effects::prepare_worktree_root(host, &envelope.result.setup.path, base).await;
        }
        Ok(envelope)
    }

    pub(crate) async fn delete(
        &self,
        mut input: SetupDelete,
    ) -> Result<SetupUpdateEnvelope, ProjectHostSetupError> {
        let fallback = self
            .list()
            .await?
            .setups
            .into_iter()
            .find(|setup| setup.id == input.setup_id)
            .ok_or_else(|| ProjectCatalogError::SetupNotFound(input.setup_id.clone()))?;
        let project_id = fallback.project_id.clone();
        input.fallback = Some(Box::new(fallback));
        let project = self.project(&project_id).await?;
        let mutation_guard = self.projects.mutation_guard().await;
        let (response, result) = oneshot::channel();
        self.projects
            .submit_project_host_setups(ProjectHostSetupRequest::Delete { input, response })
            .await?;
        let mutation = receive(result).await?;
        drop(mutation_guard);
        if let Some(cleanup) = mutation.cleanup.clone() {
            let _ = self.replay_cleanup(cleanup).await;
        }
        Ok(envelope(project, mutation))
    }

    pub(super) async fn attach(
        &self,
        expected_revision: i64,
        project: RuntimeProject,
        prepared: PreparedRepository,
    ) -> Result<SetupRepositoryEnvelope, ProjectHostSetupError> {
        let project_id = project.id;
        let mutation_guard = self.projects.mutation_guard().await;
        let (response, result) = oneshot::channel();
        self.projects
            .submit_project_host_setups(ProjectHostSetupRequest::Attach {
                expected_revision,
                prepared,
                response,
            })
            .await?;
        let mutation = receive(result).await?;
        let project = self.project(&project_id).await?;
        let envelope = SetupRepositoryEnvelope {
            result: SetupRepositoryResult {
                project,
                repo: mutation.repo.ok_or(ProjectCatalogError::NotFound)?,
                setup: mutation.setup,
            },
            revision: mutation.revision,
        };
        drop(mutation_guard);
        Ok(envelope)
    }

    pub(super) async fn project(&self, id: &str) -> Result<RuntimeProject, ProjectHostSetupError> {
        self.projects
            .runtime_list()
            .await?
            .projects
            .into_iter()
            .find(|project| project.id == id)
            .ok_or_else(|| ProjectHostSetupError::ProjectNotFound(id.to_owned()))
    }

    pub(super) async fn assert_revision(&self, expected: i64) -> Result<(), ProjectHostSetupError> {
        let actual = self.projects.runtime_list().await?.revision;
        if actual == expected {
            Ok(())
        } else {
            Err(ProjectCatalogError::RevisionConflict {
                actual_revision: actual,
                expected_revision: expected,
                scope: "project-catalog",
            }
            .into())
        }
    }
}

fn envelope(project: RuntimeProject, mutation: StoredMutation) -> SetupUpdateEnvelope {
    SetupUpdateEnvelope {
        result: SetupUpdateResult {
            project,
            repo: mutation.repo,
            setup: mutation.setup,
        },
        revision: mutation.revision,
    }
}

pub(super) async fn receive<T>(
    result: oneshot::Receiver<Result<T, ProjectCatalogError>>,
) -> Result<T, ProjectHostSetupError> {
    result
        .await
        .map_err(|_| ProjectCatalogError::WorkerUnavailable)?
        .map_err(Into::into)
}

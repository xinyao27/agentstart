use std::sync::Arc;

use futures_util::future::join_all;
use thiserror::Error;

use crate::host_registry::{HostRegistry, HostRegistryError};
use crate::hosts::{ExecutionHost, HostCommand};

use super::{
    GitRemoteIdentity, Project, ProjectCatalog, ProjectCatalogError, ProjectKind, remotes,
};

#[derive(Clone)]
pub(crate) struct RemoteProjectResolver {
    catalog: ProjectCatalog,
    hosts: HostRegistry,
}

#[derive(Debug, Error)]
pub(crate) enum RemoteProjectResolverError {
    #[error(transparent)]
    Host(#[from] HostRegistryError),
    #[error(transparent)]
    Project(#[from] ProjectCatalogError),
}

impl RemoteProjectResolver {
    pub(crate) fn new(catalog: ProjectCatalog, hosts: HostRegistry) -> Self {
        Self { catalog, hosts }
    }

    pub(crate) async fn resolve(
        &self,
        canonical_key: String,
    ) -> Result<Vec<Project>, RemoteProjectResolverError> {
        let projects = self.catalog.list().await?;
        let refreshes = projects
            .into_iter()
            .filter(|project| project.kind != ProjectKind::Folder)
            .map(|project| self.refresh(project));
        for result in join_all(refreshes).await {
            result?;
        }
        Ok(self.catalog.resolve_by_remote(canonical_key).await?)
    }

    async fn refresh(&self, project: Project) -> Result<(), RemoteProjectResolverError> {
        let host = self
            .hosts
            .execution_host(&project.execution_host_id)
            .await?;
        let remote_identities = read_remotes(host, &project.path).await;
        self.catalog
            .replace_remotes(project.storage_id, remote_identities)
            .await?;
        Ok(())
    }
}

async fn read_remotes(host: Arc<dyn ExecutionHost>, cwd: &str) -> Vec<GitRemoteIdentity> {
    let Some(names) = run_git(host.as_ref(), cwd, ["remote"]).await else {
        return Vec::new();
    };
    let names = names
        .lines()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(str::to_owned)
        .collect::<Vec<_>>();
    let reads = names
        .iter()
        .map(|name| read_remote(host.as_ref(), cwd, name));
    let groups = join_all(reads).await;
    if groups.iter().any(Option::is_none) {
        return Vec::new();
    }
    groups.into_iter().flatten().flatten().collect()
}

async fn read_remote(
    host: &dyn ExecutionHost,
    cwd: &str,
    name: &str,
) -> Option<Vec<GitRemoteIdentity>> {
    let output = run_git(host, cwd, ["remote", "get-url", "--all", name]).await?;
    Some(
        output
            .lines()
            .map(str::trim)
            .filter(|url| !url.is_empty())
            .filter_map(|url| remotes::normalize(name, url))
            .collect(),
    )
}

async fn run_git(
    host: &dyn ExecutionHost,
    cwd: &str,
    args: impl IntoIterator<Item = impl Into<String>>,
) -> Option<String> {
    let mut command = HostCommand::new("git", args);
    command.cwd = Some(cwd.to_owned());
    let output = host.exec(command).await.ok()?;
    (output.exit_code == 0).then_some(output.stdout)
}

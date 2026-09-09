pub(in crate::rpc) mod protocol;
pub(in crate::rpc) mod protocol_values;

use futures_util::{StreamExt, TryStreamExt, stream};
use thiserror::Error;

use crate::projects::{ProjectCatalog, ProjectCatalogError};
use crate::workspace_ports::WorkspacePortProbe;
use crate::workspace_ports::WorkspacePortsRegistry;
use crate::worktrees::{WorktreeCatalog, WorktreeCatalogError};

const LOCAL_HOST_ID: &str = "local";
const PROJECT_PROBE_CONCURRENCY: usize = 8;

#[derive(Clone)]
pub(super) struct WorkspacePortsRpc {
    ports: WorkspacePortsRegistry,
    projects: ProjectCatalog,
    worktrees: WorktreeCatalog,
}

pub(super) struct ProbeSource {
    pub(super) host_id: String,
    pub(super) probes: Vec<WorkspacePortProbe>,
}

#[derive(Debug, Error)]
pub(super) enum WorkspacePortsRpcError {
    #[error(transparent)]
    Project(#[from] ProjectCatalogError),
    #[error(transparent)]
    Worktree(#[from] WorktreeCatalogError),
}

impl WorkspacePortsRpc {
    pub(super) fn new(
        ports: WorkspacePortsRegistry,
        projects: ProjectCatalog,
        worktrees: WorktreeCatalog,
    ) -> Self {
        Self {
            ports,
            projects,
            worktrees,
        }
    }

    // Why: scan attribution decides which host's listeners a caller may see and
    // which processes kill may signal, so both wire surfaces must resolve the
    // probe source through this one projection.
    pub(super) async fn probe_source(
        &self,
        project_id: Option<&str>,
    ) -> Result<ProbeSource, WorkspacePortsRpcError> {
        let projects = self.projects.list().await?;
        if let Some(project_id) = project_id {
            let Some(project) = projects.iter().find(|project| {
                project.execution_host_id == LOCAL_HOST_ID && project.id == project_id
            }) else {
                return Ok(ProbeSource {
                    host_id: LOCAL_HOST_ID.to_owned(),
                    probes: Vec::new(),
                });
            };
            let source = self.worktrees.port_probes_for_project(project).await?;
            return Ok(ProbeSource {
                host_id: source.host_id,
                probes: source.probes,
            });
        }
        let worktrees = self.worktrees.clone();
        let sources = stream::iter(
            projects
                .into_iter()
                .filter(|project| project.execution_host_id == LOCAL_HOST_ID)
                .collect::<Vec<_>>(),
        )
        .map(move |project| {
            let worktrees = worktrees.clone();
            async move { worktrees.port_probes_for_project(&project).await }
        })
        .buffer_unordered(PROJECT_PROBE_CONCURRENCY)
        .try_collect::<Vec<_>>()
        .await?;
        Ok(ProbeSource {
            host_id: LOCAL_HOST_ID.to_owned(),
            probes: sources
                .into_iter()
                .flat_map(|source| source.probes)
                .collect(),
        })
    }
}

use thiserror::Error;

use crate::host_registry::HostRegistryError;
use crate::projects::{ProjectCatalog, ProjectCatalogError};
use crate::workspace_ports::{WorkspacePortClassification, WorkspacePortsRegistry};
use crate::worktrees::{WorktreeCatalog, WorktreeCatalogError};

use super::label::{LOOPBACK_HOSTS, normalize_hostname};

// Why: Targets must be loopback or known worktree listeners so the byte relay cannot become an open SSRF proxy.
pub(super) const LOCAL_HOST_ID: &str = "local";

#[derive(Clone)]
pub(super) struct TargetAuthority {
    ports: WorkspacePortsRegistry,
    projects: ProjectCatalog,
    worktrees: WorktreeCatalog,
}

#[derive(Debug, Error)]
pub(crate) enum TargetValidationError {
    #[error(transparent)]
    Host(#[from] HostRegistryError),
    #[error(transparent)]
    Project(#[from] ProjectCatalogError),
    #[error(transparent)]
    Worktree(#[from] WorktreeCatalogError),
    #[error("localhost label target is not an allowed workspace port")]
    NotAllowed,
}

impl TargetAuthority {
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

    pub(super) async fn assert_allowed(
        &self,
        target_host: &str,
        target_port: u16,
    ) -> Result<(), TargetValidationError> {
        let normalized = normalize_hostname(target_host);
        if LOOPBACK_HOSTS.contains(&normalized.as_str()) {
            return Ok(());
        }
        let probes = self.local_probes().await?;
        let workspace_ports = self.ports.for_host(LOCAL_HOST_ID).await?;
        let scan = workspace_ports.scan(&probes, None).await;
        let allowed = scan.ports.iter().any(|candidate| {
            candidate.port == target_port && port_matches_host(candidate, &normalized)
        });
        if allowed {
            Ok(())
        } else {
            Err(TargetValidationError::NotAllowed)
        }
    }

    // Why: mirrors `getStoreWorkspacePortProbes` called with no `repoId` —
    // every local-host worktree is eligible, since the caller-supplied
    // `repoId`/`worktreeId` on the route are only used for labeling, never
    // to narrow which live ports count as "known".
    async fn local_probes(
        &self,
    ) -> Result<Vec<crate::workspace_ports::WorkspacePortProbe>, TargetValidationError> {
        let projects = self.projects.list().await?;
        let mut probes = Vec::new();
        for project in projects
            .into_iter()
            .filter(|project| project.execution_host_id == LOCAL_HOST_ID)
        {
            let source = self.worktrees.port_probes_for_project(&project).await?;
            probes.extend(source.probes);
        }
        Ok(probes)
    }
}

fn port_matches_host(
    candidate: &crate::workspace_ports::WorkspacePort,
    normalized_target_host: &str,
) -> bool {
    if normalize_hostname(&candidate.connect_host) == normalized_target_host {
        return true;
    }
    let WorkspacePortClassification::Workspace { advertised_url, .. } = &candidate.classification
    else {
        return false;
    };
    advertised_url
        .as_deref()
        .and_then(|url| url::Url::parse(url).ok())
        .and_then(|url| url.host_str().map(normalize_hostname))
        .is_some_and(|host| host == normalized_target_host)
}

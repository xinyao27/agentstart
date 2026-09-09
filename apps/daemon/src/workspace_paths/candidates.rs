use std::collections::HashMap;
use std::sync::Arc;

use crate::host_registry::HostRegistry;
use crate::hosts::{ExecutionHost, HostFilesystem, HostKind};
use crate::projects::ProjectCatalog;
use crate::worktrees::WorktreeCatalog;

use super::WorkspacePathError;
use super::containment::{contains, equivalent};

pub(super) struct Candidate {
    pub(super) authority_id: String,
    pub(super) host: Arc<dyn ExecutionHost>,
    pub(super) root: String,
}

impl Candidate {
    pub(super) fn is_local(&self) -> bool {
        self.host.kind() == HostKind::Local
    }
}

pub(super) async fn collect(
    projects: &ProjectCatalog,
    worktrees: &WorktreeCatalog,
    registry: &HostRegistry,
    target_path: &str,
) -> Result<Vec<Candidate>, WorkspacePathError> {
    let projects = projects.list().await?;
    let mut hosts = HashMap::<String, Arc<dyn ExecutionHost>>::new();
    let mut candidates = Vec::new();
    for project in projects {
        let host = match hosts.get(&project.execution_host_id) {
            Some(host) => host.clone(),
            None => {
                let host = registry.execution_host(&project.execution_host_id).await?;
                hosts.insert(project.execution_host_id.clone(), host.clone());
                host
            }
        };
        push(
            &mut candidates,
            target_path,
            format!("{}::{}", project.id, project.path),
            host.clone(),
            project.path.clone(),
        );
        if let Some(base) = project.worktree_base_path.as_deref() {
            let paths = HostFilesystem::new(host.clone()).paths();
            let root = if paths.is_absolute(base) {
                paths.resolve(base, &[])
            } else {
                paths.resolve(&project.path, &[base])
            };
            push(
                &mut candidates,
                target_path,
                format!("{}::worktree-root", project.id),
                host.clone(),
                root,
            );
        }
        if let Ok(probes) = worktrees.port_probes_for_project(&project).await {
            for probe in probes.probes {
                push(
                    &mut candidates,
                    target_path,
                    probe.worktree_id,
                    host.clone(),
                    probe.path,
                );
            }
        }
    }
    Ok(candidates)
}

fn push(
    candidates: &mut Vec<Candidate>,
    target_path: &str,
    authority_id: String,
    host: Arc<dyn ExecutionHost>,
    root: String,
) {
    let filesystem = HostFilesystem::new(host.clone());
    let paths = filesystem.paths();
    if paths.is_absolute(target_path)
        && contains(&paths, host.platform(), &root, target_path)
        && !candidates.iter().any(|candidate| {
            candidate.authority_id == authority_id
                && candidate.host.id() == host.id()
                && equivalent(&paths, host.platform(), &candidate.root, &root)
        })
    {
        candidates.push(Candidate {
            authority_id,
            host,
            root,
        });
    }
}

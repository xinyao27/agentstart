use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use crate::host_registry::{HostRegistry, HostRegistryError};
use crate::hosts::{ExecutionHost, HostCommand, HostPlatform};
use crate::projects::{GitRemoteIdentity, remotes};

use super::import_model::{PreparedImport, PreparedImportProject, ProjectGroupImportInput};
use super::{NestedRepoScan, NestedRepoScanError, NestedRepoScanOptions, NestedRepoScans};

const INVALID_REPO: &str = "Not a valid git repository";
const OUTSIDE_SCAN: &str = "Repository was not found in the nested repo scan result";

pub(super) async fn prepare(
    scans: &NestedRepoScans,
    hosts: &HostRegistry,
    input: ProjectGroupImportInput,
) -> Result<PreparedImport, ProjectGroupImportError> {
    let scan = match input
        .scan_id
        .as_deref()
        .and_then(|id| scans.completed(id, &input.parent_path))
    {
        Some(scan) => scan,
        None => {
            scans
                .scan(
                    input.parent_path.clone(),
                    None,
                    NestedRepoScanOptions {
                        timeout_ms: Some(15_000),
                        ..NestedRepoScanOptions::default()
                    },
                )
                .await?
        }
    };
    let host = hosts.execution_host("local").await?;
    let (selected, rejected) = selection(&scan, input.project_paths, host.platform());
    let mut projects = rejected
        .into_iter()
        .map(|path| PreparedImportProject {
            import_path: None,
            order: 0.0,
            path,
            rejection: Some(OUTSIDE_SCAN),
            remotes: Vec::new(),
        })
        .collect::<Vec<_>>();
    let mut target_cache: HashMap<String, String> = HashMap::new();
    for (order, path) in selected.iter().enumerate() {
        if !crate::projects::is_git_repository(host.clone(), path).await {
            projects.push(PreparedImportProject {
                import_path: None,
                order: order as f64,
                path: path.clone(),
                rejection: Some(INVALID_REPO),
                remotes: Vec::new(),
            });
            continue;
        }
        let key = normalized(path, host.platform());
        let import_path = match target_cache.get(&key) {
            Some(path) => path.clone(),
            None => {
                let target = resolve_import_target(host.clone(), path)
                    .await
                    .unwrap_or_else(|| path.clone());
                target_cache.insert(key, target.clone());
                target
            }
        };
        projects.push(PreparedImportProject {
            remotes: read_remotes(host.as_ref(), &import_path).await,
            import_path: Some(import_path),
            order: order as f64,
            path: path.clone(),
            rejection: None,
        });
    }
    Ok(PreparedImport {
        expected_revision: input.expected_revision,
        group_name: input.group_name,
        mode: input.mode,
        parent_path: input.parent_path,
        projects,
        scope_paths: selected,
    })
}

fn selection(
    scan: &NestedRepoScan,
    requested: Vec<String>,
    platform: HostPlatform,
) -> (Vec<String>, Vec<String>) {
    let candidates = scan
        .repos
        .iter()
        .map(|repo| (normalized(&repo.path, platform), repo.path.clone()))
        .collect::<HashMap<_, _>>();
    let mut selected = Vec::new();
    let mut rejected = Vec::new();
    let mut seen = HashSet::new();
    for path in requested {
        let key = normalized(&path, platform);
        if !seen.insert(key.clone()) {
            continue;
        }
        match candidates.get(&key) {
            Some(canonical) => selected.push(canonical.clone()),
            None => rejected.push(path),
        }
    }
    (selected, rejected)
}

async fn resolve_import_target(host: Arc<dyn ExecutionHost>, path: &str) -> Option<String> {
    let output = run_git(host.as_ref(), path, ["worktree", "list", "--porcelain"]).await?;
    let blocks = output.split("\n\n").collect::<Vec<_>>();
    let paths = blocks
        .iter()
        .filter_map(|block| worktree_path(block))
        .collect::<Vec<_>>();
    let selected = normalized(path, host.platform());
    if !paths
        .iter()
        .any(|candidate| normalized(candidate, host.platform()) == selected)
    {
        return None;
    }
    let main = blocks.first()?;
    (!main.lines().any(|line| line == "bare"))
        .then(|| worktree_path(main))
        .flatten()
}

fn worktree_path(block: &str) -> Option<String> {
    block
        .lines()
        .find_map(|line| line.strip_prefix("worktree ").map(str::to_owned))
}

async fn read_remotes(host: &dyn ExecutionHost, cwd: &str) -> Vec<GitRemoteIdentity> {
    let Some(names) = run_git(host, cwd, ["remote"]).await else {
        return Vec::new();
    };
    let mut identities = Vec::new();
    for name in names.lines().map(str::trim).filter(|name| !name.is_empty()) {
        let Some(urls) = run_git(host, cwd, ["remote", "get-url", "--all", name]).await else {
            return Vec::new();
        };
        identities.extend(
            urls.lines()
                .map(str::trim)
                .filter(|url| !url.is_empty())
                .filter_map(|url| remotes::normalize(name, url)),
        );
    }
    identities
}

async fn run_git(
    host: &dyn ExecutionHost,
    cwd: &str,
    args: impl IntoIterator<Item = impl Into<String>>,
) -> Option<String> {
    let mut command = HostCommand::new("git", args);
    command.cwd = Some(cwd.to_owned());
    command.max_output_bytes = Some(4 * 1024 * 1024);
    command.timeout_ms = Some(5_000);
    let output = host.exec(command).await.ok()?;
    (output.exit_code == 0).then_some(output.stdout)
}

fn normalized(path: &str, platform: HostPlatform) -> String {
    let value = path.replace('\\', "/").trim_end_matches('/').to_owned();
    if platform == HostPlatform::Windows {
        value.to_lowercase()
    } else {
        value
    }
}

#[derive(Debug, thiserror::Error)]
pub(crate) enum ProjectGroupImportError {
    #[error(transparent)]
    Catalog(#[from] crate::projects::ProjectCatalogError),
    #[error(transparent)]
    Host(#[from] HostRegistryError),
    #[error(transparent)]
    Scan(#[from] NestedRepoScanError),
}

use std::sync::Arc;

use crate::host_registry::HostRegistry;
use crate::hosts::{ExecutionHost, HostCommand, HostFileKind, HostFilesystem};
use crate::worktrees::WorktreeCatalog;

use super::TerminalSessionError;

pub(super) struct TerminalScope {
    pub(super) branch: String,
    pub(super) host: Arc<dyn ExecutionHost>,
    pub(super) host_id: Option<String>,
    pub(super) path: String,
    pub(super) worktree_id: String,
}

pub(super) struct TerminalCwd {
    pub(super) fallback: Option<String>,
    pub(super) path: String,
}

pub(super) async fn resolve(
    selector: &str,
    worktrees: &WorktreeCatalog,
    hosts: &HostRegistry,
) -> Result<TerminalScope, TerminalSessionError> {
    let probe = worktrees.resolve_selector(selector).await?;
    let host = hosts.execution_host(&probe.host_id).await?;
    let branch = branch(host.clone(), &probe.path).await;
    let host_id = (probe.host_id != "local").then_some(probe.host_id);
    Ok(TerminalScope {
        branch,
        host,
        host_id,
        path: probe.path,
        worktree_id: probe.worktree_id,
    })
}

async fn branch(host: Arc<dyn ExecutionHost>, cwd: &str) -> String {
    let mut command = HostCommand::new("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
    command.cwd = Some(cwd.to_owned());
    command.max_output_bytes = Some(64 * 1_024);
    command.timeout_ms = Some(3_000);
    host.exec(command)
        .await
        .ok()
        .filter(|output| output.exit_code == 0)
        .map(|output| output.stdout.trim().to_owned())
        .filter(|value| !value.is_empty())
        .unwrap_or_default()
}

pub(super) async fn resolve_cwd(
    host: Arc<dyn ExecutionHost>,
    root: &str,
    requested: Option<String>,
    may_fallback: bool,
) -> Result<TerminalCwd, TerminalSessionError> {
    let Some(requested) = requested.filter(|value| !value.trim().is_empty()) else {
        return Ok(TerminalCwd {
            fallback: None,
            path: root.to_owned(),
        });
    };
    let filesystem = HostFilesystem::new(host);
    let requested = requested.trim();
    let resolved = filesystem.paths().resolve(root, &[requested]);
    if may_fallback
        && resolved != root
        && !is_directory(&filesystem, &resolved).await?
        && is_directory(&filesystem, root).await?
    {
        return Ok(TerminalCwd {
            fallback: Some(root.to_owned()),
            path: root.to_owned(),
        });
    }
    Ok(TerminalCwd {
        fallback: None,
        path: resolved,
    })
}

async fn is_directory(
    filesystem: &HostFilesystem,
    path: &str,
) -> Result<bool, TerminalSessionError> {
    Ok(filesystem
        .stat(path)
        .await?
        .is_some_and(|stat| stat.kind == HostFileKind::Directory))
}

use std::collections::BTreeSet;

use serde_json::Value;

use crate::hosts::{HostFileKind, HostFilesystem, HostRemoveOptions};

use super::super::authority::WorktreeAuthorityError;
use super::super::catalog::ResolvedWorktree;

pub(in crate::worktrees) async fn known_links(
    filesystem: &HostFilesystem,
    worktree: &ResolvedWorktree,
    repo: &Value,
) -> Result<Vec<String>, WorktreeAuthorityError> {
    let mut configured = BTreeSet::new();
    if let Some(paths) = repo.get("symlinkPaths").and_then(Value::as_array) {
        configured.extend(paths.iter().filter_map(Value::as_str).map(str::to_owned));
    }
    let config_path = filesystem
        .paths()
        .join(&[&worktree.repo_path, "agentstart.yaml"]);
    if let Some(text) = filesystem.read_text(&config_path, 1_024 * 1_024).await?
        && let Ok(value) = serde_saphyr::from_str::<Value>(&text)
        && let Some(paths) = value
            .pointer("/worktree/sharedDirectories")
            .and_then(Value::as_array)
    {
        configured.extend(paths.iter().filter_map(Value::as_str).map(str::to_owned));
    }
    let mut links = Vec::new();
    for path in configured.into_iter().take(1_024) {
        let path = path.replace('\\', "/");
        if path.is_empty()
            || path.starts_with('/')
            || path.contains(':')
            || path
                .split('/')
                .any(|part| part.is_empty() || matches!(part, "." | ".."))
        {
            continue;
        }
        if is_link(filesystem, &worktree.path, &path).await? {
            links.push(path);
        }
    }
    Ok(links)
}

async fn is_link(
    filesystem: &HostFilesystem,
    root: &str,
    relative: &str,
) -> Result<bool, WorktreeAuthorityError> {
    let mut current = root.to_owned();
    let mut parts = relative.split('/').peekable();
    while let Some(part) = parts.next() {
        current = filesystem.paths().join(&[&current, part]);
        let Some(stat) = filesystem.stat(&current).await? else {
            return Ok(false);
        };
        let expected = if parts.peek().is_some() {
            HostFileKind::Directory
        } else {
            HostFileKind::Symlink
        };
        if stat.kind != expected {
            return Ok(false);
        }
    }
    Ok(true)
}

pub(in crate::worktrees) async fn unlink(
    filesystem: &HostFilesystem,
    worktree: &ResolvedWorktree,
    links: &[String],
) -> Result<(), WorktreeAuthorityError> {
    for link in links {
        if !is_link(filesystem, &worktree.path, link).await? {
            return Err(WorktreeAuthorityError::Operation(
                "Workspace shared link changed during deletion. Retry deletion.".to_owned(),
            ));
        }
        filesystem
            .remove(
                &filesystem.paths().join(&[&worktree.path, link]),
                HostRemoveOptions {
                    force: false,
                    recursive: false,
                },
            )
            .await?;
    }
    Ok(())
}

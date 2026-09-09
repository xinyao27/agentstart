mod shared_links;

use crate::hosts::HostFilesystem;

use super::authority::WorktreeAuthorityError;
use super::catalog::{ResolvedWorktree, WorktreeCatalog};

pub(super) use shared_links::{known_links, unlink};

#[derive(Clone)]
pub(super) enum Registration {
    Registered(super::git_scan::GitWorktreeEntry),
    Missing,
}

pub(super) async fn registration(
    catalog: &WorktreeCatalog,
    filesystem: &HostFilesystem,
    worktree: &ResolvedWorktree,
) -> Result<Registration, WorktreeAuthorityError> {
    let entries = catalog.scan_registration(worktree).await?;
    let paths = filesystem.paths();
    let entry = entries
        .iter()
        .find(|entry| paths.equal(&entry.path, &worktree.path));
    if let Some(entry) = entry {
        if entry.is_main_worktree || paths.equal(&worktree.path, &worktree.repo_path) {
            return Err(operation("Cannot delete the project root workspace."));
        }
        if let Some(reason) = &entry.lock_reason {
            let detail = if reason.trim().is_empty() {
                String::new()
            } else {
                format!(" Lock reason: {}.", reason.trim())
            };
            return Err(operation(format!(
                "Worktree is locked by Git.{detail} Run git worktree unlock <worktree-path> from its repository, then retry deletion."
            )));
        }
        return Ok(Registration::Registered(entry.clone()));
    }
    if filesystem.stat(&worktree.path).await?.is_some() {
        return Err(operation(
            "Worktree is no longer registered with Git but its directory remains. Manual recovery is required.",
        ));
    }
    if !catalog.has_persisted_worktree(worktree).await? {
        return Err(operation(
            "Worktree registration is missing and no persisted workspace record authorizes cleanup.",
        ));
    }
    Ok(Registration::Missing)
}

pub(super) async fn clean(
    catalog: &WorktreeCatalog,
    worktree: &ResolvedWorktree,
    ignored_links: &[String],
) -> Result<(), WorktreeAuthorityError> {
    let output = catalog
        .git_at(
            &worktree.host_id,
            &worktree.path,
            ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
        )
        .await?;
    if output.exit_code != 0 {
        return Err(operation(format!(
            "Worktree removal preflight failed: {}",
            output.stderr.trim()
        )));
    }
    if output
        .stdout
        .split('\0')
        .filter(|entry| !entry.is_empty())
        .all(|entry| {
            entry
                .strip_prefix("?? ")
                .is_some_and(|path| ignored_links.iter().any(|known| known == path))
        })
    {
        Ok(())
    } else {
        Err(operation("Worktree has uncommitted or untracked changes."))
    }
}

fn operation(message: impl Into<String>) -> WorktreeAuthorityError {
    WorktreeAuthorityError::Operation(message.into())
}

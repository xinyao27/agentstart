use serde_json::json;

use crate::hosts::{ExecutionHost, HostFilesystem};

use super::AgentTrustError;
use super::atomic::{canonical_entry, replace};
use super::clock::iso_timestamp;

const GIT_FILE_MAX_BYTES: usize = 64 * 1_024;

pub(super) async fn mark_cursor_trusted(
    filesystem: &HostFilesystem,
    host: &dyn ExecutionHost,
    workspace_path: &str,
) -> Result<(), AgentTrustError> {
    let workspace_path = canonical_entry(filesystem, host, workspace_path).await;
    let slug = cursor_slug(&workspace_path);
    if slug.is_empty() {
        return Ok(());
    }
    let home = filesystem
        .home_directory()
        .await?
        .ok_or(AgentTrustError::HomeUnavailable)?;
    let trust_directory = filesystem
        .paths()
        .join(&[&home, ".cursor", "projects", &slug]);
    let trust_file = filesystem
        .paths()
        .join(&[&trust_directory, ".workspace-trusted"]);
    if filesystem.exists(&trust_file).await? {
        return Ok(());
    }
    let contents = serde_json::to_vec_pretty(&json!({
        "trustedAt": iso_timestamp()?,
        "workspacePath": workspace_path
    }))?;
    let mut contents = contents;
    contents.push(b'\n');
    replace(filesystem, host, &trust_file, &contents).await
}

pub(super) async fn resolve_codex_root(
    filesystem: &HostFilesystem,
    host: &dyn ExecutionHost,
    workspace_path: &str,
) -> String {
    let workspace = canonical_entry(filesystem, host, workspace_path).await;
    resolve_linked_worktree(filesystem, host, &workspace)
        .await
        .unwrap_or(workspace)
}

async fn resolve_linked_worktree(
    filesystem: &HostFilesystem,
    host: &dyn ExecutionHost,
    workspace: &str,
) -> Option<String> {
    let paths = filesystem.paths();
    let workspace_git_file = paths.join(&[workspace, ".git"]);
    let reference = filesystem
        .read_text(&workspace_git_file, GIT_FILE_MAX_BYTES)
        .await
        .ok()??;
    let git_directory_reference = reference.trim();
    let git_directory_path = git_directory_reference.strip_prefix("gitdir:")?.trim();
    if git_directory_path.is_empty() {
        return None;
    }
    let git_directory = paths.resolve(workspace, &[git_directory_path]);
    let worktrees_directory = paths.dirname(&git_directory);
    if paths.basename(&worktrees_directory) != "worktrees" {
        return None;
    }
    let common_git_directory = paths.dirname(&worktrees_directory);
    // Why: bare repositories also use <repo>/worktrees/<name>. Only a validated
    // .git/worktrees layout may broaden Codex trust to the repository root.
    if paths.basename(&common_git_directory) != ".git" {
        return None;
    }
    let backlink_path = paths.join(&[&git_directory, "gitdir"]);
    let backlink = filesystem
        .read_text(&backlink_path, GIT_FILE_MAX_BYTES)
        .await
        .ok()??;
    let backlink = backlink.trim();
    if backlink.is_empty() {
        return None;
    }
    let resolved_backlink = paths.resolve(&git_directory, &[backlink]);
    let backlinks_match = resolved_backlink == workspace_git_file
        || canonical_entry(filesystem, host, &resolved_backlink).await
            == canonical_entry(filesystem, host, &workspace_git_file).await;
    if !backlinks_match {
        return None;
    }
    Some(canonical_entry(filesystem, host, &paths.dirname(&common_git_directory)).await)
}

fn cursor_slug(path: &str) -> String {
    path.trim_start_matches(['/', '\\'])
        .chars()
        .map(|character| {
            if matches!(
                character,
                '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|'
            ) {
                '-'
            } else {
                character
            }
        })
        .collect()
}

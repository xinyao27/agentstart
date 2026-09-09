use super::authority::WorktreeAuthorityError;
use super::catalog::WorktreeCatalog;

pub(super) async fn can_reuse(
    catalog: &WorktreeCatalog,
    host_id: &str,
    repo_path: &str,
    branch: &str,
    base: &str,
) -> Result<bool, WorktreeAuthorityError> {
    let local_ref = format!("refs/heads/{branch}^{{commit}}");
    let local = catalog
        .git_at(
            host_id,
            repo_path,
            ["rev-parse", "--verify", "--quiet", &local_ref],
        )
        .await?;
    if local.exit_code == 1 {
        return Ok(false);
    }
    if local.exit_code != 0 || local.stdout.trim().is_empty() {
        return Err(operation("Could not resolve the existing local branch."));
    }
    if base.strip_prefix("refs/heads/").unwrap_or(base) != branch {
        let base_ref = format!("{base}^{{commit}}");
        let base_head = catalog
            .git_at(
                host_id,
                repo_path,
                ["rev-parse", "--verify", "--quiet", &base_ref],
            )
            .await?;
        if base_head.exit_code != 0 || base_head.stdout.trim().is_empty() {
            return Err(operation("Could not resolve the requested base commit."));
        }
        if base_head.stdout.trim() != local.stdout.trim() {
            return Err(conflict(branch));
        }
    }
    let entries = catalog.scan_git_worktrees(host_id, repo_path).await?;
    if entries.iter().any(|entry| {
        entry
            .branch
            .strip_prefix("refs/heads/")
            .unwrap_or(&entry.branch)
            == branch
    }) {
        return Err(conflict(branch));
    }
    Ok(true)
}

fn conflict(branch: &str) -> WorktreeAuthorityError {
    operation(format!("Branch \"{branch}\" already exists locally."))
}

fn operation(message: impl Into<String>) -> WorktreeAuthorityError {
    WorktreeAuthorityError::Operation(message.into())
}

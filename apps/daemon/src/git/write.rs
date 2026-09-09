use serde_json::{Value, json};

use super::runner::{GitError, GitRunner};
use super::scope::{GitAuthority, GitAuthorityError};
use super::status::detect_conflict;

const OPERATION_IN_PROGRESS: &str =
    "A merge, rebase, cherry-pick, or revert is already in progress in this worktree.";

impl GitAuthority {
    pub(crate) async fn checkout_branch(
        &self,
        worktree: &str,
        branch: &str,
    ) -> Result<Value, GitAuthorityError> {
        let scope = self.scope(worktree).await?;
        let _cache = self.begin_read_cache_invalidation();
        scope
            .runner
            .checked(strings(["checkout", branch, "--"]))
            .await?;
        Ok(json!({ "ok": true, "branch": branch }))
    }

    pub(crate) async fn add_tag(
        &self,
        worktree: &str,
        commit: &str,
        name: &str,
        message: Option<&str>,
        force: bool,
    ) -> Result<Value, GitAuthorityError> {
        let scope = self.scope(worktree).await?;
        let _cache = self.begin_read_cache_invalidation();
        if !valid_ref(
            &scope.runner,
            "--allow-onelevel",
            &format!("refs/tags/{name}"),
        )
        .await
        {
            return Ok(blocked(
                "invalid_name",
                format!("\"{name}\" is not a valid tag name."),
            ));
        }
        let Some(commit_oid) = resolve_commit(&scope.runner, commit).await else {
            return Ok(invalid_commit(commit));
        };
        if !force && ref_exists(&scope.runner, &format!("refs/tags/{name}")).await {
            return Ok(blocked(
                "name_exists",
                format!("Tag \"{name}\" already exists."),
            ));
        }
        let mut args = strings(["tag"]);
        if force {
            args.push("--force".to_owned());
        }
        if let Some(message) = message {
            args.extend(strings(["-a", name, &commit_oid, "-m", message]));
        } else {
            args.extend(strings([name, &commit_oid]));
        }
        Ok(write_result(
            scope.runner.checked(args).await,
            json!({ "status": "ok", "tag": name }),
        ))
    }

    pub(crate) async fn create_branch(
        &self,
        worktree: &str,
        commit: &str,
        name: &str,
        checkout: bool,
    ) -> Result<Value, GitAuthorityError> {
        let scope = self.scope(worktree).await?;
        let _cache = self.begin_read_cache_invalidation();
        if !valid_ref(&scope.runner, "", &format!("refs/heads/{name}")).await {
            return Ok(blocked(
                "invalid_name",
                format!("\"{name}\" is not a valid branch name."),
            ));
        }
        let Some(commit_oid) = resolve_commit(&scope.runner, commit).await else {
            return Ok(invalid_commit(commit));
        };
        if ref_exists(&scope.runner, &format!("refs/heads/{name}")).await {
            return Ok(blocked(
                "name_exists",
                format!("Branch \"{name}\" already exists."),
            ));
        }
        if checkout && dirty(&scope.runner).await {
            return Ok(blocked(
                "dirty_working_tree",
                "Commit or discard your changes before checking out the new branch.",
            ));
        }
        if let Err(error) = scope
            .runner
            .checked(strings(["branch", name, &commit_oid]))
            .await
        {
            return Ok(error_result(error));
        }
        if checkout
            && let Err(error) = scope
                .runner
                .checked(strings(["checkout", name, "--"]))
                .await
        {
            return Ok(error_result(error));
        }
        Ok(json!({ "status": "ok", "branch": name, "checkedOut": checkout }))
    }

    pub(crate) async fn checkout_commit(
        &self,
        worktree: &str,
        commit: &str,
    ) -> Result<Value, GitAuthorityError> {
        let scope = self.scope(worktree).await?;
        let _cache = self.begin_read_cache_invalidation();
        if detect_conflict(&scope.runner).await != "unknown" {
            return Ok(blocked("operation_in_progress", OPERATION_IN_PROGRESS));
        }
        if dirty(&scope.runner).await {
            return Ok(blocked(
                "dirty_working_tree",
                "Commit or discard your changes before checking out a different commit.",
            ));
        }
        let Some(commit_oid) = resolve_commit(&scope.runner, commit).await else {
            return Ok(invalid_commit(commit));
        };
        Ok(write_result(
            scope
                .runner
                .checked(strings(["checkout", &commit_oid, "--"]))
                .await,
            json!({ "status": "ok", "commit": commit_oid }),
        ))
    }

    pub(crate) async fn cherry_pick(
        &self,
        worktree: &str,
        commit: &str,
        mainline: Option<u8>,
    ) -> Result<Value, GitAuthorityError> {
        let scope = self.scope(worktree).await?;
        let _cache = self.begin_read_cache_invalidation();
        if let Some(result) =
            write_precondition(&scope.runner, commit, "cherry-picking", false).await
        {
            return Ok(result);
        }
        let commit_oid = resolve_commit(&scope.runner, commit)
            .await
            .unwrap_or_default();
        if let Some(result) = validate_mainline(&scope.runner, &commit_oid, mainline).await {
            return Ok(result);
        }
        let mut args = strings(["cherry-pick", "--no-edit"]);
        if let Some(mainline) = mainline {
            args.extend(["-m".to_owned(), mainline.to_string()]);
        }
        args.push(commit_oid);
        Ok(conflictable(&scope.runner, args, "cherry-pick").await)
    }

    pub(crate) async fn revert_commit(
        &self,
        worktree: &str,
        commit: &str,
        mainline: Option<u8>,
    ) -> Result<Value, GitAuthorityError> {
        let scope = self.scope(worktree).await?;
        let _cache = self.begin_read_cache_invalidation();
        if let Some(result) = write_precondition(&scope.runner, commit, "reverting", false).await {
            return Ok(result);
        }
        let commit_oid = resolve_commit(&scope.runner, commit)
            .await
            .unwrap_or_default();
        if let Some(result) = validate_mainline(&scope.runner, &commit_oid, mainline).await {
            return Ok(result);
        }
        let mut args = strings(["revert", "--no-edit"]);
        if let Some(mainline) = mainline {
            args.extend(["-m".to_owned(), mainline.to_string()]);
        }
        args.push(commit_oid);
        Ok(conflictable(&scope.runner, args, "revert").await)
    }

    pub(crate) async fn merge_commit(
        &self,
        worktree: &str,
        commit: &str,
        no_ff: bool,
        squash: bool,
        message: Option<&str>,
    ) -> Result<Value, GitAuthorityError> {
        let scope = self.scope(worktree).await?;
        let _cache = self.begin_read_cache_invalidation();
        if let Some(result) = write_precondition(&scope.runner, commit, "merging", true).await {
            return Ok(result);
        }
        let commit_oid = resolve_commit(&scope.runner, commit)
            .await
            .unwrap_or_default();
        if squash {
            if let Err(error) = scope
                .runner
                .checked(strings(["merge", "--squash", &commit_oid]))
                .await
            {
                let paths = unmerged_paths(&scope.runner).await;
                return Ok(if paths.is_empty() {
                    error_result(error)
                } else {
                    json!({ "status": "conflicts", "paths": paths })
                });
            }
            let commit_args = message.map_or_else(
                || strings(["commit", "--no-edit"]),
                |message| strings(["commit", "-m", message]),
            );
            return Ok(write_result(
                scope.runner.checked(commit_args).await,
                json!({ "status": "ok" }),
            ));
        }
        let mut args = strings(["merge"]);
        if no_ff {
            args.push("--no-ff".to_owned());
        }
        match message {
            Some(message) => args.extend(strings(["-m", message])),
            None => args.push("--no-edit".to_owned()),
        }
        args.push(commit_oid);
        Ok(conflictable(&scope.runner, args, "merge").await)
    }

    pub(crate) async fn drop_commit(
        &self,
        worktree: &str,
        commit: &str,
    ) -> Result<Value, GitAuthorityError> {
        let scope = self.scope(worktree).await?;
        let _cache = self.begin_read_cache_invalidation();
        if let Some(result) =
            write_precondition(&scope.runner, commit, "dropping a commit", true).await
        {
            return Ok(result);
        }
        let commit_oid = resolve_commit(&scope.runner, commit)
            .await
            .unwrap_or_default();
        match parent_count(&scope.runner, &commit_oid).await {
            0 => Ok(blocked(
                "invalid_commit",
                "This is the repository's first commit — it has no parent to rebase onto.",
            )),
            1 => {
                let parent = format!("{commit_oid}^");
                Ok(conflictable(
                    &scope.runner,
                    strings(["rebase", "--onto", &parent, &commit_oid]),
                    "rebase",
                )
                .await)
            }
            _ => Ok(blocked(
                "merge_commit_not_droppable",
                "This is a merge commit — dropping it this way would silently discard one parent history.",
            )),
        }
    }

    pub(crate) async fn rebase_onto(
        &self,
        worktree: &str,
        commit: &str,
    ) -> Result<Value, GitAuthorityError> {
        let scope = self.scope(worktree).await?;
        let _cache = self.begin_read_cache_invalidation();
        if let Some(result) = write_precondition(&scope.runner, commit, "rebasing", true).await {
            return Ok(result);
        }
        let commit_oid = resolve_commit(&scope.runner, commit)
            .await
            .unwrap_or_default();
        Ok(conflictable(&scope.runner, strings(["rebase", &commit_oid]), "rebase").await)
    }

    pub(crate) async fn reset_to_commit(
        &self,
        worktree: &str,
        commit: &str,
        mode: &str,
    ) -> Result<Value, GitAuthorityError> {
        let scope = self.scope(worktree).await?;
        let _cache = self.begin_read_cache_invalidation();
        if detect_conflict(&scope.runner).await != "unknown" {
            return Ok(blocked("operation_in_progress", OPERATION_IN_PROGRESS));
        }
        if !has_head(&scope.runner).await {
            return Ok(blocked(
                "unborn_head",
                "This branch has no commits yet, so there is nothing to reset.",
            ));
        }
        if mode == "hard" && dirty(&scope.runner).await {
            return Ok(blocked(
                "dirty_working_tree",
                "Commit or discard your changes before a hard reset — it discards uncommitted work.",
            ));
        }
        let Some(commit_oid) = resolve_commit(&scope.runner, commit).await else {
            return Ok(invalid_commit(commit));
        };
        Ok(write_result(
            scope
                .runner
                .checked(vec!["reset".to_owned(), format!("--{mode}"), commit_oid])
                .await,
            json!({ "status": "ok" }),
        ))
    }
}

pub(super) async fn resolve_commit(runner: &GitRunner, commit: &str) -> Option<String> {
    runner
        .checked(strings([
            "rev-parse",
            "--verify",
            "--end-of-options",
            &format!("{commit}^{{commit}}"),
        ]))
        .await
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

pub(super) async fn dirty(runner: &GitRunner) -> bool {
    runner
        .read(strings([
            "status",
            "--porcelain",
            "--untracked-files=normal",
        ]))
        .await
        .is_ok_and(|output| !output.trim().is_empty())
}

async fn write_precondition(
    runner: &GitRunner,
    commit: &str,
    action: &str,
    require_branch: bool,
) -> Option<Value> {
    if detect_conflict(runner).await != "unknown" {
        return Some(blocked("operation_in_progress", OPERATION_IN_PROGRESS));
    }
    if require_branch && current_branch(runner).await.is_none() {
        return Some(blocked(
            "detached_head",
            format!("Check out a branch before {action} — HEAD is currently detached."),
        ));
    }
    if dirty(runner).await {
        return Some(blocked(
            "dirty_working_tree",
            format!("Commit or discard your changes before {action}."),
        ));
    }
    if resolve_commit(runner, commit).await.is_none() {
        return Some(invalid_commit(commit));
    }
    None
}

async fn current_branch(runner: &GitRunner) -> Option<String> {
    runner
        .checked(strings(["symbolic-ref", "--quiet", "--short", "HEAD"]))
        .await
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

async fn has_head(runner: &GitRunner) -> bool {
    runner
        .checked(strings(["rev-parse", "--verify", "HEAD^{commit}"]))
        .await
        .is_ok()
}

async fn parent_count(runner: &GitRunner, commit: &str) -> usize {
    runner
        .checked(strings(["rev-list", "--parents", "-n", "1", commit]))
        .await
        .ok()
        .map_or(0, |line| line.split_whitespace().count().saturating_sub(1))
}

async fn validate_mainline(
    runner: &GitRunner,
    commit: &str,
    mainline: Option<u8>,
) -> Option<Value> {
    let parents = parent_count(runner, commit).await;
    if parents >= 2 && mainline.is_none() {
        Some(blocked(
            "merge_commit_requires_mainline",
            "This commit has multiple parents. Choose the mainline parent to apply.",
        ))
    } else if parents < 2 && mainline.is_some() {
        Some(blocked(
            "not_a_merge_commit",
            "A mainline parent can only be used with a merge commit.",
        ))
    } else if mainline.is_some_and(|mainline| usize::from(mainline) > parents) {
        Some(blocked(
            "not_a_merge_commit",
            "The selected mainline parent does not exist on this commit.",
        ))
    } else {
        None
    }
}

async fn conflictable(runner: &GitRunner, args: Vec<String>, expected: &str) -> Value {
    match runner.checked(args).await {
        Ok(_) => json!({ "status": "ok" }),
        Err(error) => {
            let paths = unmerged_paths(runner).await;
            if !paths.is_empty() && detect_conflict(runner).await == expected {
                json!({ "status": "conflicts", "paths": paths })
            } else {
                error_result(error)
            }
        }
    }
}

async fn unmerged_paths(runner: &GitRunner) -> Vec<String> {
    runner
        .read(strings(["diff", "--name-only", "--diff-filter=U"]))
        .await
        .ok()
        .into_iter()
        .flat_map(|output| output.lines().map(str::to_owned).collect::<Vec<_>>())
        .filter(|path| !path.is_empty())
        .collect()
}

async fn valid_ref(runner: &GitRunner, option: &str, name: &str) -> bool {
    let mut args = strings(["check-ref-format"]);
    if !option.is_empty() {
        args.push(option.to_owned());
    }
    args.push(name.to_owned());
    runner.checked(args).await.is_ok()
}

async fn ref_exists(runner: &GitRunner, name: &str) -> bool {
    runner
        .checked(strings(["show-ref", "--verify", "--quiet", name]))
        .await
        .is_ok()
}

fn blocked(reason: &str, message: impl Into<String>) -> Value {
    json!({ "status": "blocked", "reason": reason, "message": message.into() })
}

fn invalid_commit(commit: &str) -> Value {
    blocked(
        "invalid_commit",
        format!("{commit} does not name a commit in this repository."),
    )
}

fn error_result(error: GitError) -> Value {
    json!({ "status": "error", "message": error.to_string() })
}

fn write_result(result: Result<String, GitError>, success: Value) -> Value {
    result.map_or_else(error_result, |_| success)
}

fn strings<const N: usize>(values: [&str; N]) -> Vec<String> {
    values.into_iter().map(str::to_owned).collect()
}

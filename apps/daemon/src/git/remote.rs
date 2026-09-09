use serde_json::{Value, json};

use super::runner::{GitRunOptions, GitRunner};
use super::scope::{GitAuthority, GitAuthorityError};
use super::upstream::{configured_push_target, resolve_effective};
use super::write::resolve_commit;

const REMOTE_TIMEOUT_MS: u64 = 300_000;
const FORK_SYNC_TIMEOUT_MS: u64 = 60_000;

#[derive(Clone)]
pub(crate) struct GitPushTarget {
    pub(crate) branch_name: String,
    pub(crate) remote_name: String,
    pub(crate) remote_url: Option<String>,
}

impl GitAuthority {
    pub(crate) async fn fetch(
        &self,
        worktree: &str,
        target: Option<&GitPushTarget>,
    ) -> Result<Value, GitAuthorityError> {
        let scope = self.scope(worktree).await?;
        let _cache = self.begin_read_cache_invalidation();
        let mut args = strings(["fetch", "--prune"]);
        if let Some(target) = target {
            validate_target(&scope.runner, target).await?;
            args.push(target.remote_name.clone());
        }
        checked_remote(&scope.runner, args, "fetch").await?;
        Ok(json!({ "ok": true }))
    }

    pub(crate) async fn pull(
        &self,
        worktree: &str,
        target: Option<&GitPushTarget>,
        fast_forward: bool,
    ) -> Result<Value, GitAuthorityError> {
        let scope = self.scope(worktree).await?;
        let _cache = self.begin_read_cache_invalidation();
        let mut args = strings(["pull"]);
        if fast_forward {
            args.push("--ff-only".to_owned());
        }
        if let Some(target) = target {
            validate_target(&scope.runner, target).await?;
            args.extend([target.remote_name.clone(), target.branch_name.clone()]);
        } else if let Some(upstream) = resolve_effective(&scope.runner).await?
            && !upstream.configured
            && let Some(remote) = upstream.remote_name
        {
            args.extend([remote, upstream.branch_name]);
        }
        let result = checked_remote(&scope.runner, args.clone(), "pull").await;
        if !fast_forward
            && result.as_ref().is_err_and(|error| {
                error
                    .to_string()
                    .contains("Need to specify how to reconcile divergent branches")
            })
        {
            args.insert(1, "--no-rebase".to_owned());
            checked_remote(&scope.runner, args, "pull").await?;
        } else {
            result?;
        }
        Ok(json!({ "ok": true }))
    }

    pub(crate) async fn push(
        &self,
        worktree: &str,
        target: Option<&GitPushTarget>,
        _publish: bool,
        force_with_lease: bool,
    ) -> Result<Value, GitAuthorityError> {
        let scope = self.scope(worktree).await?;
        let _cache = self.begin_read_cache_invalidation();
        let mut args = strings(["push"]);
        if force_with_lease {
            args.push("--force-with-lease".to_owned());
        }
        args.push("--set-upstream".to_owned());
        if let Some(target) = target {
            validate_target(&scope.runner, target).await?;
            args.extend([
                target.remote_name.clone(),
                format!("HEAD:{}", target.branch_name),
            ]);
        } else if let Some(target) = configured_push_target(&scope.runner).await {
            args.extend([target.remote, target.refspec]);
        } else {
            args.extend(strings(["origin", "HEAD"]));
        }
        checked_remote(&scope.runner, args, "push").await?;
        Ok(json!({ "ok": true }))
    }

    pub(crate) async fn rebase_from_base(
        &self,
        worktree: &str,
        base_ref: &str,
    ) -> Result<Value, GitAuthorityError> {
        let scope = self.scope(worktree).await?;
        let _cache = self.begin_read_cache_invalidation();
        let normalized = base_ref
            .trim()
            .strip_prefix("refs/remotes/")
            .or_else(|| base_ref.trim().strip_prefix("remotes/"))
            .unwrap_or(base_ref.trim());
        let remotes = scope.runner.checked(strings(["remote"])).await?;
        let mut names = remotes
            .lines()
            .map(str::trim)
            .filter(|name| !name.is_empty())
            .collect::<Vec<_>>();
        names.sort_by_key(|name| std::cmp::Reverse(name.len()));
        let Some(remote) = names
            .into_iter()
            .find(|remote| normalized.starts_with(&format!("{remote}/")))
        else {
            return Err(GitAuthorityError::Operation(
                "Choose a remote base branch to rebase from.".to_owned(),
            ));
        };
        let branch = &normalized[remote.len() + 1..];
        validate_branch(&scope.runner, branch).await?;
        checked_remote(
            &scope.runner,
            strings(["pull", "--rebase", remote, branch]),
            "pull",
        )
        .await?;
        Ok(json!({ "ok": true }))
    }

    pub(crate) async fn fork_sync(
        &self,
        worktree: &str,
        owner: &str,
        repo: &str,
    ) -> Result<Value, GitAuthorityError> {
        let scope = self.scope(worktree).await?;
        let _cache = self.begin_read_cache_invalidation();
        let base = json!({ "originRemote": "origin", "upstreamRemote": "upstream", "ahead": 0, "behind": 0 });
        let remotes = scope.runner.checked(strings(["remote"])).await?;
        if !remotes.lines().any(|remote| remote.trim() == "origin") {
            return Ok(with_status(
                base,
                "blocked",
                Some("missing-origin"),
                None,
                0,
                0,
            ));
        }
        if !remotes.lines().any(|remote| remote.trim() == "upstream") {
            return Ok(with_status(
                base,
                "blocked",
                Some("missing-upstream"),
                None,
                0,
                0,
            ));
        }
        let upstream_url = scope
            .runner
            .checked(strings(["remote", "get-url", "upstream"]))
            .await
            .unwrap_or_default();
        if github_identity(&upstream_url).as_deref()
            != Some(&format!("{}/{}", owner.to_lowercase(), repo.to_lowercase()))
        {
            return Ok(with_status(
                base,
                "blocked",
                Some("upstream-mismatch"),
                None,
                0,
                0,
            ));
        }
        let branch = remote_default_branch(&scope.runner, "upstream").await;
        let Some(branch) = branch else {
            return Ok(with_status(
                base,
                "blocked",
                Some("missing-upstream-default-branch"),
                None,
                0,
                0,
            ));
        };
        validate_branch(&scope.runner, &branch).await?;
        if !fetch_branch(&scope.runner, "upstream", &branch).await {
            return Ok(with_status(
                base,
                "blocked",
                Some("missing-upstream-default-branch"),
                Some(&branch),
                0,
                0,
            ));
        }
        if !fetch_branch(&scope.runner, "origin", &branch).await {
            return Ok(with_status(
                base,
                "blocked",
                Some("missing-origin-branch"),
                Some(&branch),
                0,
                0,
            ));
        }
        let origin_ref = format!("refs/remotes/origin/{branch}");
        let upstream_ref = format!("refs/remotes/upstream/{branch}");
        let Some(origin_oid) = resolve_commit(&scope.runner, &origin_ref).await else {
            return Ok(with_status(
                base,
                "blocked",
                Some("missing-origin-branch"),
                Some(&branch),
                0,
                0,
            ));
        };
        let Some(upstream_oid) = resolve_commit(&scope.runner, &upstream_ref).await else {
            return Ok(with_status(
                base,
                "blocked",
                Some("missing-upstream-default-branch"),
                Some(&branch),
                0,
                0,
            ));
        };
        let counts = scope
            .runner
            .checked(strings([
                "rev-list",
                "--left-right",
                "--count",
                &format!("{origin_oid}...{upstream_oid}"),
            ]))
            .await?;
        let (ahead, behind) = ahead_behind(&counts)?;
        let ancestor = scope
            .runner
            .run(
                strings(["merge-base", "--is-ancestor", &origin_oid, &upstream_oid]),
                fork_options(),
            )
            .await?
            .exit_code
            == 0;
        if ahead > 0 || !ancestor {
            return Ok(with_status(
                base,
                "blocked",
                Some("diverged"),
                Some(&branch),
                ahead,
                behind,
            ));
        }
        if behind == 0 {
            return Ok(with_status(
                base,
                "up-to-date",
                None,
                Some(&branch),
                ahead,
                behind,
            ));
        }
        checked_fork(
            &scope.runner,
            strings([
                "push",
                "origin",
                &format!("{upstream_oid}:refs/heads/{branch}"),
            ]),
        )
        .await?;
        let _ = fetch_branch(&scope.runner, "origin", &branch).await;
        Ok(with_status(
            base,
            "synced",
            None,
            Some(&branch),
            ahead,
            behind,
        ))
    }
}

pub(super) async fn validate_target(
    runner: &GitRunner,
    target: &GitPushTarget,
) -> Result<(), GitAuthorityError> {
    if !safe_remote_name(&target.remote_name) {
        return Err(GitAuthorityError::Operation(format!(
            "Invalid git remote name: {}",
            target.remote_name
        )));
    }
    if target.branch_name.is_empty() || target.branch_name.starts_with('-') {
        return Err(GitAuthorityError::Operation(format!(
            "Invalid git branch name: {}",
            target.branch_name
        )));
    }
    if target
        .remote_url
        .as_deref()
        .is_some_and(|value| !safe_github_remote_url(value))
    {
        return Err(GitAuthorityError::Operation(
            "Invalid PR push target remote URL.".to_owned(),
        ));
    }
    validate_branch(runner, &target.branch_name).await
}

fn safe_remote_name(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 100
        && value.split('/').all(|segment| {
            !segment.is_empty()
                && !matches!(segment, "." | "..")
                && segment.bytes().enumerate().all(|(index, byte)| {
                    byte.is_ascii_alphanumeric()
                        || (index > 0 && matches!(byte, b'.' | b'_' | b'-'))
                })
        })
}

fn safe_github_remote_url(value: &str) -> bool {
    let path = value
        .strip_prefix("https://github.com/")
        .or_else(|| value.strip_prefix("git@github.com:"));
    let Some(path) = path.and_then(|path| path.strip_suffix(".git")) else {
        return false;
    };
    let mut parts = path.split('/');
    let (Some(owner), Some(repo), None) = (parts.next(), parts.next(), parts.next()) else {
        return false;
    };
    [owner, repo].into_iter().all(|part| {
        !part.is_empty()
            && part
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'.' | b'-'))
    })
}

async fn validate_branch(runner: &GitRunner, branch: &str) -> Result<(), GitAuthorityError> {
    runner
        .checked(strings(["check-ref-format", "--branch", branch]))
        .await?;
    Ok(())
}

async fn checked_remote(
    runner: &GitRunner,
    args: Vec<String>,
    operation: &str,
) -> Result<String, GitAuthorityError> {
    runner
        .checked_with_options(
            args,
            GitRunOptions {
                max_output_bytes: 10 * 1_024 * 1_024,
                timeout_ms: Some(REMOTE_TIMEOUT_MS),
            },
        )
        .await
        .map_err(|error| {
            GitAuthorityError::Operation(normalize_remote_error(&error.to_string(), operation))
        })
}

async fn checked_fork(runner: &GitRunner, args: Vec<String>) -> Result<String, GitAuthorityError> {
    runner
        .checked_with_options(args, fork_options())
        .await
        .map_err(GitAuthorityError::from)
}

fn fork_options() -> GitRunOptions {
    GitRunOptions {
        max_output_bytes: 10 * 1_024 * 1_024,
        timeout_ms: Some(FORK_SYNC_TIMEOUT_MS),
    }
}

async fn fetch_branch(runner: &GitRunner, remote: &str, branch: &str) -> bool {
    checked_fork(
        runner,
        vec![
            "fetch".to_owned(),
            "--no-tags".to_owned(),
            "--prune".to_owned(),
            remote.to_owned(),
            format!("+refs/heads/{branch}:refs/remotes/{remote}/{branch}"),
        ],
    )
    .await
    .is_ok()
}

async fn remote_default_branch(runner: &GitRunner, remote: &str) -> Option<String> {
    if let Ok(output) =
        checked_fork(runner, strings(["ls-remote", "--symref", remote, "HEAD"])).await
    {
        for line in output.lines() {
            if let Some(branch) = line
                .trim()
                .strip_prefix("ref: refs/heads/")
                .and_then(|value| value.strip_suffix("\tHEAD"))
            {
                return Some(branch.to_owned());
            }
        }
    }
    for branch in ["main", "master"] {
        if resolve_commit(runner, &format!("refs/remotes/{remote}/{branch}"))
            .await
            .is_some()
        {
            return Some(branch.to_owned());
        }
    }
    None
}

fn ahead_behind(output: &str) -> Result<(u64, u64), GitAuthorityError> {
    let mut values = output.split_whitespace();
    let ahead = values
        .next()
        .and_then(|value| value.parse().ok())
        .ok_or_else(|| {
            GitAuthorityError::Operation(format!("Unexpected git rev-list output: {output:?}"))
        })?;
    let behind = values
        .next()
        .and_then(|value| value.parse().ok())
        .ok_or_else(|| {
            GitAuthorityError::Operation(format!("Unexpected git rev-list output: {output:?}"))
        })?;
    if values.next().is_some() {
        return Err(GitAuthorityError::Operation(format!(
            "Unexpected git rev-list output: {output:?}"
        )));
    }
    Ok((ahead, behind))
}

fn with_status(
    mut base: Value,
    status: &str,
    reason: Option<&str>,
    branch: Option<&str>,
    ahead: u64,
    behind: u64,
) -> Value {
    base["status"] = Value::String(status.to_owned());
    base["ahead"] = json!(ahead);
    base["behind"] = json!(behind);
    if let Some(reason) = reason {
        base["reason"] = Value::String(reason.to_owned());
    }
    if let Some(branch) = branch {
        base["branchName"] = Value::String(branch.to_owned());
    }
    base
}

fn github_identity(url: &str) -> Option<String> {
    let trimmed = url.trim().trim_end_matches('/').trim_end_matches(".git");
    let path = if let Some(path) = trimmed.strip_prefix("git@github.com:") {
        path
    } else {
        trimmed.split("github.com/").nth(1)?
    };
    let parts = path.trim_matches('/').split('/').collect::<Vec<_>>();
    (parts.len() == 2).then(|| format!("{}/{}", parts[0].to_lowercase(), parts[1].to_lowercase()))
}

fn normalize_remote_error(error: &str, operation: &str) -> String {
    let sanitized = redact_url_credentials(error);
    let raw = sanitized
        .lines()
        .rev()
        .find(|line| !line.trim().is_empty())
        .unwrap_or(&sanitized)
        .trim();
    if operation == "push"
        && (sanitized.contains("non-fast-forward") || sanitized.contains("fetch first"))
    {
        "Push rejected: remote has newer commits (non-fast-forward). Please pull or sync first."
            .to_owned()
    } else if sanitized.contains("Authentication failed")
        || sanitized.contains("could not read Username")
    {
        "Authentication failed. Check your remote credentials.".to_owned()
    } else if sanitized.contains("Could not resolve host")
        || sanitized.contains("Network is unreachable")
    {
        "Network error. Check your connection.".to_owned()
    } else {
        raw.to_owned()
    }
}

fn redact_url_credentials(message: &str) -> String {
    let mut output = String::with_capacity(message.len());
    let mut remaining = message;
    while let Some(scheme_end) = remaining.find("://") {
        let after_scheme = scheme_end + 3;
        let authority_end = remaining[after_scheme..]
            .find(|character: char| character == '/' || character.is_whitespace())
            .map_or(remaining.len(), |index| after_scheme + index);
        let authority = &remaining[after_scheme..authority_end];
        let Some(at) = authority.rfind('@') else {
            output.push_str(&remaining[..after_scheme]);
            remaining = &remaining[after_scheme..];
            continue;
        };
        let scheme_start = remaining[..scheme_end]
            .rfind(|character: char| {
                !character.is_ascii_alphanumeric() && !matches!(character, '+' | '.' | '-')
            })
            .map_or(0, |index| index + 1);
        let scheme = &remaining[scheme_start..scheme_end];
        let user_info = &authority[..at];
        let should_redact = user_info.contains(':')
            || scheme.eq_ignore_ascii_case("http")
            || scheme.eq_ignore_ascii_case("https");
        if !should_redact {
            output.push_str(&remaining[..authority_end]);
            remaining = &remaining[authority_end..];
            continue;
        }
        output.push_str(&remaining[..after_scheme]);
        remaining = &remaining[after_scheme + at + 1..];
    }
    output.push_str(remaining);
    output
}

fn strings<const N: usize>(values: [&str; N]) -> Vec<String> {
    values.into_iter().map(str::to_owned).collect()
}

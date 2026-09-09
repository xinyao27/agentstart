use serde_json::{Value, json};

use super::super::reads::{append_repo, slug};
use super::super::{GitHubAuthority, GitHubContext, GitHubError, GitHubRepository};

pub(super) struct BranchState {
    pub(super) branch: String,
    pub(super) ahead: u64,
    pub(super) behind: u64,
    pub(super) has_upstream: bool,
}

pub(super) async fn inspect(
    authority: &GitHubAuthority,
    context: &GitHubContext,
) -> Result<BranchState, GitHubError> {
    let branch = authority
        .git(context, ["rev-parse", "--abbrev-ref", "HEAD"], 10_000)
        .await?
        .trim()
        .to_owned();
    let upstream = authority
        .git(
            context,
            [
                "rev-parse",
                "--abbrev-ref",
                "--symbolic-full-name",
                "@{upstream}",
            ],
            10_000,
        )
        .await;
    let has_upstream = upstream.is_ok();
    let (ahead, behind) = if has_upstream {
        authority
            .git(
                context,
                ["rev-list", "--left-right", "--count", "HEAD...@{upstream}"],
                10_000,
            )
            .await
            .ok()
            .and_then(|value| parse_counts(&value))
            .unwrap_or((0, 0))
    } else {
        (0, 0)
    };
    Ok(BranchState {
        branch,
        ahead,
        behind,
        has_upstream,
    })
}

pub(super) async fn existing_review(
    authority: &GitHubAuthority,
    context: &GitHubContext,
    repository: &GitHubRepository,
    branch: &str,
    base: &str,
) -> Option<Value> {
    let mut args = vec![
        "pr".to_owned(),
        "list".to_owned(),
        "--head".to_owned(),
        branch.to_owned(),
        "--base".to_owned(),
        base.to_owned(),
        "--state".to_owned(),
        "open".to_owned(),
        "--limit".to_owned(),
        "2".to_owned(),
        "--json".to_owned(),
        "number,url".to_owned(),
    ];
    append_repo(&mut args, Some(repository));
    let raw = authority.gh_json(context, args, 30_000).await.ok()?;
    let items = raw.as_array()?;
    (items.len() == 1).then(|| items[0].clone())
}

pub(super) async fn base_exists(
    authority: &GitHubAuthority,
    context: &GitHubContext,
    base: &str,
) -> bool {
    let pattern = format!("refs/remotes/*/{base}");
    match authority
        .git(
            context,
            ["for-each-ref", "--count=1", "--format=%(refname)", &pattern],
            10_000,
        )
        .await
    {
        Ok(value) => !value.trim().is_empty(),
        Err(_) => true,
    }
}

pub(super) async fn default_base(
    authority: &GitHubAuthority,
    context: &GitHubContext,
) -> Option<String> {
    let remote_head = authority
        .git(
            context,
            ["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"],
            10_000,
        )
        .await
        .ok();
    if let Some(reference) = remote_head {
        return Some(
            reference
                .trim()
                .strip_prefix("refs/remotes/origin/")
                .unwrap_or(reference.trim())
                .to_owned(),
        );
    }
    for branch in ["main", "master"] {
        if authority
            .git(
                context,
                [
                    "show-ref",
                    "--verify",
                    "--quiet",
                    &format!("refs/remotes/origin/{branch}"),
                ],
                10_000,
            )
            .await
            .is_ok()
        {
            return Some(branch.to_owned());
        }
    }
    None
}

pub(super) async fn authenticated(
    authority: &GitHubAuthority,
    context: &GitHubContext,
    host: Option<&str>,
) -> bool {
    authority
        .gh(
            context,
            [
                "auth".to_owned(),
                "status".to_owned(),
                "--hostname".to_owned(),
                host.unwrap_or("github.com").to_owned(),
            ],
            10_000,
        )
        .await
        .is_ok()
}

pub(super) fn validate(
    state: &BranchState,
    requested_head: Option<&str>,
    base: &str,
    dirty: bool,
) -> Option<Value> {
    if requested_head.is_some_and(|head| head != state.branch) {
        return Some(error(
            "validation",
            "Create PR failed: switch back to the selected branch before creating a pull request.",
        ));
    }
    if state.branch.is_empty() || state.branch == "HEAD" {
        return Some(error(
            "validation",
            "Create PR failed: switch to a branch before creating a pull request.",
        ));
    }
    if state.branch.eq_ignore_ascii_case(base) {
        return Some(error(
            "validation",
            "Create PR failed: choose a feature branch before creating a pull request.",
        ));
    }
    if dirty {
        return Some(error(
            "validation",
            "Create PR failed: commit or discard local changes before creating a pull request.",
        ));
    }
    if !state.has_upstream {
        return Some(error(
            "validation",
            "Create PR failed: publish this branch before creating a pull request.",
        ));
    }
    if state.behind > 0 {
        return Some(error(
            "validation",
            "Create PR failed: sync this branch before creating a pull request.",
        ));
    }
    if state.ahead > 0 {
        return Some(error(
            "validation",
            "Create PR failed: push this branch before creating a pull request.",
        ));
    }
    None
}

pub(super) fn already_exists(review: &Value) -> Value {
    json!({
        "ok": false,
        "code": "already_exists",
        "error": "A pull request already exists for this branch.",
        "existingReview": {
            "number": review.get("number"),
            "url": review.get("url")
        }
    })
}

pub(super) fn repo_label(repository: &GitHubRepository) -> String {
    slug(repository)
}

fn parse_counts(value: &str) -> Option<(u64, u64)> {
    let mut fields = value.split_whitespace();
    Some((fields.next()?.parse().ok()?, fields.next()?.parse().ok()?))
}

fn error(code: &str, message: &str) -> Value {
    json!({ "ok": false, "code": code, "error": message })
}

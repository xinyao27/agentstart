use super::prompt::CommitContext;
use super::{PullRequestContext, PullRequestGenerationInput};
use crate::git::runner::{GitError, GitRunOptions, GitRunner};
use crate::hosts::HostFilesystem;

const CONTEXT_LIMIT: usize = 10 * 1_024 * 1_024;

pub(super) async fn staged(runner: &GitRunner) -> Result<Option<CommitContext>, GitError> {
    let branch = safe(runner, strings(&["branch", "--show-current"])).await;
    let summary = required(
        runner,
        strings(&["diff", "--cached", "--name-status", "--no-ext-diff"]),
    )
    .await?;
    let patch = match runner
        .checked_with_options(
            strings(&[
                "diff",
                "--cached",
                "--patch",
                "--minimal",
                "--no-color",
                "--no-ext-diff",
            ]),
            GitRunOptions {
                max_output_bytes: CONTEXT_LIMIT,
                timeout_ms: Some(120_000),
            },
        )
        .await
    {
        Ok(value) => value.trim().to_owned(),
        Err(GitError::OutputLimit) => String::new(),
        Err(error) => return Err(error),
    };
    if summary.trim().is_empty() && patch.is_empty() {
        return Ok(None);
    }
    Ok(Some(CommitContext {
        branch: nonempty(branch),
        patch,
        summary: summary.trim().to_owned(),
    }))
}

pub(super) async fn pull_request(
    runner: &GitRunner,
    input: &PullRequestGenerationInput,
) -> Result<Option<PullRequestContext>, String> {
    let base = input.base.trim();
    if base.is_empty() || base.starts_with('-') {
        return Ok(None);
    }
    let comparison_base = prepare_base(runner, base).await?;
    let branch = nonempty(safe(runner, strings(&["branch", "--show-current"])).await);
    let merge_base = safe(
        runner,
        vec!["merge-base".to_owned(), comparison_base, "HEAD".to_owned()],
    )
    .await;
    if merge_base.is_empty() {
        return Ok(None);
    }
    let range = format!("{}..HEAD", merge_base.trim());
    let commits = safe(
        runner,
        vec![
            "log".to_owned(),
            "--pretty=format:- %s".to_owned(),
            "--max-count=50".to_owned(),
            range.clone(),
        ],
    )
    .await;
    let changes = safe(
        runner,
        vec!["diff".to_owned(), "--name-status".to_owned(), range.clone()],
    )
    .await;
    let patch = safe_with_limit(
        runner,
        vec![
            "diff".to_owned(),
            "--patch".to_owned(),
            "--minimal".to_owned(),
            "--no-color".to_owned(),
            "--no-ext-diff".to_owned(),
            range,
        ],
    )
    .await;
    if commits.is_empty() && changes.is_empty() && patch.is_empty() {
        return Ok(None);
    }
    let body = resolve_body(runner, input).await;
    Ok(Some(PullRequestContext {
        base: base.to_owned(),
        body,
        branch,
        changes,
        commits,
        draft: input.draft,
        patch,
        title: input.title.clone(),
    }))
}

async fn resolve_body(runner: &GitRunner, input: &PullRequestGenerationInput) -> String {
    if input.use_template != Some(true) || !input.body.trim().is_empty() {
        return input.body.clone();
    }
    let filesystem = HostFilesystem::new(runner.host.clone());
    for candidate in [
        ".github/pull_request_template.md",
        ".github/PULL_REQUEST_TEMPLATE.md",
        "pull_request_template.md",
        "PULL_REQUEST_TEMPLATE.md",
        "docs/pull_request_template.md",
        "docs/PULL_REQUEST_TEMPLATE.md",
    ] {
        let path = filesystem.paths().resolve(&runner.cwd, &[candidate]);
        if let Ok(Some(content)) = filesystem.read_text(&path, CONTEXT_LIMIT).await {
            return content;
        }
    }
    String::new()
}

async fn prepare_base(runner: &GitRunner, base: &str) -> Result<String, String> {
    let remotes = split_lines(&safe(runner, strings(&["remote"])).await);
    let refs = split_lines(
        &safe(
            runner,
            strings(&["for-each-ref", "--format=%(refname:short)", "refs/remotes"]),
        )
        .await,
    )
    .into_iter()
    .filter(|value| !value.ends_with("/HEAD"))
    .collect::<Vec<_>>();
    let (comparison, fetch) = resolve_base(base, &remotes, &refs);
    if let Some((remote, branch)) = fetch {
        runner
            .checked_with_options(
                vec![
                    "fetch".to_owned(),
                    "--no-tags".to_owned(),
                    remote.clone(),
                    format!("+refs/heads/{branch}:refs/remotes/{remote}/{branch}"),
                ],
                GitRunOptions {
                    max_output_bytes: CONTEXT_LIMIT,
                    timeout_ms: Some(120_000),
                },
            )
            .await
            .map_err(|error| format!("Fetch before generating PR details failed: {error}"))?;
    }
    Ok(comparison)
}

fn resolve_base(
    base: &str,
    remotes: &[String],
    refs: &[String],
) -> (String, Option<(String, String)>) {
    if let Some(target) = parse_remote(base, remotes) {
        return (base.to_owned(), Some(target));
    }
    if refs.iter().any(|candidate| candidate == base) {
        return (base.to_owned(), parse_remote_loose(base));
    }
    for remote in ["origin", "upstream"] {
        let candidate = format!("{remote}/{base}");
        if remotes.iter().any(|value| value == remote)
            || refs.iter().any(|value| value == &candidate)
        {
            return (candidate, Some((remote.to_owned(), base.to_owned())));
        }
    }
    let matches = refs
        .iter()
        .filter(|value| value.ends_with(&format!("/{base}")))
        .collect::<Vec<_>>();
    if matches.len() == 1 {
        return (matches[0].clone(), parse_remote_loose(matches[0]));
    }
    (base.to_owned(), None)
}

fn parse_remote(value: &str, remotes: &[String]) -> Option<(String, String)> {
    let mut remotes = remotes.to_vec();
    remotes.sort_by_key(|value| std::cmp::Reverse(value.len()));
    remotes.into_iter().find_map(|remote| {
        value
            .strip_prefix(&format!("{remote}/"))
            .filter(|branch| !branch.is_empty())
            .map(|branch| (remote, branch.to_owned()))
    })
}

fn parse_remote_loose(value: &str) -> Option<(String, String)> {
    let (remote, branch) = value.split_once('/')?;
    (!remote.is_empty() && !branch.is_empty()).then(|| (remote.to_owned(), branch.to_owned()))
}

async fn required(runner: &GitRunner, args: Vec<String>) -> Result<String, GitError> {
    runner
        .checked_with_options(
            args,
            GitRunOptions {
                max_output_bytes: CONTEXT_LIMIT,
                timeout_ms: Some(120_000),
            },
        )
        .await
}

async fn safe(runner: &GitRunner, args: Vec<String>) -> String {
    runner
        .checked_with_options(
            args,
            GitRunOptions {
                max_output_bytes: CONTEXT_LIMIT,
                timeout_ms: Some(120_000),
            },
        )
        .await
        .unwrap_or_default()
        .trim()
        .to_owned()
}

async fn safe_with_limit(runner: &GitRunner, args: Vec<String>) -> String {
    safe(runner, args).await
}

fn nonempty(value: String) -> Option<String> {
    (!value.is_empty()).then_some(value)
}
fn split_lines(value: &str) -> Vec<String> {
    value
        .lines()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
        .collect()
}
fn strings(values: &[&str]) -> Vec<String> {
    values.iter().map(|value| (*value).to_owned()).collect()
}

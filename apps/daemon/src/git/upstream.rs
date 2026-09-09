use std::time::{Duration, Instant};

use serde_json::{Value, json};

use super::remote::{GitPushTarget, validate_target};
use super::runner::{GitError, GitRunOptions, GitRunner};
use super::scope::{
    GitAuthority, GitAuthorityError, GitScope, UpstreamNegativeCacheEntry,
    UpstreamResolvedCacheEntry, lock,
};

const NEGATIVE_CACHE_TTL: Duration = Duration::from_secs(5 * 60);
const NEGATIVE_CACHE_LIMIT: usize = 512;
const RESOLVED_CACHE_TTL: Duration = Duration::from_secs(60);
const RESOLVED_CACHE_LIMIT: usize = 512;

#[derive(Clone)]
pub(super) struct EffectiveUpstream {
    pub(super) branch_name: String,
    pub(super) configured: bool,
    pub(super) remote_name: Option<String>,
    pub(super) upstream_name: String,
}

pub(super) struct ConfiguredPushTarget {
    pub(super) refspec: String,
    pub(super) remote: String,
}

impl GitAuthority {
    pub(crate) async fn upstream_status(
        &self,
        worktree: &str,
        target: Option<&GitPushTarget>,
    ) -> Result<Value, GitAuthorityError> {
        let scope = self.scope(worktree).await?;
        status(&scope.runner, target).await
    }
}

pub(super) async fn status(
    runner: &GitRunner,
    target: Option<&GitPushTarget>,
) -> Result<Value, GitAuthorityError> {
    if let Some(target) = target {
        validate_target(runner, target).await?;
        let name = format!("{}/{}", target.remote_name, target.branch_name);
        let remote_ref = format!("refs/remotes/{}/{}", target.remote_name, target.branch_name);
        let exists = runner
            .run(
                strings(["rev-parse", "--verify", "--quiet", &remote_ref]),
                GitRunOptions::default(),
            )
            .await?;
        if exists.exit_code == 1 && exists.stderr.trim().is_empty() {
            return Ok(json!({
                "hasUpstream": false, "upstreamName": name, "ahead": 0, "behind": 0,
                "hasConfiguredPushTarget": true
            }));
        }
        if exists.exit_code != 0 {
            return Err(super::runner::command_failure(exists).into());
        }
        return status_for_ref(runner, &name, &remote_ref).await;
    }
    let Some(upstream) = resolve_effective(runner).await? else {
        let configured = match current_branch(runner).await {
            Some(branch) => has_configured_push_target(runner, &branch).await,
            None => false,
        };
        let mut output = json!({ "hasUpstream": false, "ahead": 0, "behind": 0 });
        if configured {
            output["hasConfiguredPushTarget"] = Value::Bool(true);
        }
        return Ok(output);
    };
    status_for_name(runner, &upstream.upstream_name).await
}

pub(super) async fn status_for_name(
    runner: &GitRunner,
    upstream_name: &str,
) -> Result<Value, GitAuthorityError> {
    status_for_ref(runner, upstream_name, upstream_name).await
}

async fn status_for_ref(
    runner: &GitRunner,
    upstream_name: &str,
    comparison_ref: &str,
) -> Result<Value, GitAuthorityError> {
    let counts = runner
        .checked(strings([
            "rev-list",
            "--left-right",
            "--count",
            &format!("HEAD...{comparison_ref}"),
        ]))
        .await?;
    let (ahead, behind) = parse_counts(&counts)?;
    let patch_equivalent = if ahead > 0 && behind > 0 {
        runner
            .checked(strings([
                "log",
                "--oneline",
                "--cherry-mark",
                "--right-only",
                &format!("HEAD...{comparison_ref}"),
                "--",
            ]))
            .await
            .ok()
            .map(|output| {
                output
                    .lines()
                    .filter(|line| !line.trim().is_empty())
                    .all(|line| line.starts_with('='))
            })
    } else {
        None
    };
    let mut output = json!({
        "hasUpstream": true,
        "upstreamName": upstream_name,
        "ahead": ahead,
        "behind": behind
    });
    if let Some(value) = patch_equivalent {
        output["behindCommitsArePatchEquivalent"] = Value::Bool(value);
    }
    Ok(output)
}

pub(super) async fn status_for_poll(
    authority: &GitAuthority,
    scope: &GitScope,
    branch: &str,
    parser_upstream: Option<&str>,
    bypass_cache: bool,
) -> Option<Value> {
    if !should_probe(branch, parser_upstream) {
        return None;
    }
    let key = (
        scope.host_id.clone(),
        scope.runner.cwd.clone(),
        branch.to_owned(),
        parser_upstream.unwrap_or_default().to_owned(),
    );
    if !bypass_cache {
        let cached_name = {
            let mut resolved = lock(&authority.resolved_upstream);
            resolved.retain(|_, cached| cached.stored_at.elapsed() < RESOLVED_CACHE_TTL);
            match resolved.get(&key) {
                Some(cached) if cached.stored_at.elapsed() < RESOLVED_CACHE_TTL => {
                    Some(cached.name.clone())
                }
                Some(_) => {
                    resolved.remove(&key);
                    None
                }
                None => None,
            }
        };
        if let Some(name) = cached_name {
            if let Ok(status) = status_for_name(&scope.runner, &name).await {
                return Some(status);
            }
            lock(&authority.resolved_upstream).remove(&key);
        }
        let mut cache = lock(&authority.upstream_negative);
        cache.retain(|_, cached| cached.stored_at.elapsed() < NEGATIVE_CACHE_TTL);
        if let Some(cached) = cache.get(&key) {
            if cached.stored_at.elapsed() < NEGATIVE_CACHE_TTL {
                return Some(cached.status.clone());
            }
            cache.remove(&key);
        }
    } else {
        lock(&authority.resolved_upstream).remove(&key);
    }
    let status = status(&scope.runner, None).await.ok()?;
    if status.get("hasUpstream").and_then(Value::as_bool) == Some(true) {
        if let Some(name) = status.get("upstreamName").and_then(Value::as_str) {
            let mut cache = lock(&authority.resolved_upstream);
            cache.insert(
                key,
                UpstreamResolvedCacheEntry {
                    name: name.to_owned(),
                    stored_at: Instant::now(),
                },
            );
            if cache.len() > RESOLVED_CACHE_LIMIT
                && let Some(oldest) = cache
                    .iter()
                    .min_by_key(|(_, value)| value.stored_at)
                    .map(|(key, _)| key.clone())
            {
                cache.remove(&oldest);
            }
        }
    } else if status.get("hasConfiguredPushTarget").is_none() {
        let mut cache = lock(&authority.upstream_negative);
        cache.insert(
            key,
            UpstreamNegativeCacheEntry {
                status: status.clone(),
                stored_at: Instant::now(),
            },
        );
        if cache.len() > NEGATIVE_CACHE_LIMIT
            && let Some(oldest) = cache
                .iter()
                .min_by_key(|(_, value)| value.stored_at)
                .map(|(key, _)| key.clone())
        {
            cache.remove(&oldest);
        }
    }
    Some(status)
}

fn should_probe(branch: &str, upstream: Option<&str>) -> bool {
    let Some(branch) = branch.strip_prefix("refs/heads/") else {
        return false;
    };
    match upstream {
        None => true,
        Some(value) => value
            .strip_prefix("origin/")
            .is_some_and(|upstream_branch| upstream_branch != branch),
    }
}

pub(super) async fn resolve_effective(
    runner: &GitRunner,
) -> Result<Option<EffectiveUpstream>, GitAuthorityError> {
    let current = current_branch(runner).await;
    let mut configured = configured_upstream(runner).await?;
    if let Some(value) = configured.as_mut()
        && let Some(current) = current.as_deref()
        && value.remote_name.as_deref() == Some("origin")
        && value.branch_name != current
    {
        if value.upstream_name.matches('/').count() > 1
            && let Some((remote, branch)) = split_known_remote(runner, &value.upstream_name).await
        {
            value.remote_name = Some(remote);
            value.branch_name = branch;
        }
        if value.remote_name.as_deref() == Some("origin")
            && value.branch_name != current
            && remote_ref_exists(runner, "origin", current).await
        {
            return Ok(Some(EffectiveUpstream {
                branch_name: current.to_owned(),
                configured: false,
                remote_name: Some("origin".to_owned()),
                upstream_name: format!("origin/{current}"),
            }));
        }
    }
    if configured.is_some() {
        return Ok(configured);
    }
    let Some(current) = current else {
        return Ok(None);
    };
    if let Some(upstream) = configured_branch_remote(runner, &current).await {
        return Ok(Some(upstream));
    }
    Ok(remote_ref_exists(runner, "origin", &current)
        .await
        .then(|| EffectiveUpstream {
            branch_name: current.clone(),
            configured: false,
            remote_name: Some("origin".to_owned()),
            upstream_name: format!("origin/{current}"),
        }))
}

pub(super) async fn configured_push_target(runner: &GitRunner) -> Option<ConfiguredPushTarget> {
    let branch = current_branch(runner).await?;
    let branch_remote = config(runner, &format!("branch.{branch}.remote")).await;
    let remote = config(runner, &format!("branch.{branch}.pushRemote"))
        .await
        .or(config(runner, "remote.pushDefault").await)
        .or(branch_remote.clone())?;
    let merge_ref = config(runner, &format!("branch.{branch}.merge")).await?;
    let branch_ref = merge_ref.strip_prefix("refs/heads/")?;
    if remote == "." || branch_ref.is_empty() {
        return None;
    }
    let remote = normalize_remote(runner, &remote).await;
    let branch_remote = match branch_remote {
        Some(value) => Some(normalize_remote(runner, &value).await),
        None => None,
    };
    let base = config(runner, &format!("branch.{branch}.base")).await;
    if ref_targets_branch_on_remote(base.as_deref(), &remote, branch_ref)
        || (branch_ref != branch
            && (remote == "origin" || branch_remote.as_deref() != Some(remote.as_str())))
    {
        return None;
    }
    Some(ConfiguredPushTarget {
        refspec: format!("HEAD:{branch_ref}"),
        remote,
    })
}

async fn has_configured_push_target(runner: &GitRunner, branch: &str) -> bool {
    let branch_remote = config(runner, &format!("branch.{branch}.remote")).await;
    let remote = config(runner, &format!("branch.{branch}.pushRemote"))
        .await
        .or(config(runner, "remote.pushDefault").await)
        .or(branch_remote.clone());
    let merge_ref = config(runner, &format!("branch.{branch}.merge")).await;
    let (Some(remote), Some(merge_ref)) = (remote, merge_ref) else {
        return false;
    };
    let Some(branch_ref) = merge_ref.strip_prefix("refs/heads/") else {
        return false;
    };
    if remote == "." || branch_ref.is_empty() {
        return false;
    }
    let remote = normalize_remote(runner, &remote).await;
    let branch_remote = match branch_remote {
        Some(value) => Some(normalize_remote(runner, &value).await),
        None => None,
    };
    let base = config(runner, &format!("branch.{branch}.base")).await;
    !ref_targets_branch_on_remote(base.as_deref(), &remote, branch_ref)
        && (branch_ref == branch
            || (remote != "origin" && branch_remote.as_deref() == Some(remote.as_str())))
}

async fn configured_upstream(
    runner: &GitRunner,
) -> Result<Option<EffectiveUpstream>, GitAuthorityError> {
    match runner
        .checked(strings(["rev-parse", "--abbrev-ref", "HEAD@{upstream}"]))
        .await
    {
        Ok(output) => {
            let name = output.trim();
            if name.is_empty() {
                return Ok(None);
            }
            let split = name.split_once('/');
            Ok(Some(EffectiveUpstream {
                branch_name: split.map_or(name, |(_, branch)| branch).to_owned(),
                configured: true,
                remote_name: split.map(|(remote, _)| remote.to_owned()),
                upstream_name: name.to_owned(),
            }))
        }
        Err(error) if is_no_upstream(&error) => Ok(None),
        Err(error) => Err(error.into()),
    }
}

async fn configured_branch_remote(runner: &GitRunner, branch: &str) -> Option<EffectiveUpstream> {
    let remote = config(runner, &format!("branch.{branch}.remote")).await?;
    let merge_ref = config(runner, &format!("branch.{branch}.merge")).await?;
    let branch_name = merge_ref.strip_prefix("refs/heads/")?;
    if remote == "." || branch_name.is_empty() {
        return None;
    }
    let remote = normalize_remote(runner, &remote).await;
    let base = config(runner, &format!("branch.{branch}.base")).await;
    if ref_targets_branch_on_remote(base.as_deref(), &remote, branch_name)
        || !remote_ref_exists(runner, &remote, branch_name).await
    {
        return None;
    }
    Some(EffectiveUpstream {
        upstream_name: format!("{remote}/{branch_name}"),
        branch_name: branch_name.to_owned(),
        configured: false,
        remote_name: Some(remote),
    })
}

async fn current_branch(runner: &GitRunner) -> Option<String> {
    runner
        .checked(strings(["symbolic-ref", "--quiet", "--short", "HEAD"]))
        .await
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

async fn config(runner: &GitRunner, key: &str) -> Option<String> {
    runner
        .checked(vec![
            "config".to_owned(),
            "--get".to_owned(),
            key.to_owned(),
        ])
        .await
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

async fn normalize_remote(runner: &GitRunner, remote: &str) -> String {
    if !url_valued(remote) {
        return remote.to_owned();
    }
    let remotes = runner
        .checked(strings(["remote"]))
        .await
        .unwrap_or_default();
    for name in remotes
        .lines()
        .map(str::trim)
        .filter(|name| !name.is_empty())
    {
        if runner
            .checked(strings(["remote", "get-url", name]))
            .await
            .is_ok_and(|value| value.trim() == remote)
        {
            return name.to_owned();
        }
    }
    remote.to_owned()
}

async fn remote_ref_exists(runner: &GitRunner, remote: &str, branch: &str) -> bool {
    runner
        .checked(vec![
            "rev-parse".to_owned(),
            "--verify".to_owned(),
            "--quiet".to_owned(),
            format!("refs/remotes/{remote}/{branch}"),
        ])
        .await
        .is_ok()
}

async fn split_known_remote(runner: &GitRunner, value: &str) -> Option<(String, String)> {
    let output = runner.checked(strings(["remote"])).await.ok()?;
    output
        .lines()
        .map(str::trim)
        .filter(|remote| !remote.is_empty() && value.starts_with(&format!("{remote}/")))
        .max_by_key(|remote| remote.len())
        .map(|remote| (remote.to_owned(), value[remote.len() + 1..].to_owned()))
}

fn ref_targets_branch_on_remote(value: Option<&str>, remote: &str, branch: &str) -> bool {
    let Some(value) = value.map(str::trim).filter(|value| !value.is_empty()) else {
        return false;
    };
    if matches!(
        value,
        candidate if candidate == format!("{remote}/{branch}")
            || candidate == format!("remotes/{remote}/{branch}")
            || candidate == format!("refs/remotes/{remote}/{branch}")
    ) {
        return true;
    }
    if value.starts_with("refs/remotes/") || value.starts_with("remotes/") {
        return false;
    }
    value.strip_prefix("refs/heads/").unwrap_or(value) == branch
}

fn url_valued(value: &str) -> bool {
    value.contains("://")
        || value
            .split_once('@')
            .is_some_and(|(_, value)| value.contains(':'))
}

fn is_no_upstream(error: &GitError) -> bool {
    let message = error.to_string().to_lowercase();
    message.contains("fatal:")
        && (message.contains("no upstream configured")
            || message.contains("no tracking information")
            || message.contains("head does not point")
            || message.contains("needed a single revision")
            || message.contains("ambiguous argument 'head@{u}'"))
}

fn parse_counts(output: &str) -> Result<(u64, u64), GitAuthorityError> {
    let values = output.split_whitespace().collect::<Vec<_>>();
    if values.len() != 2 {
        return Err(GitAuthorityError::Operation(format!(
            "Unexpected git rev-list output: {output:?}"
        )));
    }
    let ahead = values[0].parse().map_err(|_| {
        GitAuthorityError::Operation(format!("Unparseable git rev-list counts: {output:?}"))
    })?;
    let behind = values[1].parse().map_err(|_| {
        GitAuthorityError::Operation(format!("Unparseable git rev-list counts: {output:?}"))
    })?;
    Ok((ahead, behind))
}

fn strings<const N: usize>(values: [&str; N]) -> Vec<String> {
    values.into_iter().map(str::to_owned).collect()
}

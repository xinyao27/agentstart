use serde_json::{Map, Value, json};
use std::time::{Duration, Instant};

use super::runner::GitRunner;
use super::scope::{GitAuthority, GitAuthorityError};
use super::write::resolve_commit;

const PREFERRED_FORMAT: &str =
    "%H%n%aN%n%aE%n%at%n%ct%n%P%n%(decorate:prefix=,suffix=,separator=%x1f)%n%B";
const FALLBACK_FORMAT: &str = "%H%n%aN%n%aE%n%at%n%ct%n%P%n%D%n%B";
const FORMAT_CACHE_LIMIT: usize = 128;
const FORMAT_CACHE_TTL: Duration = Duration::from_secs(60 * 60);

impl GitAuthority {
    pub(crate) async fn history(
        &self,
        worktree: &str,
        limit: usize,
        skip: usize,
        base_ref: Option<&str>,
        ref_scope: &str,
        include_remote_branches: bool,
    ) -> Result<Value, GitAuthorityError> {
        let scope = self.scope(worktree).await?;
        let Some(head_oid) = resolve_commit(&scope.runner, "HEAD").await else {
            return Ok(
                json!({ "items": [], "hasIncomingChanges": false, "hasOutgoingChanges": false, "hasMore": false, "limit": limit }),
            );
        };
        let (current_ref, branch) = current_ref(&scope.runner, &head_oid).await;
        let remote_ref = match branch.as_deref() {
            Some(branch) => upstream_ref(&scope.runner, branch).await,
            None => None,
        };
        let raw_base = match base_ref.filter(|value| !value.is_empty() && !value.starts_with('-')) {
            Some(value) => named_ref(&scope.runner, value).await,
            None => None,
        };
        let base = raw_base.filter(|value| {
            value.get("id") != remote_ref.as_ref().and_then(|value| value.get("id"))
                && value.get("id") != current_ref.get("id")
        });
        let merge_base = match (
            current_ref.get("revision").and_then(Value::as_str),
            remote_ref
                .as_ref()
                .and_then(|value| value.get("revision"))
                .and_then(Value::as_str),
        ) {
            (Some(current), Some(remote)) if current != remote => scope
                .runner
                .checked(strings(["merge-base", current, remote]))
                .await
                .ok()
                .map(|value| value.trim().to_owned())
                .filter(|value| !value.is_empty()),
            _ => None,
        };
        let mut log_args = vec![
            "-z".to_owned(),
            "--topo-order".to_owned(),
            "--decorate=full".to_owned(),
            format!("-n{}", limit.saturating_add(1)),
        ];
        if skip > 0 {
            log_args.push(format!("--skip={skip}"));
        }
        if ref_scope == "all" {
            log_args.extend(["--branches".to_owned(), "--tags".to_owned()]);
            if include_remote_branches {
                log_args.push("--remotes".to_owned());
            }
            log_args.push("HEAD".to_owned());
        } else {
            log_args.push(head_oid.clone());
        }
        let log = self.history_log(&scope.runner, log_args).await?;
        let mut items = parse_log(&log);
        let has_more = items.len() > limit;
        items.truncate(limit);
        let remote_revision = remote_ref
            .as_ref()
            .and_then(|value| value.get("revision"))
            .and_then(Value::as_str);
        let current_revision = current_ref.get("revision").and_then(Value::as_str);
        let has_incoming = remote_revision
            .is_some_and(|remote| merge_base.as_deref().is_some_and(|base| remote != base));
        let has_outgoing = current_revision
            .is_some_and(|current| merge_base.as_deref().is_some_and(|base| current != base))
            && remote_revision.is_some();
        let mut result = Map::from_iter([
            ("items".to_owned(), Value::Array(items)),
            ("currentRef".to_owned(), current_ref),
            ("hasIncomingChanges".to_owned(), Value::Bool(has_incoming)),
            ("hasOutgoingChanges".to_owned(), Value::Bool(has_outgoing)),
            ("hasMore".to_owned(), Value::Bool(has_more)),
            ("limit".to_owned(), json!(limit)),
        ]);
        if let Some(remote) = remote_ref {
            result.insert("remoteRef".to_owned(), remote);
        }
        if let Some(base) = base {
            result.insert("baseRef".to_owned(), base);
        }
        if let Some(merge_base) = merge_base {
            result.insert("mergeBase".to_owned(), Value::String(merge_base));
        }
        Ok(Value::Object(result))
    }

    async fn history_log(
        &self,
        runner: &GitRunner,
        args: Vec<String>,
    ) -> Result<String, GitAuthorityError> {
        let host_id = runner.host.id().to_owned();
        let supported = {
            let mut cache = super::scope::lock(&self.history_format_support);
            cache.retain(|_, (_, stored_at)| stored_at.elapsed() < FORMAT_CACHE_TTL);
            cache.get(&host_id).map(|(supported, _)| *supported)
        };
        if supported != Some(false) {
            let mut preferred = vec!["log".to_owned(), format!("--format={PREFERRED_FORMAT}")];
            preferred.extend(args.clone());
            match runner.checked(preferred).await {
                Ok(output) if !output.contains("%(decorate") => {
                    remember_format_support(self, host_id, true);
                    return Ok(output);
                }
                _ => {
                    remember_format_support(self, host_id, false);
                }
            }
        }
        let mut fallback = vec!["log".to_owned(), format!("--format={FALLBACK_FORMAT}")];
        fallback.extend(args);
        Ok(runner.checked(fallback).await?)
    }
}

fn remember_format_support(authority: &GitAuthority, host_id: String, supported: bool) {
    let mut cache = super::scope::lock(&authority.history_format_support);
    cache.insert(host_id, (supported, Instant::now()));
    if cache.len() > FORMAT_CACHE_LIMIT
        && let Some(oldest) = cache
            .iter()
            .min_by_key(|(_, (_, stored_at))| *stored_at)
            .map(|(host_id, _)| host_id.clone())
    {
        cache.remove(&oldest);
    }
}

async fn current_ref(runner: &GitRunner, head: &str) -> (Value, Option<String>) {
    let branch = runner
        .checked(strings(["symbolic-ref", "--quiet", "--short", "HEAD"]))
        .await
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty());
    match branch {
        Some(branch) => (
            json!({ "id": format!("refs/heads/{branch}"), "name": branch, "revision": head, "category": "branches" }),
            Some(branch),
        ),
        None => (
            json!({ "id": head, "name": short_oid(head), "revision": head, "category": "commits" }),
            None,
        ),
    }
}

async fn upstream_ref(runner: &GitRunner, branch: &str) -> Option<Value> {
    let output = runner
        .checked(strings([
            "for-each-ref",
            "--format=%(upstream)%00%(upstream:short)",
            &format!("refs/heads/{branch}"),
        ]))
        .await
        .ok()?;
    let mut parts = output.split('\0');
    let full = parts.next()?.trim();
    let short = parts.next()?.trim();
    let revision = resolve_commit(runner, full).await?;
    (!full.is_empty() && !short.is_empty()).then(|| ref_value(full, short, &revision))
}

async fn named_ref(runner: &GitRunner, name: &str) -> Option<Value> {
    let revision = resolve_commit(runner, name).await?;
    let full = runner
        .checked(strings([
            "rev-parse",
            "--symbolic-full-name",
            "--verify",
            name,
        ]))
        .await
        .ok()
        .and_then(|value| {
            value
                .lines()
                .find(|line| !line.is_empty())
                .map(str::to_owned)
        });
    Some(ref_value(full.as_deref().unwrap_or(name), name, &revision))
}

fn parse_log(output: &str) -> Vec<Value> {
    output.split('\0').filter_map(|record| {
        let record = record.trim_start_matches('\n');
        if record.trim().is_empty() { return None; }
        let lines = record.lines().collect::<Vec<_>>();
        let hash = lines.first()?.trim();
        if !(matches!(hash.len(), 40..=64) && hash.bytes().all(|byte| byte.is_ascii_hexdigit())) { return None; }
        let message = lines.iter().skip(7).copied().collect::<Vec<_>>().join("\n").trim_end_matches('\n').to_owned();
        let subject = message.lines().next().map(str::trim).filter(|value| !value.is_empty()).unwrap_or("(no commit message)");
        let parents = lines.get(5).copied().unwrap_or_default().split_whitespace().map(Value::from).collect::<Vec<_>>();
        let references = parse_decorations(lines.get(6).copied().unwrap_or_default(), hash);
        Some(json!({
            "id": hash, "parentIds": parents, "subject": subject, "message": message,
            "displayId": short_oid(hash), "author": lines.get(1).copied().filter(|value| !value.is_empty()),
            "authorEmail": lines.get(2).copied().filter(|value| !value.is_empty()),
            "timestamp": lines.get(3).and_then(|value| value.parse::<i64>().ok()).map(|value| value.saturating_mul(1000)),
            "references": references
        }))
    }).collect()
}

fn parse_decorations(raw: &str, revision: &str) -> Vec<Value> {
    let separator = if raw.contains('\x1f') { '\x1f' } else { ',' };
    let mut refs = Vec::new();
    for raw in raw.split(separator) {
        let name = raw.trim();
        if name.is_empty() || name.starts_with("refs/remotes/") && name.ends_with("/HEAD") {
            continue;
        }
        if name == "HEAD" {
            refs.push(
                json!({ "id": "HEAD", "name": "HEAD", "revision": revision, "category": "head" }),
            );
        } else if let Some(branch) = name.strip_prefix("HEAD -> refs/heads/") {
            refs.push(
                json!({ "id": "HEAD", "name": "HEAD", "revision": revision, "category": "head" }),
            );
            refs.push(json!({ "id": format!("refs/heads/{branch}"), "name": branch, "revision": revision, "category": "branches", "isCheckedOut": true }));
        } else if name.starts_with("refs/heads/")
            || name.starts_with("refs/remotes/")
            || name.starts_with("tag: refs/tags/")
        {
            refs.push(ref_value(
                name.strip_prefix("tag: ").unwrap_or(name),
                name.strip_prefix("tag: refs/tags/").unwrap_or_else(|| {
                    name.strip_prefix("refs/heads/")
                        .unwrap_or_else(|| name.strip_prefix("refs/remotes/").unwrap_or(name))
                }),
                revision,
            ));
        }
    }
    refs
}

fn ref_value(full: &str, fallback: &str, revision: &str) -> Value {
    if let Some(name) = full.strip_prefix("refs/heads/") {
        json!({ "id": full, "name": name, "revision": revision, "category": "branches" })
    } else if let Some(name) = full.strip_prefix("refs/remotes/") {
        json!({ "id": full, "name": name, "revision": revision, "category": "remote branches", "remoteName": name.split('/').next() })
    } else if let Some(name) = full.strip_prefix("refs/tags/") {
        json!({ "id": full, "name": name, "revision": revision, "category": "tags" })
    } else {
        json!({ "id": full, "name": fallback, "revision": revision, "category": "commits" })
    }
}

fn short_oid(oid: &str) -> &str {
    &oid[..oid.len().min(7)]
}

fn strings<const N: usize>(values: [&str; N]) -> Vec<String> {
    values.into_iter().map(str::to_owned).collect()
}

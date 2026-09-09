use serde_json::Value;

use super::super::context::api_args;
use super::super::{GitHubAuthority, GitHubContext, GitHubRepository};

const FAILED_JOB_LIMIT: usize = 5;
const LOG_CACHE_LIMIT: usize = 128;
const LOG_TAIL_LINES: usize = 200;
const LOG_TAIL_BYTES: usize = 16 * 1_024;

pub(super) async fn attach(
    authority: &GitHubAuthority,
    context: &GitHubContext,
    repository: &GitHubRepository,
    jobs: &mut [Value],
) {
    let mut fetched = 0;
    for job in jobs {
        if fetched >= FAILED_JOB_LIMIT || !failed(job) {
            continue;
        }
        let Some(id) = job.get("id").and_then(Value::as_u64) else {
            continue;
        };
        fetched += 1;
        let key = format!(
            "{id}:{}",
            job.get("completedAt").and_then(Value::as_str).unwrap_or("")
        );
        let cached = authority
            .log_cache
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .get(&key)
            .cloned();
        let tail = if let Some(cached) = cached {
            cached
        } else {
            let endpoint = format!(
                "repos/{}/{}/actions/jobs/{id}/logs",
                repository.owner, repository.repo
            );
            let fetched = authority
                .gh(context, api_args(repository, [endpoint]), 30_000)
                .await
                .ok()
                .map(|value| tail(&value));
            let mut cache = authority
                .log_cache
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            if cache.len() >= LOG_CACHE_LIMIT
                && let Some(oldest) = cache.keys().next().cloned()
            {
                cache.remove(&oldest);
            }
            cache.insert(key, fetched.clone());
            fetched
        };
        job["logTail"] = tail.map_or(Value::Null, Value::String);
    }
}

fn failed(job: &Value) -> bool {
    matches!(
        job.get("conclusion")
            .or_else(|| job.get("status"))
            .and_then(Value::as_str),
        Some(
            "failure"
                | "failed"
                | "action_required"
                | "cancelled"
                | "stale"
                | "startup_failure"
                | "timed_out"
        )
    )
}

fn tail(value: &str) -> String {
    let lines = value.lines().rev().take(LOG_TAIL_LINES).collect::<Vec<_>>();
    let text = lines.into_iter().rev().collect::<Vec<_>>().join("\n");
    if text.len() <= LOG_TAIL_BYTES {
        return text;
    }
    let mut bytes = 0;
    let mut characters = Vec::new();
    for character in text.chars().rev() {
        let size = character.len_utf8();
        if bytes + size > LOG_TAIL_BYTES {
            break;
        }
        bytes += size;
        characters.push(character);
    }
    characters.into_iter().rev().collect()
}

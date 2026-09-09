use std::collections::HashMap;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde_json::{Value, json};

use super::{GitHubAuthority, GitHubContext, GitHubError};

const CACHE_TTL: Duration = Duration::from_secs(30);

#[derive(Default)]
pub(super) struct RateState {
    snapshots: HashMap<String, RateSnapshot>,
}

struct RateSnapshot {
    fetched_at: Instant,
    value: Value,
}

#[derive(Clone, Copy)]
pub(super) struct RateBlock {
    pub(super) bucket: &'static str,
    pub(super) reset_at: u64,
}

impl GitHubAuthority {
    pub(super) async fn rate_limit_for(&self, context: &GitHubContext, force: bool) -> Value {
        if !force && let Some(value) = self.cached_rate(context) {
            return value;
        }
        let value = match self
            .gh_unmetered(context, ["api", "rate_limit"], 15_000, None)
            .await
        {
            Ok(output) => match serde_json::from_str::<Value>(&output) {
                Ok(raw) => success_snapshot(&raw),
                Err(error) => json!({ "ok": false, "error": error.to_string() }),
            },
            Err(error) => json!({ "ok": false, "error": error.to_string() }),
        };
        let mut state = self
            .rate_state
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        state.snapshots.insert(
            context.execution_host_id.clone(),
            RateSnapshot {
                fetched_at: Instant::now(),
                value: value.clone(),
            },
        );
        value
    }

    pub(super) fn rate_guard(
        &self,
        context: &GitHubContext,
        bucket: &'static str,
    ) -> Option<RateBlock> {
        let state = self
            .rate_state
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let snapshot = state.snapshots.get(&context.execution_host_id)?;
        let value = snapshot.value.pointer(&format!("/snapshot/{bucket}"))?;
        let limit = value.get("limit").and_then(Value::as_u64).unwrap_or(0);
        let remaining = value.get("remaining").and_then(Value::as_u64).unwrap_or(0);
        let reset_at = value.get("resetAt").and_then(Value::as_u64).unwrap_or(0);
        let floor = if bucket == "search" { 2 } else { 50 };
        (limit > 0 && remaining < floor && reset_at > epoch_seconds())
            .then_some(RateBlock { bucket, reset_at })
    }

    pub(super) fn note_rate_spend(&self, context: &GitHubContext, bucket: &str) {
        let mut state = self
            .rate_state
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let Some(snapshot) = state.snapshots.get_mut(&context.execution_host_id) else {
            return;
        };
        let Some(remaining) = snapshot
            .value
            .pointer_mut(&format!("/snapshot/{bucket}/remaining"))
        else {
            return;
        };
        if let Some(value) = remaining.as_u64() {
            *remaining = json!(value.saturating_sub(1));
        }
    }

    fn cached_rate(&self, context: &GitHubContext) -> Option<Value> {
        let state = self
            .rate_state
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let cached = state.snapshots.get(&context.execution_host_id)?;
        (cached.fetched_at.elapsed() < CACHE_TTL).then(|| cached.value.clone())
    }
}

pub(super) fn bucket_for(args: &[String]) -> Option<&'static str> {
    if args.first().is_some_and(|value| value == "api") {
        if args.get(1).is_some_and(|value| value == "rate_limit") {
            return None;
        }
        return Some(if args.iter().any(|value| value == "graphql") {
            "graphql"
        } else {
            "core"
        });
    }
    Some(if args.first().is_some_and(|value| value == "search") {
        "search"
    } else {
        "core"
    })
}

fn success_snapshot(raw: &Value) -> Value {
    json!({ "ok": true, "snapshot": {
        "core": bucket(raw, "core"),
        "search": bucket(raw, "search"),
        "graphql": bucket(raw, "graphql"),
        "fetchedAt": epoch_millis()
    }})
}

fn bucket(raw: &Value, name: &str) -> Value {
    let value = raw.pointer(&format!("/resources/{name}"));
    json!({
        "remaining": value.and_then(|entry| entry.get("remaining")).and_then(Value::as_u64).unwrap_or(0),
        "limit": value.and_then(|entry| entry.get("limit")).and_then(Value::as_u64).unwrap_or(0),
        "resetAt": value.and_then(|entry| entry.get("reset")).and_then(Value::as_u64).unwrap_or(0)
    })
}

fn epoch_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| duration.as_secs())
}

fn epoch_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| duration.as_millis())
}

pub(super) fn rate_error(block: RateBlock) -> GitHubError {
    GitHubError::RateLimited {
        bucket: block.bucket,
        reset_at: block.reset_at,
    }
}

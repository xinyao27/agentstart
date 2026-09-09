use std::sync::atomic::Ordering;
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::{Value, json};

use super::{BranchLookup, GitHubAuthority, GitHubError, refresh_error};

impl GitHubAuthority {
    pub(crate) async fn refresh_pr_for_branch(
        &self,
        repo: &str,
        branch: &str,
        request: &BranchLookup<'_>,
    ) -> Value {
        let context = match self.context(repo, None).await {
            Ok(context) => context,
            Err(error) => return outcome(Err(error)),
        };
        let alias = json!({
            "cacheKey": format!("{}:{branch}", context.project_id),
            "repoId": context.project_id,
            "repoPath": context.path,
            "branch": branch,
            "linkedPRNumber": request.linked,
            "fallbackPRNumber": request.fallback,
            "currentHeadOid": request.current_head_oid
        });
        self.publish_refresh(&alias, json!({ "status": "queued" }));

        let snapshot = self.rate_limit_for(&context, false).await;
        if snapshot.get("ok").and_then(Value::as_bool) == Some(true)
            && let Some(block) = self
                .rate_guard(&context, "core")
                .or_else(|| self.rate_guard(&context, "graphql"))
        {
            self.publish_refresh(
                &alias,
                json!({
                    "status": "paused",
                    "pausedUntil": block.reset_at.saturating_mul(1_000),
                    "skippedReason": "rate-limit"
                }),
            );
            return outcome(Err(GitHubError::RateLimited {
                bucket: block.bucket,
                reset_at: block.reset_at,
            }));
        }

        let request_started_at = epoch_millis();
        self.publish_refresh(
            &alias,
            json!({ "status": "in-flight", "requestStartedAt": request_started_at }),
        );
        let result = self.pr_for_branch_context(&context, branch, request).await;
        let result = outcome(result);
        self.publish_refresh(
            &alias,
            json!({ "outcome": result, "requestStartedAt": request_started_at }),
        );
        result
    }

    fn publish_refresh(&self, alias: &Value, details: Value) {
        let sequence = self.refresh_sequence.fetch_add(1, Ordering::Relaxed) + 1;
        let mut event = json!({
            "sequence": sequence,
            "reason": "manual",
            "aliases": [alias]
        });
        if let (Some(event), Some(details)) = (event.as_object_mut(), details.as_object()) {
            event.extend(details.clone());
        }
        drop(
            self.events
                .send(json!({ "type": "prRefresh", "event": event })),
        );
    }
}

pub(super) fn outcome(result: Result<Value, GitHubError>) -> Value {
    let fetched_at = epoch_millis();
    match result {
        Ok(value) if !value.is_null() => {
            json!({ "kind": "found", "pr": value, "fetchedAt": fetched_at })
        }
        Ok(_) => json!({ "kind": "no-pr", "fetchedAt": fetched_at }),
        Err(error) => upstream_error(&error, fetched_at),
    }
}

fn upstream_error(error: &GitHubError, fetched_at: u128) -> Value {
    let (error_type, message) = refresh_error(error);
    json!({
        "kind": "upstream-error",
        "errorType": error_type,
        "message": message,
        "fetchedAt": fetched_at
    })
}

pub(super) fn epoch_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| duration.as_millis())
}

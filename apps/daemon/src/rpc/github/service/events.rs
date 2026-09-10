use agentstart_protocol::protocol::v1::Status;
use agentstart_protocol::runtime::v1::git_hub_pr_refresh_event::Status as RefreshStatus;
use agentstart_protocol::runtime::v1::git_hub_service_subscribe_events_response::Event;
use agentstart_protocol::runtime::v1::{
    GitHubEventsSubscriptionReady, GitHubPrRefreshAlias, GitHubPrRefreshCompleted,
    GitHubPrRefreshEvent, GitHubPrRefreshFallbackSource, GitHubPrRefreshInFlight,
    GitHubPrRefreshPaused, GitHubPrRefreshQueued, GitHubPrRefreshReason, GitHubPrRefreshSkipped,
    GitHubServiceSubscribeEventsRequest, GitHubServiceSubscribeEventsResponse,
    GitHubWorkItemMutatedEvent,
};
use agentstart_protocol::transport::{decode, encode};
use serde_json::Value;

use crate::rpc::github::GitHubRpc;
use crate::rpc::protocol_call::ProtocolCallContext;

use super::work_items::refresh_outcome;

pub(in crate::rpc) async fn subscribe_events(
    rpc: &GitHubRpc,
    payload: &[u8],
    context: &ProtocolCallContext,
) -> Result<(), Status> {
    let _ = decode::<GitHubServiceSubscribeEventsRequest>(payload)?;
    let mut events = rpc.authority.subscribe();
    context
        .send_stream_payload(encode(&GitHubServiceSubscribeEventsResponse {
            event: Some(Event::Ready(GitHubEventsSubscriptionReady {})),
        }))
        .await?;
    loop {
        tokio::select! {
            result = events.recv() => match result {
                Ok(event) => {
                    if let Some(mapped) = map_event(&event) {
                        context
                            .send_stream_payload(encode(&GitHubServiceSubscribeEventsResponse {
                                event: Some(mapped),
                            }))
                            .await?;
                    }
                }
                Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                Err(tokio::sync::broadcast::error::RecvError::Closed) => return Ok(()),
            },
            () = context.cancelled() => return Ok(()),
        }
    }
}

fn map_event(raw: &Value) -> Option<Event> {
    match raw.get("type").and_then(Value::as_str) {
        Some("workItemMutated") => {
            let item = raw.get("item")?;
            Some(Event::WorkItemMutated(GitHubWorkItemMutatedEvent {
                repo_path: item.get("repoPath").and_then(Value::as_str)?.to_owned(),
                repo_id: item.get("repoId").and_then(Value::as_str)?.to_owned(),
                number: item.get("number").and_then(Value::as_u64)?,
            }))
        }
        Some("prRefresh") => Some(Event::PrRefresh(pr_refresh_event(raw.get("event")?)?)),
        _ => None,
    }
}

fn refresh_reason(raw: Option<&str>) -> GitHubPrRefreshReason {
    match raw {
        Some("visible") => GitHubPrRefreshReason::Visible,
        Some("active") => GitHubPrRefreshReason::Active,
        Some("post-push") => GitHubPrRefreshReason::PostPush,
        Some("manual") => GitHubPrRefreshReason::Manual,
        Some("swr") => GitHubPrRefreshReason::Swr,
        _ => GitHubPrRefreshReason::Unspecified,
    }
}

fn fallback_source(raw: Option<&str>) -> Option<GitHubPrRefreshFallbackSource> {
    Some(match raw? {
        "explicit" => GitHubPrRefreshFallbackSource::Explicit,
        "pr-cache" => GitHubPrRefreshFallbackSource::PrCache,
        "hosted-review" => GitHubPrRefreshFallbackSource::HostedReview,
        _ => return None,
    })
}

fn alias(raw: &Value) -> Option<GitHubPrRefreshAlias> {
    Some(GitHubPrRefreshAlias {
        cache_key: raw.get("cacheKey").and_then(Value::as_str)?.to_owned(),
        repo_id: raw.get("repoId").and_then(Value::as_str)?.to_owned(),
        repo_path: raw.get("repoPath").and_then(Value::as_str)?.to_owned(),
        branch: raw.get("branch").and_then(Value::as_str)?.to_owned(),
        connection_id: raw
            .get("connectionId")
            .and_then(Value::as_str)
            .map(str::to_owned),
        current_head_oid: raw
            .get("currentHeadOid")
            .and_then(Value::as_str)
            .map(str::to_owned),
        linked_pr_number: raw.get("linkedPRNumber").and_then(Value::as_u64),
        fallback_pr_number: raw.get("fallbackPRNumber").and_then(Value::as_u64),
        fallback_pr_source: fallback_source(raw.get("fallbackPRSource").and_then(Value::as_str))
            .map(|value| value as i32),
        worktree_id: raw
            .get("worktreeId")
            .and_then(Value::as_str)
            .map(str::to_owned),
    })
}

fn pr_refresh_event(raw: &Value) -> Option<GitHubPrRefreshEvent> {
    let aliases = raw
        .get("aliases")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(alias)
        .collect();
    let status = match raw.get("status").and_then(Value::as_str) {
        Some("queued") => Some(RefreshStatus::Queued(GitHubPrRefreshQueued {})),
        Some("in-flight") => Some(RefreshStatus::InFlight(GitHubPrRefreshInFlight {
            request_started_at_ms: raw
                .get("requestStartedAt")
                .and_then(Value::as_f64)
                .unwrap_or(0.0),
        })),
        Some("paused") => Some(RefreshStatus::Paused(GitHubPrRefreshPaused {
            paused_until_ms: raw.get("pausedUntil").and_then(Value::as_u64).unwrap_or(0),
            skipped_reason: raw
                .get("skippedReason")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_owned(),
        })),
        Some("skipped") => Some(RefreshStatus::Skipped(GitHubPrRefreshSkipped {
            skipped_reason: raw
                .get("skippedReason")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_owned(),
        })),
        _ => raw.get("outcome").map(|outcome| {
            RefreshStatus::Completed(GitHubPrRefreshCompleted {
                outcome: Some(refresh_outcome(outcome)),
                request_started_at_ms: raw
                    .get("requestStartedAt")
                    .and_then(Value::as_f64)
                    .unwrap_or(0.0),
            })
        }),
    };
    Some(GitHubPrRefreshEvent {
        sequence: raw.get("sequence").and_then(Value::as_u64).unwrap_or(0),
        reason: refresh_reason(raw.get("reason").and_then(Value::as_str)) as i32,
        aliases,
        status,
    })
}

use agentstart_protocol::protocol::v1::Status;
use agentstart_protocol::runtime::v1::{
    GitHubRateLimitBucket, GitHubRateLimitSnapshot, GitHubServiceGetRateLimitRequest,
    GitHubServiceGetRateLimitResponse,
};
use agentstart_protocol::transport::{decode, encode};
use serde_json::Value;

use crate::rpc::github::GitHubRpc;

pub(in crate::rpc) async fn get_rate_limit(
    rpc: &GitHubRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<GitHubServiceGetRateLimitRequest>(payload)?;
    let value = rpc.authority.rate_limit(request.force).await;
    Ok(encode(&GitHubServiceGetRateLimitResponse {
        ok: value.get("ok").and_then(Value::as_bool).unwrap_or(false),
        error: value
            .get("error")
            .and_then(Value::as_str)
            .map(str::to_owned),
        snapshot: snapshot(value.get("snapshot")),
    }))
}

fn bucket(raw: Option<&Value>) -> GitHubRateLimitBucket {
    let raw = raw.cloned().unwrap_or(Value::Null);
    GitHubRateLimitBucket {
        remaining: raw.get("remaining").and_then(Value::as_u64).unwrap_or(0),
        limit: raw.get("limit").and_then(Value::as_u64).unwrap_or(0),
        reset_at: raw.get("resetAt").and_then(Value::as_u64).unwrap_or(0),
    }
}

fn snapshot(raw: Option<&Value>) -> Option<GitHubRateLimitSnapshot> {
    let raw = raw?;
    Some(GitHubRateLimitSnapshot {
        core: Some(bucket(raw.get("core"))),
        search: Some(bucket(raw.get("search"))),
        graphql: Some(bucket(raw.get("graphql"))),
        fetched_at_ms: raw.get("fetchedAt").and_then(Value::as_f64).unwrap_or(0.0),
    })
}

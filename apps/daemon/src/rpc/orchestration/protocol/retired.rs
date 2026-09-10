use agentstart_protocol::protocol::v1::Status;
use agentstart_protocol::runtime::v1::{
    OrchestrationServiceRunRequest, OrchestrationServiceRunResponse,
    OrchestrationServiceRunStopRequest, OrchestrationServiceRunStopResponse,
};
use agentstart_protocol::transport::{decode, encode};
use serde_json::{Map, Value, json};

use super::super::OrchestrationRpc;
use super::values::{invoke, required};

// Why: `orchestration.run`/`orchestration.runStop` are retired scheduler commands —
// OrchestrationAuthority::invoke and OrchestrationRpc::invoke both unconditionally reject them
// with `orchestration_migration_required` before any effect runs (see is_mutation/migration_fence
// in ../../orchestration.rs and skills/orchestration/SKILL.md's "Gates And Legacy Inspection").
// invoke() below always returns Err, so the Ok(...) after it never executes; it exists only to
// satisfy the return type if that invariant is ever loosened.
pub(in crate::rpc) async fn run(
    rpc: &OrchestrationRpc,
    payload: &[u8],
    principal_id: &str,
) -> Result<Vec<u8>, Status> {
    let request = decode::<OrchestrationServiceRunRequest>(payload)?;
    let spec = required(&request.spec, "spec")?;
    let mut body = Map::new();
    body.insert("spec".to_owned(), json!(spec));
    optional_string(&mut body, "from", request.from);
    if let Some(interval) = request.poll_interval_ms {
        body.insert("pollIntervalMs".to_owned(), json!(interval));
    }
    if let Some(max_concurrent) = request.max_concurrent {
        body.insert("maxConcurrent".to_owned(), json!(max_concurrent));
    }
    optional_string(&mut body, "worktree", request.worktree);
    invoke(
        rpc,
        "orchestration.run",
        Value::Object(body),
        principal_id,
        None,
    )
    .await?;
    Ok(encode(&OrchestrationServiceRunResponse {
        run_id: String::new(),
    }))
}

pub(in crate::rpc) async fn run_stop(
    rpc: &OrchestrationRpc,
    payload: &[u8],
    principal_id: &str,
) -> Result<Vec<u8>, Status> {
    decode::<OrchestrationServiceRunStopRequest>(payload)?;
    invoke(rpc, "orchestration.runStop", json!({}), principal_id, None).await?;
    Ok(encode(&OrchestrationServiceRunStopResponse {
        run_id: String::new(),
    }))
}

fn optional_string(body: &mut Map<String, Value>, key: &str, value: Option<String>) {
    if let Some(value) = value.filter(|value| !value.is_empty()) {
        body.insert(key.to_owned(), json!(value));
    }
}

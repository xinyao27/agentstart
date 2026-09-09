use serde_json::{Map, Value, json};
use yiru_protocol::protocol::v1::{Status, StatusCode};
use yiru_protocol::runtime::v1::workspace_cleanup_service_event::Event;
use yiru_protocol::runtime::v1::{
    WorkspaceCleanupServiceClearDismissalsRequest, WorkspaceCleanupServiceDismissRequest,
    WorkspaceCleanupServiceEvent, WorkspaceCleanupServiceScanRequest,
    WorkspaceCleanupServiceSubscribeEventsRequest, WorkspaceCleanupSubscribeReady,
};
use yiru_protocol::transport::{decode, encode};

use crate::rpc::protocol_call::ProtocolCallContext;

use super::WorkspaceCleanupRpc;
use super::protocol_values::{dismissals_value, progress_event, scan_value};

pub(in crate::rpc) async fn scan(
    rpc: &WorkspaceCleanupRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<WorkspaceCleanupServiceScanRequest>(payload)?;
    let input = super::parse_scan(Some(&scan_input(&request)))
        .map_err(|_| invalid_argument("Input validation failed"))?;
    let result = rpc
        .authority
        .scan(
            input.worktree_id.as_deref(),
            &input.skip_git_worktree_ids,
            input.scan_id.as_deref(),
        )
        .await;
    Ok(encode(&scan_value(&result)?))
}

pub(in crate::rpc) async fn dismiss(
    rpc: &WorkspaceCleanupRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<WorkspaceCleanupServiceDismissRequest>(payload)?;
    let dismissals = request
        .dismissals
        .iter()
        .map(dismissal_value)
        .collect::<Result<Vec<_>, Status>>()?;
    let result = rpc.authority.dismiss(&dismissals);
    Ok(encode(&dismissals_value(&result)?))
}

pub(in crate::rpc) async fn clear_dismissals(
    rpc: &WorkspaceCleanupRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    decode::<WorkspaceCleanupServiceClearDismissalsRequest>(payload)?;
    let result = rpc.authority.clear_dismissals();
    Ok(encode(&dismissals_value(&result)?))
}

// Why: the legacy stream opens with a ready envelope naming the subscription,
// so the protobuf stream keeps one; resubscribing on reconnect restarts the
// progress feed from the request (RESTART_FROM_REQUEST), matching projectGroup.
pub(in crate::rpc) async fn subscribe_events(
    rpc: &WorkspaceCleanupRpc,
    payload: &[u8],
    context: &ProtocolCallContext,
) -> Result<(), Status> {
    decode::<WorkspaceCleanupServiceSubscribeEventsRequest>(payload)?;
    context
        .send_stream_payload(encode(&WorkspaceCleanupServiceEvent {
            event: Some(Event::Ready(WorkspaceCleanupSubscribeReady {
                subscription_id: context.call_id().to_string(),
            })),
        }))
        .await?;
    let mut events = rpc.authority.subscribe();
    loop {
        match events.recv().await {
            Ok(event) => {
                if let Some(progress) = progress_event(&event) {
                    context
                        .send_stream_payload(encode(&WorkspaceCleanupServiceEvent {
                            event: Some(Event::Progress(progress)),
                        }))
                        .await?;
                }
            }
            Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
            Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
        }
    }
    Ok(())
}

fn scan_input(request: &WorkspaceCleanupServiceScanRequest) -> Value {
    let mut object = Map::new();
    if let Some(scan_id) = request.scan_id.as_deref().filter(|id| !id.is_empty()) {
        object.insert("scanId".to_owned(), json!(scan_id));
    }
    object.insert(
        "skipGitWorktreeIds".to_owned(),
        json!(request.skip_git_worktree_ids),
    );
    if let Some(worktree_id) = request.worktree_id.as_deref().filter(|id| !id.is_empty()) {
        object.insert("worktreeId".to_owned(), json!(worktree_id));
    }
    Value::Object(object)
}

fn dismissal_value(
    dismissal: &yiru_protocol::runtime::v1::WorkspaceCleanupDismissal,
) -> Result<Value, Status> {
    if dismissal.worktree_id.is_empty() || dismissal.fingerprint.is_empty() {
        return Err(invalid_argument(
            "Dismissal worktree id and fingerprint are required",
        ));
    }
    if !dismissal.dismissed_at.is_finite() || !dismissal.classifier_version.is_finite() {
        return Err(invalid_argument("Dismissal numbers must be finite"));
    }
    Ok(json!({
        "worktreeId": dismissal.worktree_id,
        "dismissedAt": dismissal.dismissed_at,
        "fingerprint": dismissal.fingerprint,
        "classifierVersion": dismissal.classifier_version,
    }))
}

fn invalid_argument(message: &str) -> Status {
    status(StatusCode::InvalidArgument, message)
}

fn status(code: StatusCode, message: &str) -> Status {
    Status {
        code: code as i32,
        message: message.to_owned(),
        details: Vec::new(),
    }
}

use yiru_protocol::protocol::v1::{Status, StatusCode};
use yiru_protocol::runtime::v1::workspace_ports_service_event::Event;
use yiru_protocol::runtime::v1::{
    WorkspacePortsAdvertisedUrlChanged, WorkspacePortsServiceEvent,
    WorkspacePortsServiceKillRequest, WorkspacePortsServiceScanRequest,
    WorkspacePortsServiceSubscribeEventsRequest, WorkspacePortsStreamEnd,
    WorkspacePortsSubscribeReady,
};
use yiru_protocol::transport::{decode, encode};

use crate::workspace_ports::WorkspacePortKillRequest;
use crate::workspace_ports::WorkspacePortSubscriptionEvent;

use crate::rpc::protocol_call::ProtocolCallContext;

use super::WorkspacePortsRpc;
use super::protocol_values::{kill_result, scan_result};

pub(in crate::rpc) async fn scan(
    rpc: &WorkspacePortsRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<WorkspacePortsServiceScanRequest>(payload)?;
    let repo_id = optional_repo_id(&request.repo_id);
    let source = rpc
        .probe_source(repo_id.as_deref())
        .await
        .map_err(ports_status)?;
    let ports = rpc
        .ports
        .for_host(&source.host_id)
        .await
        .map_err(|error| status(StatusCode::Internal, &error.to_string()))?;
    let result = ports.scan(&source.probes, repo_id.as_deref()).await;
    Ok(encode(&scan_result(&result)))
}

pub(in crate::rpc) async fn kill(
    rpc: &WorkspacePortsRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<WorkspacePortsServiceKillRequest>(payload)?;
    // Why: the legacy wire rejected missing or non-finite numbers with a 400
    // before any probe ran, so the typed fields get the same gate.
    if !request.pid.is_finite() || !request.port.is_finite() {
        return Err(invalid_argument("pid and port must be finite numbers"));
    }
    let repo_id = optional_repo_id(&request.repo_id);
    let source = rpc
        .probe_source(repo_id.as_deref())
        .await
        .map_err(ports_status)?;
    let ports = rpc
        .ports
        .for_host(&source.host_id)
        .await
        .map_err(|error| status(StatusCode::Internal, &error.to_string()))?;
    let result = ports
        .kill(
            &source.probes,
            repo_id.as_deref(),
            WorkspacePortKillRequest {
                pid: request.pid,
                port: request.port,
            },
        )
        .await;
    Ok(encode(&kill_result(&result)))
}

// Why: the legacy stream opens with a ready envelope naming the subscription
// and survives cancellation because dropping the stream detaches it, so the
// protobuf stream keeps both; resubscribing on reconnect restarts from the
// request (RESTART_FROM_REQUEST).
pub(in crate::rpc) async fn subscribe_events(
    rpc: &WorkspacePortsRpc,
    payload: &[u8],
    connection_id: &str,
    context: &ProtocolCallContext,
) -> Result<(), Status> {
    decode::<WorkspacePortsServiceSubscribeEventsRequest>(payload)?;
    let mut subscription = rpc.ports.subscribe(Some(connection_id));
    while let Some(event) = subscription.next().await {
        let is_end = matches!(event, WorkspacePortSubscriptionEvent::End);
        let event = match event {
            WorkspacePortSubscriptionEvent::Ready { subscription_id } => {
                Event::Ready(WorkspacePortsSubscribeReady { subscription_id })
            }
            WorkspacePortSubscriptionEvent::AdvertisedUrlChanged { port, worktree_id } => {
                Event::AdvertisedUrlChanged(WorkspacePortsAdvertisedUrlChanged {
                    port: u32::from(port),
                    worktree_id,
                })
            }
            WorkspacePortSubscriptionEvent::End => Event::End(WorkspacePortsStreamEnd {}),
        };
        context
            .send_stream_payload(encode(&WorkspacePortsServiceEvent { event: Some(event) }))
            .await?;
        if is_end {
            break;
        }
    }
    Ok(())
}

fn optional_repo_id(repo_id: &Option<String>) -> Option<String> {
    repo_id
        .as_deref()
        .filter(|repo_id| !repo_id.is_empty())
        .map(str::to_owned)
}

fn ports_status(error: super::WorkspacePortsRpcError) -> Status {
    status(StatusCode::Internal, &error.to_string())
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

use yiru_protocol::protocol::v1::{Status, StatusCode};
use yiru_protocol::runtime::v1::{
    ExternalEditorServiceOpenRemoteSshRequest, ExternalEditorServiceOpenRemoteSshResponse,
    ExternalEditorUnsupportedReason,
};
use yiru_protocol::transport::{decode, encode};

use super::{ExternalEditorRpc, OpenRemoteSshOutcome, OpenRemoteSshRequest};

pub(in crate::rpc) async fn open_remote_ssh(
    _rpc: &ExternalEditorRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<ExternalEditorServiceOpenRemoteSshRequest>(payload)?;
    // Why: the command field carries no rule beyond being a string, which the
    // protobuf wire type already guarantees, so it takes no part in the gate.
    let _ = request.command;
    let outcome = super::open_remote_ssh(OpenRemoteSshRequest {
        connection_id: request.connection_id,
        path: request.path,
    })
    .map_err(|()| invalid_argument("path and connectionId must not be empty"))?;
    match outcome {
        OpenRemoteSshOutcome::RemoteRuntimeUnsupported => {
            Ok(encode(&ExternalEditorServiceOpenRemoteSshResponse {
                ok: false,
                reason: ExternalEditorUnsupportedReason::RemoteRuntime as i32,
            }))
        }
    }
}

fn invalid_argument(message: &str) -> Status {
    Status {
        code: StatusCode::InvalidArgument as i32,
        message: message.to_owned(),
        details: Vec::new(),
    }
}

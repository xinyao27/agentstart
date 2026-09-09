use yiru_protocol::protocol::v1::Status;
use yiru_protocol::runtime::v1::{
    WorkspaceSpaceServiceAnalyzeRequest, WorkspaceSpaceServiceCancelRequest,
    WorkspaceSpaceServiceCancelResponse,
};
use yiru_protocol::transport::{decode, encode};

use super::WorkspaceSpaceRpc;
use super::protocol_values::{analyze_response, internal_status};

pub(in crate::rpc) async fn analyze(
    rpc: &WorkspaceSpaceRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    decode::<WorkspaceSpaceServiceAnalyzeRequest>(payload)?;
    let result = rpc
        .authority
        .analyze()
        .await
        .map_err(|error| internal_status(&error))?;
    Ok(encode(&analyze_response(result)))
}

pub(in crate::rpc) async fn cancel(
    rpc: &WorkspaceSpaceRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    decode::<WorkspaceSpaceServiceCancelRequest>(payload)?;
    Ok(encode(&WorkspaceSpaceServiceCancelResponse {
        cancelled: rpc.authority.cancel(),
    }))
}

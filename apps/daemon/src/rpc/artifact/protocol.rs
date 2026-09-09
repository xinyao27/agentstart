use yiru_protocol::protocol::v1::{Status, StatusCode};
use yiru_protocol::runtime::v1::{
    ArtifactServiceAbortRequest, ArtifactServiceAbortedResponse, ArtifactServiceAppendRequest,
    ArtifactServiceArtifactResponse, ArtifactServiceBeginRequest, ArtifactServiceCompleteRequest,
    ArtifactServiceReadRequest, ArtifactServiceTicketRequest,
};
use yiru_protocol::transport::{decode, encode};

use crate::persistence::{ArtifactBegin, ArtifactStoreError};
use crate::rpc::zod_input::{is_uuid, trim_ecmascript_whitespace};

use super::ArtifactRpc;
use super::protocol_values::{protocol_artifact, protocol_read, protocol_ticket};

const MAX_APPEND_BASE64_UTF16_LENGTH: usize = 700_000;
const MAX_FILE_NAME_UTF16_LENGTH: usize = 255;
const MAX_MIME_TYPE_UTF16_LENGTH: usize = 255;
const MAX_READ_LENGTH: i64 = 384 * 1_024;

pub(in crate::rpc) async fn begin(rpc: &ArtifactRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<ArtifactServiceBeginRequest>(payload)?;
    let input = ArtifactBegin {
        file_name: trimmed_bounded(&request.file_name, Some(MAX_FILE_NAME_UTF16_LENGTH))?,
        mime_type: trimmed_bounded(&request.mime_type, Some(MAX_MIME_TYPE_UTF16_LENGTH))?,
        project_id: trimmed_bounded(&request.project_id, None)?,
    };
    let artifact = rpc.store.begin(input).await.map_err(store_status)?;
    Ok(encode(&ArtifactServiceArtifactResponse {
        artifact: Some(protocol_artifact(&artifact)),
    }))
}

pub(in crate::rpc) async fn append(rpc: &ArtifactRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<ArtifactServiceAppendRequest>(payload)?;
    let id = request_uuid(&request.id)?;
    if request.offset < 0 {
        return Err(invalid_argument("Offset must be non-negative"));
    }
    let length = request.data_base64.encode_utf16().count();
    if length == 0 || length > MAX_APPEND_BASE64_UTF16_LENGTH {
        return Err(invalid_argument("Data length is invalid"));
    }
    let artifact = rpc
        .store
        .append_base64(id, request.offset, request.data_base64)
        .await
        .map_err(store_status)?;
    Ok(encode(&ArtifactServiceArtifactResponse {
        artifact: Some(protocol_artifact(&artifact)),
    }))
}

pub(in crate::rpc) async fn complete(rpc: &ArtifactRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<ArtifactServiceCompleteRequest>(payload)?;
    let id = request_uuid(&request.id)?;
    let artifact = rpc.store.complete(id).await.map_err(store_status)?;
    Ok(encode(&ArtifactServiceArtifactResponse {
        artifact: Some(protocol_artifact(&artifact)),
    }))
}

pub(in crate::rpc) async fn abort(rpc: &ArtifactRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<ArtifactServiceAbortRequest>(payload)?;
    let id = request_uuid(&request.id)?;
    let removed = rpc.store.abort(id).await.map_err(store_status)?;
    Ok(encode(&ArtifactServiceAbortedResponse { removed }))
}

pub(in crate::rpc) async fn download_ticket(
    rpc: &ArtifactRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<ArtifactServiceTicketRequest>(payload)?;
    let id = request_uuid(&request.id)?;
    let ticket = rpc
        .store
        .issue_download_ticket(id)
        .await
        .map_err(store_status)?;
    Ok(encode(&protocol_ticket(&ticket)))
}

pub(in crate::rpc) async fn read(rpc: &ArtifactRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<ArtifactServiceReadRequest>(payload)?;
    let id = request_uuid(&request.id)?;
    if request.offset < 0 {
        return Err(invalid_argument("Offset must be non-negative"));
    }
    // Why: the legacy surface bounds the read window to 384 KiB and requires a
    // positive limit, so the protobuf surface rejects the same values for the
    // same reason instead of trusting the store to guard itself.
    if request.limit <= 0 || request.limit > MAX_READ_LENGTH {
        return Err(invalid_argument("Limit length is invalid"));
    }
    let limit =
        usize::try_from(request.limit).map_err(|_| invalid_argument("Limit length is invalid"))?;
    let read = rpc
        .store
        .read(id, request.offset, limit)
        .await
        .map_err(store_status)?;
    Ok(encode(&protocol_read(&read)))
}

// Why: the legacy surface trims ECMAScript whitespace off begin fields and
// bounds them in UTF-16 units, so the protobuf surface applies the same rule
// to the same values.
fn trimmed_bounded(value: &str, maximum: Option<usize>) -> Result<String, Status> {
    let trimmed = trim_ecmascript_whitespace(value);
    let length = trimmed.encode_utf16().count();
    if length == 0 || maximum.is_some_and(|maximum| length > maximum) {
        return Err(invalid_argument("Field length is invalid"));
    }
    Ok(trimmed.to_owned())
}

fn request_uuid(id: &str) -> Result<String, Status> {
    if is_uuid(id) {
        return Ok(id.to_owned());
    }
    Err(invalid_argument("Id must be a UUID"))
}

// Why: the legacy surface answers every store failure with one internal
// error, so the protobuf surface keeps that outcome and only request-shape
// problems become invalid arguments.
fn store_status(error: ArtifactStoreError) -> Status {
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

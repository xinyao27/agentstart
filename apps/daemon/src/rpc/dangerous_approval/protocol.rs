use yiru_protocol::protocol::v1::{Status, StatusCode};
use yiru_protocol::runtime::v1::{
    DangerousApprovalCeremonyResponse, DangerousApprovalServiceBeginApprovalRequest,
    DangerousApprovalServiceBeginRegistrationRequest,
    DangerousApprovalServiceFinishApprovalRequest,
    DangerousApprovalServiceFinishRegistrationRequest, DangerousApprovalServiceRemoveRequest,
    DangerousApprovalServiceStatusRequest,
};
use yiru_protocol::transport::{decode, encode};

use crate::dangerous_approval::CeremonyResponse;
use crate::rpc::zod_input::{is_uuid, trim_ecmascript_whitespace};

use super::DangerousApprovalRpc;
use super::protocol_values::{
    protocol_begin_approval, protocol_begin_registration, protocol_finish_approval, protocol_status,
};

const MAX_CEREMONY_FIELD_UTF16_LENGTH: usize = 4_096;
const MAX_CREDENTIAL_ID_UTF16_LENGTH: usize = 2_048;
const MAX_OPERATION_UTF16_LENGTH: usize = 1_024;

pub(in crate::rpc) async fn status(
    rpc: &DangerousApprovalRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    decode::<DangerousApprovalServiceStatusRequest>(payload)?;
    let status = rpc.authority.status().await.map_err(approval_status)?;
    Ok(encode(&protocol_status(&status)))
}

pub(in crate::rpc) async fn begin_registration(
    rpc: &DangerousApprovalRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    decode::<DangerousApprovalServiceBeginRegistrationRequest>(payload)?;
    let result = rpc
        .authority
        .begin_registration()
        .await
        .map_err(approval_status)?;
    Ok(encode(&protocol_begin_registration(&result)))
}

pub(in crate::rpc) async fn finish_registration(
    rpc: &DangerousApprovalRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<DangerousApprovalServiceFinishRegistrationRequest>(payload)?;
    let request_id = request_uuid(&request.request_id)?;
    let response = ceremony(request.response.as_ref())?;
    let status = rpc
        .authority
        .finish_registration(&request_id, response)
        .await
        .map_err(approval_status)?;
    Ok(encode(&protocol_status(&status)))
}

pub(in crate::rpc) async fn begin_approval(
    rpc: &DangerousApprovalRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<DangerousApprovalServiceBeginApprovalRequest>(payload)?;
    let operation = request_operation(&request.operation)?;
    let result = rpc
        .authority
        .begin_approval(operation)
        .await
        .map_err(approval_status)?;
    Ok(encode(&protocol_begin_approval(&result)))
}

pub(in crate::rpc) async fn finish_approval(
    rpc: &DangerousApprovalRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<DangerousApprovalServiceFinishApprovalRequest>(payload)?;
    let request_id = request_uuid(&request.request_id)?;
    let operation = request_operation(&request.operation)?;
    let response = ceremony(request.response.as_ref())?;
    let result = rpc
        .authority
        .finish_approval(&request_id, &operation, response)
        .await
        .map_err(approval_status)?;
    Ok(encode(&protocol_finish_approval(&result)))
}

pub(in crate::rpc) async fn remove(
    rpc: &DangerousApprovalRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    decode::<DangerousApprovalServiceRemoveRequest>(payload)?;
    let status = rpc.authority.remove().await.map_err(approval_status)?;
    Ok(encode(&protocol_status(&status)))
}

// Why: the legacy surface trims ECMAScript whitespace off the operation and
// bounds it in UTF-16 units like every other renderer-supplied string, so the
// protobuf surface applies the same rule to the same value.
fn request_operation(operation: &str) -> Result<String, Status> {
    let trimmed = trim_ecmascript_whitespace(operation);
    let length = trimmed.encode_utf16().count();
    if length == 0 || length > MAX_OPERATION_UTF16_LENGTH {
        return Err(invalid_argument("Operation length is invalid"));
    }
    Ok(trimmed.to_owned())
}

fn request_uuid(request_id: &str) -> Result<String, Status> {
    if is_uuid(request_id) {
        return Ok(request_id.to_owned());
    }
    Err(invalid_argument("Request id must be a UUID"))
}

fn ceremony(
    response: Option<&DangerousApprovalCeremonyResponse>,
) -> Result<CeremonyResponse, Status> {
    let response =
        response.ok_or_else(|| invalid_argument("Ceremony response must be provided"))?;
    Ok(CeremonyResponse {
        authenticator_data: optional_field(&response.authenticator_data)?,
        client_data_json: bounded_field(&response.client_data_json, None)?,
        credential_id: bounded_field(
            &response.credential_id,
            Some((1, MAX_CREDENTIAL_ID_UTF16_LENGTH)),
        )?,
        public_key_spki: optional_field(&response.public_key_spki)?,
        signature: optional_field(&response.signature)?,
    })
}

fn optional_field(value: &Option<String>) -> Result<Option<String>, Status> {
    value
        .as_deref()
        .map(|value| bounded_field(value, None).map(|_| value.to_owned()))
        .transpose()
}

fn bounded_field(value: &str, bounds: Option<(usize, usize)>) -> Result<String, Status> {
    let length = value.encode_utf16().count();
    let (minimum, maximum) = bounds.unwrap_or((0, MAX_CEREMONY_FIELD_UTF16_LENGTH));
    if length >= minimum && length <= maximum {
        return Ok(value.to_owned());
    }
    Err(invalid_argument("Ceremony field length is invalid"))
}

// Why: the legacy surface answers every authority failure — including its
// `dangerous_approval_*` code strings — with one internal error, so the
// protobuf surface keeps that outcome and those messages verbatim.
fn approval_status(error: crate::dangerous_approval::DangerousApprovalError) -> Status {
    build_status(StatusCode::Internal, &error.to_string())
}

fn invalid_argument(message: &str) -> Status {
    build_status(StatusCode::InvalidArgument, message)
}

// Why: named beside the `status` handler rather than replacing it — this only
// assembles a `Status` value for the other helpers.
fn build_status(code: StatusCode, message: &str) -> Status {
    Status {
        code: code as i32,
        message: message.to_owned(),
        details: Vec::new(),
    }
}

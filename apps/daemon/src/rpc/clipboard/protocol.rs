use agentstart_protocol::protocol::v1::{Status, StatusCode};
use agentstart_protocol::runtime::v1::{
    ClipboardServiceAbortImageUploadRequest, ClipboardServiceAppendImageUploadChunkRequest,
    ClipboardServiceChunkReceivedResponse, ClipboardServiceCommitImageUploadRequest,
    ClipboardServiceSaveImageAsTempFileRequest, ClipboardServiceSavedImagePathResponse,
    ClipboardServiceStartImageUploadRequest, ClipboardServiceUploadAbortedResponse,
    ClipboardServiceUploadStartedResponse,
};
use agentstart_protocol::transport::{decode, encode};

use crate::clipboard::{
    ClipboardImageUploadError, MAX_CHUNK_BASE64_CHARS, MAX_UPLOAD_BASE64_CHARS, is_valid_base64,
};

use super::ClipboardRpc;

pub(in crate::rpc) async fn start_image_upload(
    rpc: &ClipboardRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<ClipboardServiceStartImageUploadRequest>(payload)?;
    let expected_base64_length = bounded_length(
        request.expected_base64_length,
        MAX_UPLOAD_BASE64_CHARS,
        "Clipboard image is too large",
    )?;
    let upload_id = rpc
        .image_uploads
        .start(expected_base64_length)
        .map_err(upload_status)?;
    Ok(encode(&ClipboardServiceUploadStartedResponse { upload_id }))
}

pub(in crate::rpc) async fn append_image_upload_chunk(
    rpc: &ClipboardRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<ClipboardServiceAppendImageUploadChunkRequest>(payload)?;
    let upload_id = required_upload_id(&request.upload_id)?;
    let offset = usize::try_from(request.offset)
        .map_err(|_| invalid_argument("Clipboard chunk offset must be nonnegative"))?;
    bounded_base64(
        &request.content_base64,
        MAX_CHUNK_BASE64_CHARS,
        "Clipboard image chunk is too large",
    )?;
    let received_base64_length = rpc
        .image_uploads
        .append(&upload_id, offset, request.content_base64)
        .map_err(upload_status)?;
    let received_base64_length = u64::try_from(received_base64_length)
        .map_err(|_| data_loss("Clipboard chunk length cannot be represented"))?;
    Ok(encode(&ClipboardServiceChunkReceivedResponse {
        received_base64_length,
    }))
}

pub(in crate::rpc) async fn commit_image_upload(
    rpc: &ClipboardRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<ClipboardServiceCommitImageUploadRequest>(payload)?;
    let upload_id = required_upload_id(&request.upload_id)?;
    let path = rpc
        .image_uploads
        .commit(&upload_id, rpc.image_files)
        .await
        .map_err(upload_status)?;
    Ok(encode(&ClipboardServiceSavedImagePathResponse {
        path: path.to_string_lossy().into_owned(),
    }))
}

pub(in crate::rpc) async fn abort_image_upload(
    rpc: &ClipboardRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<ClipboardServiceAbortImageUploadRequest>(payload)?;
    let upload_id = required_upload_id(&request.upload_id)?;
    rpc.image_uploads.abort(&upload_id);
    Ok(encode(&ClipboardServiceUploadAbortedResponse {
        aborted: true,
    }))
}

pub(in crate::rpc) async fn save_image_as_temp_file(
    rpc: &ClipboardRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<ClipboardServiceSaveImageAsTempFileRequest>(payload)?;
    bounded_base64(
        &request.content_base64,
        MAX_UPLOAD_BASE64_CHARS,
        "Clipboard image is too large",
    )?;
    let path = rpc
        .image_files
        .save_base64(request.content_base64)
        .await
        .map_err(|error| status(StatusCode::Internal, &error.to_string()))?;
    Ok(encode(&ClipboardServiceSavedImagePathResponse {
        path: path.to_string_lossy().into_owned(),
    }))
}

// Why: the base64 checks mirror the legacy parser byte-for-byte (UTF-16 length
// bound plus the permissive Node-matching validator) so neither transport can
// admit an image the other would reject.
fn bounded_base64(
    content_base64: &str,
    maximum: usize,
    message: &'static str,
) -> Result<(), Status> {
    if content_base64.encode_utf16().count() > maximum {
        return Err(invalid_argument(message));
    }
    if !is_valid_base64(content_base64) {
        return Err(invalid_argument("Clipboard image content must be base64"));
    }
    Ok(())
}

fn bounded_length(value: u64, maximum: usize, message: &'static str) -> Result<usize, Status> {
    let value = usize::try_from(value).map_err(|_| invalid_argument(message))?;
    if value > maximum {
        return Err(invalid_argument(message));
    }
    Ok(value)
}

fn required_upload_id(upload_id: &str) -> Result<String, Status> {
    if upload_id.is_empty() {
        return Err(invalid_argument("Missing upload id"));
    }
    Ok(upload_id.to_owned())
}

fn upload_status(error: ClipboardImageUploadError) -> Status {
    // Why: an invalid payload only reaches the authority when the upload was
    // admitted by a caller that skipped the wire validation, so it still
    // answers as a caller mistake rather than an internal failure.
    if matches!(error, ClipboardImageUploadError::InvalidBase64) {
        return invalid_argument("Clipboard image content must be base64");
    }
    status(StatusCode::Internal, &error.to_string())
}

fn data_loss(message: &str) -> Status {
    status(StatusCode::DataLoss, message)
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

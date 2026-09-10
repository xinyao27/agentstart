// Why: this is the protobuf transport for the `shell.files` namespace. Every
// handler decodes a typed request, calls straight into `ShellFiles` (the
// same authority the retired legacy JSON dispatch called), and encodes a
// typed response — the authority is the one shared implementation, so there
// is nothing left here to duplicate or drift.
use agentstart_protocol::protocol::v1::Status;
use agentstart_protocol::runtime::v1::{
    ShellFilesServiceAuthorizeExternalPathRequest, ShellFilesServiceAuthorizeExternalPathResponse,
    ShellFilesServiceCopyRequest, ShellFilesServiceCopyResponse,
    ShellFilesServiceCreateDirectoryRequest, ShellFilesServiceCreateDirectoryResponse,
    ShellFilesServiceCreateFileRequest, ShellFilesServiceCreateFileResponse,
    ShellFilesServiceDeleteRequest, ShellFilesServiceDeleteResponse,
    ShellFilesServicePathExistsRequest, ShellFilesServicePathExistsResponse,
    ShellFilesServiceReadChunkRequest, ShellFilesServiceReadChunkResponse,
    ShellFilesServiceReadRequest, ShellFilesServiceReadResponse, ShellFilesServiceRenameRequest,
    ShellFilesServiceRenameResponse, ShellFilesServiceResolveDroppedPathsForAgentRequest,
    ShellFilesServiceResolveDroppedPathsForAgentResponse,
    ShellFilesServiceStageExternalPathsForRuntimeUploadRequest,
    ShellFilesServiceStageExternalPathsForRuntimeUploadResponse, ShellFilesServiceStatRequest,
    ShellFilesServiceStatResponse, ShellFilesServiceWriteRequest, ShellFilesServiceWriteResponse,
};
use agentstart_protocol::transport::{decode, encode};

use super::ShellFilesRpc;
use super::protocol_values::{
    dropped_paths_response, invalid, mutation_result, shell_files_status, staged_sources,
};

const MAX_READ_CHUNK_BYTES: u32 = 512 * 1_024;

pub(in crate::rpc) async fn authorize_external_path(
    rpc: &ShellFilesRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<ShellFilesServiceAuthorizeExternalPathRequest>(payload)?;
    rpc.files()
        .authorize_external(&request.target_path)
        .await
        .map_err(shell_files_status)?;
    Ok(encode(&ShellFilesServiceAuthorizeExternalPathResponse {
        result: Some(mutation_result()),
    }))
}

pub(in crate::rpc) async fn copy(rpc: &ShellFilesRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<ShellFilesServiceCopyRequest>(payload)?;
    rpc.files()
        .copy(&request.source_path, &request.destination_path)
        .await
        .map_err(shell_files_status)?;
    Ok(encode(&ShellFilesServiceCopyResponse {
        result: Some(mutation_result()),
    }))
}

pub(in crate::rpc) async fn create_directory(
    rpc: &ShellFilesRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<ShellFilesServiceCreateDirectoryRequest>(payload)?;
    rpc.files()
        .create_directory(&request.directory_path)
        .await
        .map_err(shell_files_status)?;
    Ok(encode(&ShellFilesServiceCreateDirectoryResponse {
        result: Some(mutation_result()),
    }))
}

pub(in crate::rpc) async fn create_file(
    rpc: &ShellFilesRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<ShellFilesServiceCreateFileRequest>(payload)?;
    rpc.files()
        .create_file(&request.file_path)
        .await
        .map_err(shell_files_status)?;
    Ok(encode(&ShellFilesServiceCreateFileResponse {
        result: Some(mutation_result()),
    }))
}

pub(in crate::rpc) async fn delete(rpc: &ShellFilesRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<ShellFilesServiceDeleteRequest>(payload)?;
    rpc.files()
        .delete(&request.target_path, request.recursive)
        .await
        .map_err(shell_files_status)?;
    Ok(encode(&ShellFilesServiceDeleteResponse {
        result: Some(mutation_result()),
    }))
}

pub(in crate::rpc) async fn path_exists(
    rpc: &ShellFilesRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<ShellFilesServicePathExistsRequest>(payload)?;
    let exists = rpc
        .files()
        .path_exists(&request.file_path)
        .await
        .map_err(shell_files_status)?;
    Ok(encode(&ShellFilesServicePathExistsResponse { exists }))
}

pub(in crate::rpc) async fn read(rpc: &ShellFilesRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<ShellFilesServiceReadRequest>(payload)?;
    let result = rpc
        .files()
        .read(&request.file_path, request.include_local_log_metadata)
        .await
        .map_err(shell_files_status)?;
    Ok(encode(&ShellFilesServiceReadResponse {
        content: result.content,
        is_binary: result.is_binary,
        is_image: result.is_image,
        mime_type: result.mime_type.map(str::to_owned),
        file_identity: result.file_identity,
    }))
}

pub(in crate::rpc) async fn read_chunk(
    rpc: &ShellFilesRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<ShellFilesServiceReadChunkRequest>(payload)?;
    // Why: mirrors the legacy `shell.files.readChunk` input cap so a protobuf
    // caller cannot request a larger chunk than the JSON transport ever allowed.
    if request.length == 0 || request.length > MAX_READ_CHUNK_BYTES {
        return Err(invalid("length must be between 1 and 524288"));
    }
    let result = rpc
        .files()
        .read_chunk(&request.file_path, request.offset, request.length as usize)
        .await
        .map_err(shell_files_status)?;
    Ok(encode(&ShellFilesServiceReadChunkResponse {
        content: result.content,
        bytes_read: result.bytes_read as u32,
        eof: result.eof,
    }))
}

pub(in crate::rpc) async fn rename(rpc: &ShellFilesRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<ShellFilesServiceRenameRequest>(payload)?;
    rpc.files()
        .rename(&request.old_path, &request.new_path)
        .await
        .map_err(shell_files_status)?;
    Ok(encode(&ShellFilesServiceRenameResponse {
        result: Some(mutation_result()),
    }))
}

pub(in crate::rpc) async fn resolve_dropped_paths_for_agent(
    _rpc: &ShellFilesRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<ShellFilesServiceResolveDroppedPathsForAgentRequest>(payload)?;
    let result = crate::shell_files::resolve_dropped_paths(request.paths, &request.worktree_path);
    let (resolved_paths, skipped, failed) = dropped_paths_response(result);
    Ok(encode(
        &ShellFilesServiceResolveDroppedPathsForAgentResponse {
            resolved_paths,
            skipped,
            failed,
        },
    ))
}

pub(in crate::rpc) async fn stage_external_paths_for_runtime_upload(
    rpc: &ShellFilesRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<ShellFilesServiceStageExternalPathsForRuntimeUploadRequest>(payload)?;
    let result = rpc
        .files()
        .stage_external_paths(request.source_paths)
        .await
        .map_err(shell_files_status)?;
    Ok(encode(
        &ShellFilesServiceStageExternalPathsForRuntimeUploadResponse {
            sources: staged_sources(result),
        },
    ))
}

pub(in crate::rpc) async fn stat(rpc: &ShellFilesRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<ShellFilesServiceStatRequest>(payload)?;
    let result = rpc
        .files()
        .stat(&request.file_path)
        .await
        .map_err(shell_files_status)?;
    Ok(encode(&ShellFilesServiceStatResponse {
        is_directory: result.is_directory,
        mtime: result.mtime,
        size: result.size,
    }))
}

pub(in crate::rpc) async fn write(rpc: &ShellFilesRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<ShellFilesServiceWriteRequest>(payload)?;
    rpc.files()
        .write(&request.file_path, &request.content)
        .await
        .map_err(shell_files_status)?;
    Ok(encode(&ShellFilesServiceWriteResponse {
        result: Some(mutation_result()),
    }))
}

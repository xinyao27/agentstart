// Why: this is the protobuf transport for the `files` namespace. Every handler decodes a
// typed request, calls straight into `FilesAuthority` (the same authority the retired
// legacy JSON dispatch called), and encodes a typed response — the authority is the one
// shared implementation, so there is nothing left here to duplicate or drift.
use yiru_protocol::protocol::v1::Status;
use yiru_protocol::runtime::v1::{
    FileWatchChanged, FileWatchEnd, FileWatchError, FileWatchReady, FileWatchStarting,
    FilesServiceBrowseServerDirectoryRequest, FilesServiceBrowseServerDirectoryResponse,
    FilesServiceCommitUploadRequest, FilesServiceCommitUploadResponse, FilesServiceCopyRequest,
    FilesServiceCopyResponse, FilesServiceCreateDirectoryNoClobberRequest,
    FilesServiceCreateDirectoryNoClobberResponse, FilesServiceCreateDirectoryRequest,
    FilesServiceCreateDirectoryResponse, FilesServiceCreateFileRequest,
    FilesServiceCreateFileResponse, FilesServiceDeleteRequest, FilesServiceDeleteResponse,
    FilesServiceListAllRequest, FilesServiceListAllResponse,
    FilesServiceListMarkdownDocumentsRequest, FilesServiceListMarkdownDocumentsResponse,
    FilesServiceListRequest, FilesServiceListResponse, FilesServiceOpenDiffRequest,
    FilesServiceOpenDiffResponse, FilesServiceOpenRequest, FilesServiceOpenResponse,
    FilesServiceReadChunkRequest, FilesServiceReadChunkResponse, FilesServiceReadDirectoryRequest,
    FilesServiceReadDirectoryResponse, FilesServiceReadLogTailRequest,
    FilesServiceReadLogTailResponse, FilesServiceReadPreviewRequest,
    FilesServiceReadPreviewResponse, FilesServiceReadRequest, FilesServiceReadResponse,
    FilesServiceReadTerminalArtifactPreviewRequest,
    FilesServiceReadTerminalArtifactPreviewResponse, FilesServiceReadTerminalArtifactRequest,
    FilesServiceReadTerminalArtifactResponse, FilesServiceRenameRequest,
    FilesServiceRenameResponse, FilesServiceResolveTerminalPathRequest,
    FilesServiceResolveTerminalPathResponse, FilesServiceSearchPathsRequest,
    FilesServiceSearchPathsResponse, FilesServiceSearchRequest, FilesServiceSearchResponse,
    FilesServiceStatRequest, FilesServiceStatResponse, FilesServiceWatchLogTailRequest,
    FilesServiceWatchLogTailResponse, FilesServiceWatchRequest, FilesServiceWatchResponse,
    FilesServiceWriteBase64ChunkRequest, FilesServiceWriteBase64ChunkResponse,
    FilesServiceWriteBase64Request, FilesServiceWriteBase64Response, FilesServiceWriteRequest,
    FilesServiceWriteResponse, FilesServiceWriteTerminalArtifactRequest,
    FilesServiceWriteTerminalArtifactResponse, LogTailWatchChanged, LogTailWatchEnd,
    LogTailWatchReady, files_service_watch_log_tail_response, files_service_watch_response,
};
use yiru_protocol::transport::{decode, encode};

use crate::files::{FileWatchEvent, LogTailWatchEvent, SearchOptions};
use crate::rpc::protocol_call::ProtocolCallContext;

use super::FilesRpc;
use super::protocol_values::{
    decode_base64, encode_base64, files_status, invalid, protocol_directory_entry,
    protocol_file_change_event, protocol_file_list_result, protocol_file_open_result,
    protocol_file_preview_result, protocol_file_read_result, protocol_file_search_result,
    protocol_log_tail_change_kind, protocol_markdown_document, protocol_mutation_result,
    protocol_terminal_path_resolution, required,
};

const MAX_READ_CHUNK_BYTES: u32 = 512 * 1_024;
const MAX_SEARCH_PATHS_LIMIT: u32 = 32;
const DEFAULT_SEARCH_PATHS_LIMIT: u32 = 16;
const MAX_SEARCH_PATHS_QUERY_UTF16_LENGTH: usize = 256;

pub(in crate::rpc) async fn browse_server_directory(
    rpc: &FilesRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<FilesServiceBrowseServerDirectoryRequest>(payload)?;
    let result = rpc
        .authority()
        .browse_server_directory(&request.path)
        .await
        .map_err(files_status)?;
    Ok(encode(&FilesServiceBrowseServerDirectoryResponse {
        entries: result
            .entries
            .into_iter()
            .map(protocol_directory_entry)
            .collect(),
        resolved_path: result.resolved_path,
    }))
}

pub(in crate::rpc) async fn list(rpc: &FilesRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<FilesServiceListRequest>(payload)?;
    let worktree = required(&request.worktree, "worktree")?;
    let result = rpc
        .authority()
        .list_mobile(worktree)
        .await
        .map_err(files_status)?;
    Ok(encode(&FilesServiceListResponse {
        result: Some(protocol_file_list_result(result)),
    }))
}

pub(in crate::rpc) async fn search_paths(
    rpc: &FilesRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<FilesServiceSearchPathsRequest>(payload)?;
    let worktree = required(&request.worktree, "worktree")?;
    if request.query.encode_utf16().count() > MAX_SEARCH_PATHS_QUERY_UTF16_LENGTH {
        return Err(invalid("query is too long"));
    }
    let limit = match request.limit {
        None => DEFAULT_SEARCH_PATHS_LIMIT,
        Some(limit) if (1..=MAX_SEARCH_PATHS_LIMIT).contains(&limit) => limit,
        Some(_) => return Err(invalid("limit must be between 1 and 32")),
    };
    let result = rpc
        .authority()
        .search_mobile_paths(worktree, &request.query, limit as usize)
        .await
        .map_err(files_status)?;
    Ok(encode(&FilesServiceSearchPathsResponse {
        result: Some(protocol_file_list_result(result)),
    }))
}

pub(in crate::rpc) async fn list_all(rpc: &FilesRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<FilesServiceListAllRequest>(payload)?;
    let worktree = required(&request.worktree, "worktree")?;
    let relative_paths = rpc
        .authority()
        .list_all(worktree, &request.exclude_paths)
        .await
        .map_err(files_status)?;
    Ok(encode(&FilesServiceListAllResponse { relative_paths }))
}

pub(in crate::rpc) async fn list_markdown_documents(
    rpc: &FilesRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<FilesServiceListMarkdownDocumentsRequest>(payload)?;
    let worktree = required(&request.worktree, "worktree")?;
    let documents = rpc
        .authority()
        .list_markdown_documents(worktree)
        .await
        .map_err(files_status)?;
    Ok(encode(&FilesServiceListMarkdownDocumentsResponse {
        documents: documents
            .into_iter()
            .map(protocol_markdown_document)
            .collect(),
    }))
}

pub(in crate::rpc) async fn open(rpc: &FilesRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<FilesServiceOpenRequest>(payload)?;
    let worktree = required(&request.worktree, "worktree")?;
    let relative_path = required(&request.relative_path, "relative_path")?;
    let result = rpc
        .authority()
        .open(worktree, relative_path)
        .await
        .map_err(files_status)?;
    Ok(encode(&FilesServiceOpenResponse {
        result: Some(protocol_file_open_result(result)),
    }))
}

pub(in crate::rpc) async fn open_diff(rpc: &FilesRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<FilesServiceOpenDiffRequest>(payload)?;
    let worktree = required(&request.worktree, "worktree")?;
    let relative_path = required(&request.relative_path, "relative_path")?;
    let result = rpc
        .authority()
        .open_diff(worktree, relative_path, request.staged)
        .await
        .map_err(files_status)?;
    Ok(encode(&FilesServiceOpenDiffResponse {
        result: Some(protocol_file_open_result(result)),
    }))
}

pub(in crate::rpc) async fn read(rpc: &FilesRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<FilesServiceReadRequest>(payload)?;
    let worktree = required(&request.worktree, "worktree")?;
    let relative_path = required(&request.relative_path, "relative_path")?;
    let result = rpc
        .authority()
        .read_mobile(worktree, relative_path)
        .await
        .map_err(files_status)?;
    Ok(encode(&FilesServiceReadResponse {
        result: Some(protocol_file_read_result(result)),
    }))
}

pub(in crate::rpc) async fn read_chunk(rpc: &FilesRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<FilesServiceReadChunkRequest>(payload)?;
    let worktree = required(&request.worktree, "worktree")?;
    let relative_path = required(&request.relative_path, "relative_path")?;
    // Why: mirrors the legacy `files.readChunk` input cap so a protobuf caller cannot
    // request a larger chunk than the JSON transport ever allowed.
    if request.length == 0 || request.length > MAX_READ_CHUNK_BYTES {
        return Err(invalid("length must be between 1 and 524288"));
    }
    let result = rpc
        .authority()
        .read_chunk(
            worktree,
            relative_path,
            request.offset,
            request.length as usize,
        )
        .await
        .map_err(files_status)?;
    Ok(encode(&FilesServiceReadChunkResponse {
        content: decode_base64(&result.content_base64)?,
        bytes_read: result.bytes_read as u32,
        eof: result.eof,
    }))
}

pub(in crate::rpc) async fn read_directory(
    rpc: &FilesRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<FilesServiceReadDirectoryRequest>(payload)?;
    let worktree = required(&request.worktree, "worktree")?;
    let entries = rpc
        .authority()
        .read_directory(worktree, &request.relative_path)
        .await
        .map_err(files_status)?;
    Ok(encode(&FilesServiceReadDirectoryResponse {
        entries: entries.into_iter().map(protocol_directory_entry).collect(),
    }))
}

pub(in crate::rpc) async fn read_preview(
    rpc: &FilesRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<FilesServiceReadPreviewRequest>(payload)?;
    let worktree = required(&request.worktree, "worktree")?;
    let relative_path = required(&request.relative_path, "relative_path")?;
    let result = rpc
        .authority()
        .read_preview(worktree, relative_path)
        .await
        .map_err(files_status)?;
    Ok(encode(&FilesServiceReadPreviewResponse {
        result: Some(protocol_file_preview_result(result)?),
    }))
}

pub(in crate::rpc) async fn stat(rpc: &FilesRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<FilesServiceStatRequest>(payload)?;
    let worktree = required(&request.worktree, "worktree")?;
    let result = rpc
        .authority()
        .stat(worktree, &request.relative_path)
        .await
        .map_err(files_status)?;
    Ok(encode(&FilesServiceStatResponse {
        is_directory: result.is_directory,
        mtime: result.mtime,
        size: result.size,
    }))
}

pub(in crate::rpc) async fn search(rpc: &FilesRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<FilesServiceSearchRequest>(payload)?;
    let worktree = required(&request.worktree, "worktree")?;
    let query = required(&request.query, "query")?.to_owned();
    let result = rpc
        .authority()
        .search(
            worktree,
            SearchOptions {
                case_sensitive: request.case_sensitive,
                exclude_pattern: request.exclude_pattern,
                include_pattern: request.include_pattern,
                max_results: request.max_results.map_or(2_000, |value| value as usize),
                query,
                use_regex: request.use_regex,
                whole_word: request.whole_word,
            },
        )
        .await
        .map_err(files_status)?;
    let (files, total_matches, truncated) = protocol_file_search_result(result);
    Ok(encode(&FilesServiceSearchResponse {
        files,
        total_matches,
        truncated,
    }))
}

pub(in crate::rpc) async fn write(rpc: &FilesRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<FilesServiceWriteRequest>(payload)?;
    let worktree = required(&request.worktree, "worktree")?;
    let relative_path = required(&request.relative_path, "relative_path")?;
    let result = rpc
        .authority()
        .write(worktree, relative_path, &request.content)
        .await
        .map_err(files_status)?;
    Ok(encode(&FilesServiceWriteResponse {
        result: Some(protocol_mutation_result(result)),
    }))
}

pub(in crate::rpc) async fn write_base64(
    rpc: &FilesRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<FilesServiceWriteBase64Request>(payload)?;
    let worktree = required(&request.worktree, "worktree")?;
    let relative_path = required(&request.relative_path, "relative_path")?;
    let content_base64 = encode_base64(&request.content);
    let result = rpc
        .authority()
        .write_base64(worktree, relative_path, &content_base64)
        .await
        .map_err(files_status)?;
    Ok(encode(&FilesServiceWriteBase64Response {
        result: Some(protocol_mutation_result(result)),
    }))
}

pub(in crate::rpc) async fn write_base64_chunk(
    rpc: &FilesRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<FilesServiceWriteBase64ChunkRequest>(payload)?;
    let worktree = required(&request.worktree, "worktree")?;
    let relative_path = required(&request.relative_path, "relative_path")?;
    let content_base64 = encode_base64(&request.content);
    let result = rpc
        .authority()
        .write_base64_chunk(worktree, relative_path, &content_base64, request.append)
        .await
        .map_err(files_status)?;
    Ok(encode(&FilesServiceWriteBase64ChunkResponse {
        result: Some(protocol_mutation_result(result)),
    }))
}

pub(in crate::rpc) async fn create_file(rpc: &FilesRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<FilesServiceCreateFileRequest>(payload)?;
    let worktree = required(&request.worktree, "worktree")?;
    let relative_path = required(&request.relative_path, "relative_path")?;
    let result = rpc
        .authority()
        .create_file(worktree, relative_path)
        .await
        .map_err(files_status)?;
    Ok(encode(&FilesServiceCreateFileResponse {
        result: Some(protocol_mutation_result(result)),
    }))
}

pub(in crate::rpc) async fn create_directory(
    rpc: &FilesRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<FilesServiceCreateDirectoryRequest>(payload)?;
    let worktree = required(&request.worktree, "worktree")?;
    let relative_path = required(&request.relative_path, "relative_path")?;
    let result = rpc
        .authority()
        .create_directory(worktree, relative_path)
        .await
        .map_err(files_status)?;
    Ok(encode(&FilesServiceCreateDirectoryResponse {
        result: Some(protocol_mutation_result(result)),
    }))
}

pub(in crate::rpc) async fn create_directory_no_clobber(
    rpc: &FilesRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<FilesServiceCreateDirectoryNoClobberRequest>(payload)?;
    let worktree = required(&request.worktree, "worktree")?;
    let relative_path = required(&request.relative_path, "relative_path")?;
    let result = rpc
        .authority()
        .create_directory_no_clobber(worktree, relative_path)
        .await
        .map_err(files_status)?;
    Ok(encode(&FilesServiceCreateDirectoryNoClobberResponse {
        result: Some(protocol_mutation_result(result)),
    }))
}

pub(in crate::rpc) async fn commit_upload(
    rpc: &FilesRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<FilesServiceCommitUploadRequest>(payload)?;
    let worktree = required(&request.worktree, "worktree")?;
    let temporary_relative_path = required(&request.temp_relative_path, "temp_relative_path")?;
    let final_relative_path = required(&request.final_relative_path, "final_relative_path")?;
    let result = rpc
        .authority()
        .commit_upload(worktree, temporary_relative_path, final_relative_path)
        .await
        .map_err(files_status)?;
    Ok(encode(&FilesServiceCommitUploadResponse {
        result: Some(protocol_mutation_result(result)),
    }))
}

pub(in crate::rpc) async fn rename(rpc: &FilesRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<FilesServiceRenameRequest>(payload)?;
    let worktree = required(&request.worktree, "worktree")?;
    let old_relative_path = required(&request.old_relative_path, "old_relative_path")?;
    let new_relative_path = required(&request.new_relative_path, "new_relative_path")?;
    let result = rpc
        .authority()
        .rename(worktree, old_relative_path, new_relative_path)
        .await
        .map_err(files_status)?;
    Ok(encode(&FilesServiceRenameResponse {
        result: Some(protocol_mutation_result(result)),
    }))
}

pub(in crate::rpc) async fn copy(rpc: &FilesRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<FilesServiceCopyRequest>(payload)?;
    let worktree = required(&request.worktree, "worktree")?;
    let source_relative_path = required(&request.source_relative_path, "source_relative_path")?;
    let destination_relative_path = required(
        &request.destination_relative_path,
        "destination_relative_path",
    )?;
    let result = rpc
        .authority()
        .copy(worktree, source_relative_path, destination_relative_path)
        .await
        .map_err(files_status)?;
    Ok(encode(&FilesServiceCopyResponse {
        result: Some(protocol_mutation_result(result)),
    }))
}

pub(in crate::rpc) async fn delete(rpc: &FilesRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<FilesServiceDeleteRequest>(payload)?;
    let worktree = required(&request.worktree, "worktree")?;
    let relative_path = required(&request.relative_path, "relative_path")?;
    let result = rpc
        .authority()
        .delete(worktree, relative_path, request.recursive)
        .await
        .map_err(files_status)?;
    Ok(encode(&FilesServiceDeleteResponse {
        result: Some(protocol_mutation_result(result)),
    }))
}

pub(in crate::rpc) async fn resolve_terminal_path(
    rpc: &FilesRpc,
    payload: &[u8],
    client_id: &str,
) -> Result<Vec<u8>, Status> {
    let request = decode::<FilesServiceResolveTerminalPathRequest>(payload)?;
    let worktree = required(&request.worktree, "worktree")?;
    let path_text = required(&request.path_text, "path_text")?;
    let result = rpc
        .authority()
        .resolve_terminal_path(
            worktree,
            path_text,
            request.cwd.as_deref(),
            request.terminal.as_deref(),
            client_id,
        )
        .await
        .map_err(files_status)?;
    Ok(encode(&FilesServiceResolveTerminalPathResponse {
        result: Some(protocol_terminal_path_resolution(result)),
    }))
}

pub(in crate::rpc) async fn read_terminal_artifact(
    rpc: &FilesRpc,
    payload: &[u8],
    client_id: &str,
) -> Result<Vec<u8>, Status> {
    let request = decode::<FilesServiceReadTerminalArtifactRequest>(payload)?;
    let worktree = required(&request.worktree, "worktree")?;
    let grant_id = required(&request.grant_id, "grant_id")?;
    let absolute_path = required(&request.absolute_path, "absolute_path")?;
    let result = rpc
        .authority()
        .read_terminal_artifact(worktree, grant_id, absolute_path, client_id)
        .await
        .map_err(files_status)?;
    Ok(encode(&FilesServiceReadTerminalArtifactResponse {
        result: Some(protocol_file_read_result(result)),
    }))
}

pub(in crate::rpc) async fn read_terminal_artifact_preview(
    rpc: &FilesRpc,
    payload: &[u8],
    client_id: &str,
) -> Result<Vec<u8>, Status> {
    let request = decode::<FilesServiceReadTerminalArtifactPreviewRequest>(payload)?;
    let worktree = required(&request.worktree, "worktree")?;
    let grant_id = required(&request.grant_id, "grant_id")?;
    let absolute_path = required(&request.absolute_path, "absolute_path")?;
    let result = rpc
        .authority()
        .preview_terminal_artifact(worktree, grant_id, absolute_path, client_id)
        .await
        .map_err(files_status)?;
    Ok(encode(&FilesServiceReadTerminalArtifactPreviewResponse {
        result: Some(protocol_file_preview_result(result)?),
    }))
}

pub(in crate::rpc) async fn write_terminal_artifact(
    rpc: &FilesRpc,
    payload: &[u8],
    client_id: &str,
) -> Result<Vec<u8>, Status> {
    let request = decode::<FilesServiceWriteTerminalArtifactRequest>(payload)?;
    let worktree = required(&request.worktree, "worktree")?;
    let grant_id = required(&request.grant_id, "grant_id")?;
    let absolute_path = required(&request.absolute_path, "absolute_path")?;
    let result = rpc
        .authority()
        .write_terminal_artifact(
            worktree,
            grant_id,
            absolute_path,
            &request.content,
            client_id,
        )
        .await
        .map_err(files_status)?;
    Ok(encode(&FilesServiceWriteTerminalArtifactResponse {
        result: Some(protocol_mutation_result(result)),
    }))
}

pub(in crate::rpc) async fn read_log_tail(
    rpc: &FilesRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<FilesServiceReadLogTailRequest>(payload)?;
    let file_path = required(&request.file_path, "file_path")?;
    let result = rpc
        .authority()
        .read_log_tail(
            file_path,
            request.from_byte_offset,
            request.expected_identity.as_deref(),
        )
        .await
        .map_err(files_status)?;
    Ok(encode(&FilesServiceReadLogTailResponse {
        content: decode_base64(&result.content_base64)?,
        file_identity: result.file_identity,
        file_size: result.file_size,
        has_more: result.has_more,
        next_byte_offset: result.next_byte_offset,
        reset: result.reset,
    }))
}

/// Streams file-change batches for one worktree until the caller cancels the call —
/// the protobuf transport's native stream cancellation is `files.unwatch`'s
/// replacement, so there is no separate unwatch RPC to invoke here.
pub(in crate::rpc) async fn watch(
    rpc: &FilesRpc,
    payload: &[u8],
    connection_id: &str,
    context: &ProtocolCallContext,
) -> Result<(), Status> {
    let request = decode::<FilesServiceWatchRequest>(payload)?;
    let worktree = required(&request.worktree, "worktree")?;
    let mut subscription = rpc
        .authority()
        .watch(worktree, connection_id)
        .await
        .map_err(files_status)?;
    while let Some(event) = subscription.next().await {
        context
            .send_stream_payload(encode(&FilesServiceWatchResponse {
                event: Some(protocol_watch_event(event)),
            }))
            .await?;
    }
    Ok(())
}

pub(in crate::rpc) async fn watch_log_tail(
    rpc: &FilesRpc,
    payload: &[u8],
    connection_id: &str,
    context: &ProtocolCallContext,
) -> Result<(), Status> {
    let request = decode::<FilesServiceWatchLogTailRequest>(payload)?;
    let file_path = required(&request.file_path, "file_path")?;
    let mut subscription = rpc
        .authority()
        .watch_log_tail(file_path, connection_id)
        .await
        .map_err(files_status)?;
    while let Some(event) = subscription.next().await {
        context
            .send_stream_payload(encode(&FilesServiceWatchLogTailResponse {
                event: Some(protocol_log_tail_watch_event(event)),
            }))
            .await?;
    }
    Ok(())
}

fn protocol_watch_event(event: FileWatchEvent) -> files_service_watch_response::Event {
    match event {
        FileWatchEvent::Starting { subscription_id } => {
            files_service_watch_response::Event::Starting(FileWatchStarting { subscription_id })
        }
        FileWatchEvent::Ready { subscription_id } => {
            files_service_watch_response::Event::Ready(FileWatchReady { subscription_id })
        }
        FileWatchEvent::Changed { events, worktree } => {
            files_service_watch_response::Event::Changed(FileWatchChanged {
                events: events.into_iter().map(protocol_file_change_event).collect(),
                worktree,
            })
        }
        FileWatchEvent::Error { message } => {
            files_service_watch_response::Event::Error(FileWatchError { message })
        }
        FileWatchEvent::End => files_service_watch_response::Event::End(FileWatchEnd {}),
    }
}

fn protocol_log_tail_watch_event(
    event: LogTailWatchEvent,
) -> files_service_watch_log_tail_response::Event {
    match event {
        LogTailWatchEvent::Ready { subscription_id } => {
            files_service_watch_log_tail_response::Event::Ready(LogTailWatchReady {
                subscription_id,
            })
        }
        LogTailWatchEvent::Changed { event_type } => {
            files_service_watch_log_tail_response::Event::Changed(LogTailWatchChanged {
                event_type: protocol_log_tail_change_kind(event_type) as i32,
            })
        }
        LogTailWatchEvent::End => {
            files_service_watch_log_tail_response::Event::End(LogTailWatchEnd {})
        }
    }
}

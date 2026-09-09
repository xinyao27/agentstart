// Why: one place translates the files authority's plain Rust value shapes into the
// protobuf wire messages, so every handler in `protocol.rs` shares the same mapping
// instead of re-deriving it per method.
use base64::Engine;
use yiru_protocol::protocol::v1::{Status, StatusCode};
use yiru_protocol::runtime::v1::{
    DirectoryEntry as ProtocolDirectoryEntry, FileChangeEvent as ProtocolFileChangeEvent,
    FileChangeKind, FileKind, FileListEntry as ProtocolFileListEntry,
    FileListResult as ProtocolFileListResult, FileOpenResult as ProtocolFileOpenResult,
    FilePreviewResult as ProtocolFilePreviewResult, FileReadResult as ProtocolFileReadResult,
    LogTailChangeKind, MarkdownDocument as ProtocolMarkdownDocument,
    MutationResult as ProtocolMutationResult, SearchFileResult as ProtocolSearchFileResult,
    SearchMatch as ProtocolSearchMatch, TerminalArtifactProvider,
    TerminalOpenTarget as ProtocolTerminalOpenTarget,
    TerminalPathResolution as ProtocolTerminalPathResolution,
    terminal_open_target::Target as ProtocolTerminalTarget,
};

use crate::files::{
    DirectoryEntry, FileChangeEvent, FileListEntry, FileListResult, FileOpenResult,
    FilePreviewResult, FileReadResult, FileSearchResult, FilesError, MarkdownDocument,
    MutationResult, SearchFileResult, SearchMatch, TerminalOpenTarget, TerminalPathResolution,
};

pub(super) fn files_status(error: FilesError) -> Status {
    let code = match &error {
        FilesError::BinaryFile => StatusCode::FailedPrecondition,
        FilesError::FileTooLarge => StatusCode::OutOfRange,
        FilesError::MissingPath(_) => StatusCode::NotFound,
        FilesError::PathExists(_) => StatusCode::AlreadyExists,
        FilesError::InvalidInput(_) => StatusCode::InvalidArgument,
        FilesError::HomeUnavailable
        | FilesError::RendererUnavailable
        | FilesError::TerminalGrantExpired
        | FilesError::TerminalGrantMismatch
        | FilesError::TerminalGrantStale => StatusCode::FailedPrecondition,
        FilesError::Project(_) | FilesError::WorkspacePath(_) | FilesError::Worktree(_) => {
            StatusCode::InvalidArgument
        }
        FilesError::CommandFailed(_)
        | FilesError::Filesystem(_)
        | FilesError::Host(_)
        | FilesError::HostRegistry(_)
        | FilesError::Io(_)
        | FilesError::Notify(_)
        | FilesError::Protocol(_)
        | FilesError::Random(_)
        | FilesError::Serialization(_) => StatusCode::Internal,
    };
    status(code, &error.to_string())
}

pub(super) fn status(code: StatusCode, message: &str) -> Status {
    Status {
        code: code as i32,
        message: message.to_owned(),
        details: Vec::new(),
    }
}

pub(super) fn invalid(message: &str) -> Status {
    status(StatusCode::InvalidArgument, message)
}

pub(super) fn required<'a>(value: &'a str, field: &'static str) -> Result<&'a str, Status> {
    let trimmed = crate::repositories::ecmascript::trim(value);
    if trimmed.is_empty() {
        Err(invalid(&format!("{field} is required")))
    } else {
        Ok(trimmed)
    }
}

pub(super) fn encode_base64(content: &[u8]) -> String {
    base64::engine::general_purpose::STANDARD.encode(content)
}

pub(super) fn decode_base64(content_base64: &str) -> Result<Vec<u8>, Status> {
    base64::engine::general_purpose::STANDARD
        .decode(content_base64)
        .map_err(|_| invalid("content is not valid base64"))
}

pub(super) fn protocol_file_kind(value: &'static str) -> FileKind {
    match value {
        "text" => FileKind::Text,
        "binary" => FileKind::Binary,
        "image" => FileKind::Image,
        "markdown" => FileKind::Markdown,
        _ => FileKind::Unspecified,
    }
}

fn protocol_terminal_provider(value: &'static str) -> TerminalArtifactProvider {
    match value {
        "local" => TerminalArtifactProvider::Local,
        "ssh" => TerminalArtifactProvider::Ssh,
        _ => TerminalArtifactProvider::Unspecified,
    }
}

pub(super) fn protocol_file_change_kind(value: &'static str) -> FileChangeKind {
    match value {
        "create" => FileChangeKind::Create,
        "delete" => FileChangeKind::Delete,
        "update" => FileChangeKind::Update,
        "overflow" => FileChangeKind::Overflow,
        _ => FileChangeKind::Unspecified,
    }
}

pub(super) fn protocol_log_tail_change_kind(value: &'static str) -> LogTailChangeKind {
    match value {
        "rename" => LogTailChangeKind::Rename,
        "change" => LogTailChangeKind::Change,
        _ => LogTailChangeKind::Unspecified,
    }
}

pub(super) fn protocol_directory_entry(entry: DirectoryEntry) -> ProtocolDirectoryEntry {
    ProtocolDirectoryEntry {
        name: entry.name,
        is_directory: entry.is_directory,
        is_symlink: entry.is_symlink,
    }
}

fn protocol_file_list_entry(entry: FileListEntry) -> ProtocolFileListEntry {
    ProtocolFileListEntry {
        basename: entry.basename,
        kind: protocol_file_kind(entry.kind) as i32,
        relative_path: entry.relative_path,
    }
}

pub(super) fn protocol_file_list_result(result: FileListResult) -> ProtocolFileListResult {
    ProtocolFileListResult {
        files: result
            .files
            .into_iter()
            .map(protocol_file_list_entry)
            .collect(),
        root_path: result.root_path,
        total_count: result.total_count as u64,
        truncated: result.truncated,
        worktree: result.worktree,
    }
}

pub(super) fn protocol_file_open_result(result: FileOpenResult) -> ProtocolFileOpenResult {
    ProtocolFileOpenResult {
        kind: protocol_file_kind(result.kind) as i32,
        opened: result.opened,
        relative_path: result.relative_path,
        worktree: result.worktree,
    }
}

pub(super) fn protocol_file_read_result(result: FileReadResult) -> ProtocolFileReadResult {
    ProtocolFileReadResult {
        content: result.content,
        byte_length: result.byte_length as u64,
        truncated: result.truncated,
        relative_path: result.relative_path,
        worktree: result.worktree,
    }
}

// Why: the authority already base64-encodes an image/PDF preview so it can travel
// through the legacy JSON transport; protobuf carries raw bytes, so this is the one
// place that base64 layer is peeled back off before the wire message is built.
pub(super) fn protocol_file_preview_result(
    result: FilePreviewResult,
) -> Result<ProtocolFilePreviewResult, Status> {
    let content = if !result.is_binary {
        result.content.into_bytes()
    } else if result.mime_type.is_some() {
        decode_base64(&result.content)?
    } else {
        Vec::new()
    };
    Ok(ProtocolFilePreviewResult {
        content,
        is_binary: result.is_binary,
        is_image: result.is_image,
        mime_type: result.mime_type.map(str::to_owned),
    })
}

pub(super) fn protocol_mutation_result(result: MutationResult) -> ProtocolMutationResult {
    ProtocolMutationResult { ok: result.ok }
}

fn protocol_search_match(value: SearchMatch) -> ProtocolSearchMatch {
    ProtocolSearchMatch {
        line: value.line as u32,
        column: value.column as u32,
        match_length: value.match_length as u32,
        line_content: value.line_content,
        display_column: value.display_column.map(|value| value as u32),
        display_match_length: value.display_match_length.map(|value| value as u32),
    }
}

fn protocol_search_file_result(value: SearchFileResult) -> ProtocolSearchFileResult {
    ProtocolSearchFileResult {
        file_path: value.file_path,
        relative_path: value.relative_path,
        match_count: value.match_count as u32,
        matches: value
            .matches
            .into_iter()
            .map(protocol_search_match)
            .collect(),
    }
}

pub(super) fn protocol_file_search_result(
    result: FileSearchResult,
) -> (Vec<ProtocolSearchFileResult>, u32, bool) {
    (
        result
            .files
            .into_iter()
            .map(protocol_search_file_result)
            .collect(),
        result.total_matches as u32,
        result.truncated,
    )
}

pub(super) fn protocol_markdown_document(value: MarkdownDocument) -> ProtocolMarkdownDocument {
    ProtocolMarkdownDocument {
        basename: value.basename,
        file_path: value.file_path,
        name: value.name,
        relative_path: value.relative_path,
    }
}

pub(super) fn protocol_terminal_open_target(
    target: TerminalOpenTarget,
) -> ProtocolTerminalOpenTarget {
    let target = match target {
        TerminalOpenTarget::WorktreeFile {
            absolute_path,
            provider,
            relative_path,
        } => ProtocolTerminalTarget::WorktreeFile(yiru_protocol::runtime::v1::WorktreeFileTarget {
            absolute_path,
            relative_path,
            provider: protocol_terminal_provider(provider) as i32,
        }),
        TerminalOpenTarget::AbsoluteFile {
            absolute_path,
            grant_id,
            provider,
        } => ProtocolTerminalTarget::AbsoluteFile(yiru_protocol::runtime::v1::AbsoluteFileTarget {
            absolute_path,
            grant_id,
            provider: protocol_terminal_provider(provider) as i32,
        }),
    };
    ProtocolTerminalOpenTarget {
        target: Some(target),
    }
}

pub(super) fn protocol_terminal_path_resolution(
    resolution: TerminalPathResolution,
) -> ProtocolTerminalPathResolution {
    ProtocolTerminalPathResolution {
        absolute_path: resolution.absolute_path,
        exists: resolution.exists,
        is_directory: resolution.is_directory,
        open_target: resolution.open_target.map(protocol_terminal_open_target),
        relative_path: resolution.relative_path,
        worktree: resolution.worktree,
    }
}

pub(super) fn protocol_file_change_event(event: FileChangeEvent) -> ProtocolFileChangeEvent {
    ProtocolFileChangeEvent {
        kind: protocol_file_change_kind(event.kind) as i32,
        absolute_path: event.absolute_path,
        old_absolute_path: event.old_absolute_path,
        is_directory: event.is_directory,
    }
}

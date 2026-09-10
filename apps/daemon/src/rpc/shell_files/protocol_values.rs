// Why: one place translates the shell files authority's plain Rust value
// shapes into the protobuf wire messages, so every handler in `protocol.rs`
// shares the same mapping instead of re-deriving it per method.
use agentstart_protocol::protocol::v1::{Status, StatusCode};
use agentstart_protocol::runtime::v1::shell_files_staged_import_entry::Kind as ProtocolStagedEntryKind;
use agentstart_protocol::runtime::v1::shell_files_staged_source::Outcome as ProtocolStagedOutcome;
use agentstart_protocol::runtime::v1::{
    ShellFilesDroppedPathFailure as ProtocolDroppedPathFailure,
    ShellFilesDroppedPathSkip as ProtocolDroppedPathSkip, ShellFilesFailedOutcome,
    ShellFilesImportSkipReason, ShellFilesMutationResult, ShellFilesSkippedOutcome,
    ShellFilesStagedDirectoryEntry, ShellFilesStagedFileEntry,
    ShellFilesStagedImportEntry as ProtocolStagedImportEntry,
    ShellFilesStagedOutcome as ProtocolStagedOutcomeMessage,
    ShellFilesStagedSource as ProtocolStagedSource, ShellFilesStagedSourceKind,
};

use crate::shell_files::{
    DroppedPathFailure, DroppedPathSkip, ImportSkipReason, ResolveDroppedPathsResult,
    ShellFileError, StageExternalPathsResult, StagedExternalImportEntry,
    StagedExternalImportSource, StagedSourceKind,
};

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

// Why: the legacy JSON transport always collapsed every shell files domain
// error to a bare 500 with no detail (`send_internal_error`); this mirrors
// that exactly rather than inventing status codes the client never saw.
pub(super) fn shell_files_status(_error: ShellFileError) -> Status {
    status(StatusCode::Internal, "Internal server error")
}

pub(super) fn mutation_result() -> ShellFilesMutationResult {
    ShellFilesMutationResult { ok: true }
}

pub(super) fn dropped_paths_response(
    result: ResolveDroppedPathsResult,
) -> (
    Vec<String>,
    Vec<ProtocolDroppedPathSkip>,
    Vec<ProtocolDroppedPathFailure>,
) {
    (
        result.resolved_paths,
        result
            .skipped
            .into_iter()
            .map(protocol_dropped_path_skip)
            .collect(),
        result
            .failed
            .into_iter()
            .map(protocol_dropped_path_failure)
            .collect(),
    )
}

fn protocol_dropped_path_skip(skip: DroppedPathSkip) -> ProtocolDroppedPathSkip {
    ProtocolDroppedPathSkip {
        source_path: skip.source_path,
        reason: skip.reason.to_owned(),
    }
}

fn protocol_dropped_path_failure(failure: DroppedPathFailure) -> ProtocolDroppedPathFailure {
    ProtocolDroppedPathFailure {
        source_path: failure.source_path,
        reason: failure.reason,
    }
}

pub(super) fn staged_sources(result: StageExternalPathsResult) -> Vec<ProtocolStagedSource> {
    result
        .sources
        .into_iter()
        .map(protocol_staged_source)
        .collect()
}

fn protocol_staged_source(source: StagedExternalImportSource) -> ProtocolStagedSource {
    match source {
        StagedExternalImportSource::Staged {
            source_path,
            name,
            kind,
            entries,
        } => ProtocolStagedSource {
            source_path,
            outcome: Some(ProtocolStagedOutcome::Staged(
                ProtocolStagedOutcomeMessage {
                    name,
                    kind: protocol_staged_source_kind(kind) as i32,
                    entries: entries.into_iter().map(protocol_staged_entry).collect(),
                },
            )),
        },
        StagedExternalImportSource::Skipped {
            source_path,
            reason,
        } => ProtocolStagedSource {
            source_path,
            outcome: Some(ProtocolStagedOutcome::Skipped(ShellFilesSkippedOutcome {
                reason: protocol_import_skip_reason(reason) as i32,
            })),
        },
        StagedExternalImportSource::Failed {
            source_path,
            reason,
        } => ProtocolStagedSource {
            source_path,
            outcome: Some(ProtocolStagedOutcome::Failed(ShellFilesFailedOutcome {
                reason,
            })),
        },
    }
}

fn protocol_staged_entry(entry: StagedExternalImportEntry) -> ProtocolStagedImportEntry {
    match entry {
        StagedExternalImportEntry::Directory { relative_path } => ProtocolStagedImportEntry {
            kind: Some(ProtocolStagedEntryKind::Directory(
                ShellFilesStagedDirectoryEntry { relative_path },
            )),
        },
        StagedExternalImportEntry::File {
            relative_path,
            content,
        } => ProtocolStagedImportEntry {
            kind: Some(ProtocolStagedEntryKind::File(ShellFilesStagedFileEntry {
                relative_path,
                content,
            })),
        },
    }
}

fn protocol_staged_source_kind(kind: StagedSourceKind) -> ShellFilesStagedSourceKind {
    match kind {
        StagedSourceKind::Directory => ShellFilesStagedSourceKind::Directory,
        StagedSourceKind::File => ShellFilesStagedSourceKind::File,
    }
}

fn protocol_import_skip_reason(reason: ImportSkipReason) -> ShellFilesImportSkipReason {
    match reason {
        ImportSkipReason::Missing => ShellFilesImportSkipReason::Missing,
        ImportSkipReason::PermissionDenied => ShellFilesImportSkipReason::PermissionDenied,
        ImportSkipReason::Symlink => ShellFilesImportSkipReason::Symlink,
        ImportSkipReason::Unsupported => ShellFilesImportSkipReason::Unsupported,
    }
}

use agentstart_protocol::protocol::v1::{Status, StatusCode};
use agentstart_protocol::runtime::v1::{
    MarkdownReadOnlyReason, MarkdownServiceReadTabRequest, MarkdownServiceReadTabResponse,
    MarkdownServiceSaveTabRequest, MarkdownServiceSaveTabResponse, MarkdownSource,
};
use agentstart_protocol::transport::{decode, encode};
use serde_json::Value;

use crate::projects::ProjectCatalogError;
use crate::session_tabs::SessionTabsError;
use crate::shell_services::ShellServicesError;
use crate::worktrees::WorktreeCatalogError;

use super::MarkdownRpc;
use super::MarkdownRpcError;

const MAX_SELECTOR_CODE_UNITS: usize = 4_096;

pub(in crate::rpc) async fn read_tab(rpc: &MarkdownRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<MarkdownServiceReadTabRequest>(payload)?;
    let worktree = selector(&request.worktree, "worktree")?;
    let tab_id = selector(&request.tab_id, "tabId")?;
    let document = rpc
        .protocol_read_tab(worktree, tab_id)
        .await
        .map_err(rpc_status)?;
    Ok(encode(&MarkdownServiceReadTabResponse {
        tab_id: text(&document, "tabId"),
        file_path: text(&document, "filePath"),
        relative_path: text(&document, "relativePath"),
        content: text(&document, "content"),
        is_dirty: boolean(&document, "isDirty"),
        version: text(&document, "version"),
        source: source(&document)?,
        editable: boolean(&document, "editable"),
        read_only_reason: read_only_reason(&document),
    }))
}

pub(in crate::rpc) async fn save_tab(rpc: &MarkdownRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<MarkdownServiceSaveTabRequest>(payload)?;
    let worktree = selector(&request.worktree, "worktree")?;
    let tab_id = selector(&request.tab_id, "tabId")?;
    if request.base_version.is_empty() {
        return Err(invalid_argument(
            "baseVersion must contain at least 1 character",
        ));
    }
    let document = rpc
        .protocol_save_tab(worktree, tab_id, request.base_version, request.content)
        .await
        .map_err(rpc_status)?;
    Ok(encode(&MarkdownServiceSaveTabResponse {
        tab_id: text(&document, "tabId"),
        version: text(&document, "version"),
        is_dirty: boolean(&document, "isDirty"),
        content: text(&document, "content"),
    }))
}

fn selector(value: &str, field: &str) -> Result<String, Status> {
    if value.is_empty() || value.encode_utf16().count() > MAX_SELECTOR_CODE_UNITS {
        return Err(invalid_argument(&format!(
            "{field} must contain 1 through {MAX_SELECTOR_CODE_UNITS} UTF-16 code units"
        )));
    }
    Ok(value.to_owned())
}

fn source(document: &Value) -> Result<i32, Status> {
    match document.get("source").and_then(Value::as_str) {
        Some("draft") => Ok(MarkdownSource::Draft as i32),
        Some("file") => Ok(MarkdownSource::File as i32),
        _ => Err(data_loss("Markdown tab source is invalid")),
    }
}

fn read_only_reason(document: &Value) -> Option<i32> {
    let reason = match document.get("readOnlyReason").and_then(Value::as_str) {
        Some("unsupported_preview") => MarkdownReadOnlyReason::UnsupportedPreview,
        Some("unsupported_tab") => MarkdownReadOnlyReason::UnsupportedTab,
        Some("unsupported_untitled") => MarkdownReadOnlyReason::UnsupportedUntitled,
        Some("file_too_large") => MarkdownReadOnlyReason::FileTooLarge,
        _ => return None,
    };
    Some(i32::from(reason))
}

fn text(document: &Value, field: &str) -> String {
    document
        .get(field)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned()
}

fn boolean(document: &Value, field: &str) -> bool {
    document
        .get(field)
        .and_then(Value::as_bool)
        .unwrap_or_default()
}

fn rpc_status(error: MarkdownRpcError) -> Status {
    let code = match &error {
        MarkdownRpcError::SessionTabs(error) => match error {
            // Why: the legacy markdown verbs answered session-tab failures with
            // the same code strings the session.tabs table used, so the
            // protobuf surface keeps those codes.
            SessionTabsError::EditorDirty
            | SessionTabsError::HostProvenance
            | SessionTabsError::StateChanged => StatusCode::FailedPrecondition,
            SessionTabsError::TabNotFound
            | SessionTabsError::AfterTabNotFound
            | SessionTabsError::Worktree(WorktreeCatalogError::NotFound)
            | SessionTabsError::Worktree(WorktreeCatalogError::Project(
                ProjectCatalogError::NotFound,
            )) => StatusCode::NotFound,
            SessionTabsError::Worktree(WorktreeCatalogError::AmbiguousSelector)
            | SessionTabsError::Worktree(WorktreeCatalogError::Project(
                ProjectCatalogError::AmbiguousSelector,
            )) => StatusCode::FailedPrecondition,
            SessionTabsError::ClientDisconnected
            | SessionTabsError::DuplicateTabOrder
            | SessionTabsError::InvalidTabOrder
            | SessionTabsError::RendererUnavailable
            | SessionTabsError::TargetGroupNotFound
            | SessionTabsError::TerminalTabPinned
            | SessionTabsError::Session(_)
            | SessionTabsError::Shell(_)
            | SessionTabsError::Terminal(_)
            | SessionTabsError::Worktree(_) => StatusCode::Internal,
        },
        MarkdownRpcError::Shell(error) => match error.as_ref() {
            ShellServicesError::Remote { status, .. } => {
                StatusCode::try_from(numeric_status(*status)).unwrap_or(StatusCode::Internal)
            }
            ShellServicesError::Overloaded => StatusCode::Unavailable,
            ShellServicesError::Unavailable
            | ShellServicesError::InvalidResponse
            | ShellServicesError::Timeout => StatusCode::Internal,
        },
    };
    status(code, &error.to_string())
}

fn numeric_status(status: u16) -> i32 {
    match status {
        400 => StatusCode::InvalidArgument as i32,
        401 => StatusCode::Unauthenticated as i32,
        403 => StatusCode::PermissionDenied as i32,
        404 => StatusCode::NotFound as i32,
        409 => StatusCode::FailedPrecondition as i32,
        429 => StatusCode::ResourceExhausted as i32,
        504 => StatusCode::DeadlineExceeded as i32,
        _ => StatusCode::Internal as i32,
    }
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

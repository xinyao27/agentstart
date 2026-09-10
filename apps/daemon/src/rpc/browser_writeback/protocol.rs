use agentstart_protocol::protocol::v1::{Status, StatusCode};
use agentstart_protocol::runtime::v1::{
    BrowserWritebackApplyColorRequest, BrowserWritebackApplyColorResponse,
    BrowserWritebackApplyCssRequest, BrowserWritebackApplyCssResponse,
    BrowserWritebackLocateElementRequest, BrowserWritebackLocateElementResponse,
    BrowserWritebackRecordVerificationRequest, BrowserWritebackRecordVerificationResponse,
    BrowserWritebackTarget as ProtoTarget,
};
use agentstart_protocol::transport::{decode, encode};
use serde_json::Value;

use crate::rpc::protocol_call::status;

use super::input::{
    ApplyColorInput, ApplyCssInput, CssChange, ElementEvidence, LocateElementInput,
    RecordVerificationInput,
};
use super::{BrowserWritebackRpc, BrowserWritebackRpcError, Target};

const MAX_CSS_CHANGES: usize = 32;
const MAX_STYLE_PROPERTIES: usize = 64;

pub(in crate::rpc) async fn apply_color(
    rpc: &BrowserWritebackRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<BrowserWritebackApplyColorRequest>(payload)?;
    let color = valid_hex_color(&request.color)?;
    let result = rpc
        .apply_color(ApplyColorInput {
            color,
            intent: request.intent,
            target: decode_target(request.target)?,
        })
        .await
        .map_err(writeback_status)?;
    Ok(encode(&BrowserWritebackApplyColorResponse {
        terminal_handle: read_string(&result, "terminalHandle")?,
    }))
}

pub(in crate::rpc) async fn apply_css(
    rpc: &BrowserWritebackRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<BrowserWritebackApplyCssRequest>(payload)?;
    if request.changes.is_empty() || request.changes.len() > MAX_CSS_CHANGES {
        return Err(status(
            StatusCode::InvalidArgument,
            "browser_writeback_css_changes_invalid",
        ));
    }
    let result = rpc
        .apply_css(ApplyCssInput {
            changes: request
                .changes
                .into_iter()
                .map(|change| CssChange {
                    after: change.after,
                    before: change.before,
                    style_sheet_url: change.style_sheet_url,
                })
                .collect(),
            page_url: valid_url(&request.page_url)?,
            target: decode_target(request.target)?,
        })
        .await
        .map_err(writeback_status)?;
    Ok(encode(&BrowserWritebackApplyCssResponse {
        terminal_handle: read_string(&result, "terminalHandle")?,
    }))
}

pub(in crate::rpc) async fn locate_element(
    rpc: &BrowserWritebackRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<BrowserWritebackLocateElementRequest>(payload)?;
    if request.styles.len() > MAX_STYLE_PROPERTIES {
        return Err(status(
            StatusCode::InvalidArgument,
            "browser_writeback_styles_invalid",
        ));
    }
    let evidence = request.evidence.unwrap_or_default();
    let mut styles = serde_json::Map::new();
    for entry in request.styles {
        styles.insert(entry.name, Value::String(entry.value));
    }
    let result = rpc
        .locate_element(LocateElementInput {
            evidence: ElementEvidence {
                column: evidence.column,
                component_name: evidence.component_name,
                file_name: evidence.file_name,
                line: evidence.line,
            },
            outer_html: request.outer_html,
            page_url: valid_url(&request.page_url)?,
            selector: request.selector,
            styles,
            target: decode_target(request.target)?,
        })
        .await
        .map_err(writeback_status)?;
    Ok(encode(&BrowserWritebackLocateElementResponse {
        terminal_handle: read_string(&result, "terminalHandle")?,
    }))
}

pub(in crate::rpc) async fn record_verification(
    rpc: &BrowserWritebackRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<BrowserWritebackRecordVerificationRequest>(payload)?;
    let result = rpc
        .record_verification(RecordVerificationInput {
            detail: request.detail,
            page_url: valid_url(&request.page_url)?,
            success: request.success,
            target: decode_target(request.target)?,
            terminal_handle: request.terminal_handle,
        })
        .await
        .map_err(writeback_status)?;
    Ok(encode(&BrowserWritebackRecordVerificationResponse {
        event_id: read_i64(&result, "eventId")?,
    }))
}

fn decode_target(target: Option<ProtoTarget>) -> Result<Target, Status> {
    let target = target.ok_or_else(|| {
        status(
            StatusCode::InvalidArgument,
            "browser_writeback_target_required",
        )
    })?;
    Ok(Target {
        project_id: target.project_id,
        worktree_id: target.worktree_id,
    })
}

fn valid_hex_color(value: &str) -> Result<String, Status> {
    let is_hex_color = value.len() == 7
        && value.starts_with('#')
        && value[1..].bytes().all(|byte| byte.is_ascii_hexdigit());
    if !is_hex_color {
        return Err(status(
            StatusCode::InvalidArgument,
            "browser_writeback_color_invalid",
        ));
    }
    Ok(value.to_owned())
}

fn valid_url(value: &str) -> Result<String, Status> {
    url::Url::parse(value)
        .map_err(|_| status(StatusCode::InvalidArgument, "browser_writeback_url_invalid"))?;
    Ok(value.to_owned())
}

fn read_string(value: &Value, key: &str) -> Result<String, Status> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::to_owned)
        .ok_or_else(|| status(StatusCode::Internal, "browser_writeback_response_invalid"))
}

fn read_i64(value: &Value, key: &str) -> Result<i64, Status> {
    value
        .get(key)
        .and_then(Value::as_i64)
        .ok_or_else(|| status(StatusCode::Internal, "browser_writeback_response_invalid"))
}

fn writeback_status(error: BrowserWritebackRpcError) -> Status {
    match error {
        BrowserWritebackRpcError::PageIdentityMismatch
        | BrowserWritebackRpcError::WorkspaceIdentityMismatch
        | BrowserWritebackRpcError::TerminalMismatch => {
            status(StatusCode::FailedPrecondition, &error.to_string())
        }
        _ => status(StatusCode::Internal, &error.to_string()),
    }
}

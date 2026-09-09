use std::ffi::{OsStr, OsString};
use std::path::PathBuf;
use std::time::Duration;

use serde_json::{Map, Value, json};
use thiserror::Error;
use yiru_protocol::method_metadata::UnaryMethod;
use yiru_protocol::method_metadata::methods::{
    YiruRuntimeV1TerminalServiceClose as CloseMethod,
    YiruRuntimeV1TerminalServiceCreate as CreateMethod,
    YiruRuntimeV1TerminalServiceFocus as FocusMethod,
    YiruRuntimeV1TerminalServiceList as ListMethod, YiruRuntimeV1TerminalServiceRead as ReadMethod,
    YiruRuntimeV1TerminalServiceSend as SendMethod,
};
use yiru_protocol::runtime::v1::{
    TerminalAgentPhase, TerminalClientIdentity, TerminalClientKind, TerminalCwdFallback,
    TerminalPresentation, TerminalRestoreKind, TerminalServiceCloseRequest,
    TerminalServiceCreateRequest, TerminalServiceFocusRequest, TerminalServiceListRequest,
    TerminalServiceReadRequest, TerminalServiceSendRequest, TerminalSplitDirection,
    TerminalStartupCommandDelivery, TerminalState, TerminalSurface, TerminalVisualLayout,
    TerminalVisualLayoutNode, TerminalVisualPaneNode,
};

use crate::transport::{LocalProtocolClient, ProtocolPeerError};

const CALL_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Debug, Error)]
pub(super) enum TerminalCommandError {
    #[error(transparent)]
    Bootstrap(#[from] crate::native_messaging::BootstrapError),
    #[error("terminal_response_invalid")]
    InvalidResponse,
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    #[error("cli_flag_required:{0}")]
    MissingFlag(&'static str),
    #[error(transparent)]
    Path(#[from] crate::paths::PathResolutionError),
    #[error(transparent)]
    Peer(ProtocolPeerError),
    #[error("daemon_not_ready")]
    RuntimeNotReady,
    #[error("daemon_not_running")]
    RuntimeNotRunning,
    #[error("terminal_action_unsupported")]
    UnsupportedAction,
    #[error("unknown_agent")]
    UnknownAgent,
}

pub(super) async fn run(args: &[OsString]) -> Result<(), TerminalCommandError> {
    let user_data_path = read_flag(args, "--daemon-data")
        .map(PathBuf::from)
        .map(Ok)
        .unwrap_or_else(crate::paths::resolve_default_user_data_path)?;
    let metadata = crate::runtime_metadata::read_live(&user_data_path)
        .ok_or(TerminalCommandError::RuntimeNotRunning)?;
    let bootstrap = crate::native_messaging::read_bootstrap_connection_if_exists(
        &user_data_path,
        metadata.pid,
    )?
    .ok_or(TerminalCommandError::RuntimeNotReady)?;
    let protocol_version = bootstrap
        .protocol_version
        .as_u64()
        .and_then(|value| u32::try_from(value).ok())
        .ok_or(TerminalCommandError::RuntimeNotReady)?;
    let expected_runtime_id = read_flag(args, "--runtime")
        .and_then(OsStr::to_str)
        .filter(|value| !value.is_empty());
    let peer = LocalProtocolClient::connect(
        &bootstrap.endpoint,
        &bootstrap.auth_token,
        protocol_version,
        &bootstrap.runtime_id,
        expected_runtime_id,
    )
    .await
    .map_err(map_peer_error)?;
    let result = run_action(&peer, args).await;
    peer.close().await;
    result
}

async fn run_action(
    peer: &LocalProtocolClient,
    args: &[OsString],
) -> Result<(), TerminalCommandError> {
    match args.first().and_then(|value| value.to_str()) {
        Some("list") => list(peer, args).await,
        Some("create") => create(peer, args).await,
        Some("read") => read(peer, args).await,
        Some("send") => send(peer, args).await,
        Some("close") => close(peer, args).await,
        Some("focus") => focus(peer, args).await,
        Some(_) | None => Err(TerminalCommandError::UnsupportedAction),
    }
}

async fn list(peer: &LocalProtocolClient, args: &[OsString]) -> Result<(), TerminalCommandError> {
    let response = unary::<ListMethod>(
        peer,
        &TerminalServiceListRequest {
            worktree: optional_flag(args, "--worktree"),
            limit: Some(500),
            require_fresh_pty_liveness: false,
        },
    )
    .await?;
    let terminals = response
        .terminals
        .into_iter()
        .map(terminal_summary_json)
        .collect::<Result<Vec<_>, _>>()?;
    let visual_layouts = response
        .visual_layouts
        .iter()
        .map(visual_layout_json)
        .collect::<Result<Vec<_>, _>>()?;
    let mut output = Map::from_iter([
        ("terminals".to_owned(), Value::Array(terminals.clone())),
        ("totalCount".to_owned(), Value::from(response.total_count)),
        ("truncated".to_owned(), Value::Bool(response.truncated)),
    ]);
    if !visual_layouts.is_empty() {
        output.insert("visualLayouts".to_owned(), Value::Array(visual_layouts));
    }
    if has_flag(args, "--json") {
        println!("{}", serde_json::to_string(&output)?);
    } else {
        let lines = terminals
            .iter()
            .filter_map(|terminal| {
                let handle = terminal.get("handle")?.as_str()?;
                let title = terminal
                    .get("title")
                    .and_then(Value::as_str)
                    .or_else(|| terminal.get("preview").and_then(Value::as_str))?;
                Some(format!("{handle}\t{title}"))
            })
            .collect::<Vec<_>>();
        println!(
            "{}",
            if lines.is_empty() {
                "No terminals".to_owned()
            } else {
                lines.join("\n")
            }
        );
    }
    Ok(())
}

async fn create(peer: &LocalProtocolClient, args: &[OsString]) -> Result<(), TerminalCommandError> {
    let agent = optional_flag(args, "--agent");
    if agent
        .as_deref()
        .is_some_and(|agent| !crate::settings::is_tui_agent(agent))
    {
        return Err(TerminalCommandError::UnknownAgent);
    }
    let response = unary::<CreateMethod>(
        peer,
        &TerminalServiceCreateRequest {
            worktree: Some(required_flag(args, "--worktree")?),
            viewport: None,
            command: optional_flag(args, "--command").or_else(|| agent.clone()),
            cwd: None,
            cwd_fallback: TerminalCwdFallback::Unspecified as i32,
            startup_command_delivery: TerminalStartupCommandDelivery::Unspecified as i32,
            env: Default::default(),
            env_to_delete: Vec::new(),
            launch_config: None,
            launch_token: None,
            launch_agent: agent,
            title: optional_flag(args, "--title"),
            focus: false,
            renderer_backed: false,
            activate: false,
            presentation: TerminalPresentation::Background as i32,
            tab_id: None,
            leaf_id: None,
        },
    )
    .await?;
    let terminal = response
        .terminal
        .ok_or(TerminalCommandError::InvalidResponse)?;
    let output = json!({ "terminal": terminal_create_json(&terminal)? });
    write_output(
        args,
        output,
        format!("Created terminal {}", terminal.handle),
    )
}

async fn read(peer: &LocalProtocolClient, args: &[OsString]) -> Result<(), TerminalCommandError> {
    let limit = match optional_flag(args, "--limit") {
        None => Some(500),
        Some(value) => javascript_number(&value)
            .filter(|value| value.is_finite() && *value > 0.0)
            .map(|value| value.floor().min(2_000.0) as u32),
    };
    let response = unary::<ReadMethod>(
        peer,
        &TerminalServiceReadRequest {
            terminal: required_flag(args, "--terminal")?,
            cursor: None,
            limit,
        },
    )
    .await?;
    let terminal = response
        .terminal
        .ok_or(TerminalCommandError::InvalidResponse)?;
    let output = json!({ "terminal": terminal_read_json(&terminal)? });
    write_output(args, output, terminal.tail.join("\n"))
}

async fn send(peer: &LocalProtocolClient, args: &[OsString]) -> Result<(), TerminalCommandError> {
    let response = unary::<SendMethod>(
        peer,
        &TerminalServiceSendRequest {
            terminal: required_flag(args, "--terminal")?,
            text: optional_flag(args, "--text"),
            enter: has_flag(args, "--enter"),
            interrupt: has_flag(args, "--interrupt"),
            require_agent_status: 0,
            input_kind: 0,
            client: Some(TerminalClientIdentity {
                id: format!("cli-{}", std::process::id()),
                kind: TerminalClientKind::Cli as i32,
            }),
            viewport: None,
            claim_viewport: false,
        },
    )
    .await?;
    let send = response.send.ok_or(TerminalCommandError::InvalidResponse)?;
    let output = json!({ "send": terminal_send_json(&send)? });
    let message = if send.accepted {
        "Input sent"
    } else {
        "Input refused"
    };
    write_output(args, output, message.to_owned())
}

async fn close(peer: &LocalProtocolClient, args: &[OsString]) -> Result<(), TerminalCommandError> {
    let response = unary::<CloseMethod>(
        peer,
        &TerminalServiceCloseRequest {
            terminal: required_flag(args, "--terminal")?,
        },
    )
    .await?;
    let close = response
        .close
        .ok_or(TerminalCommandError::InvalidResponse)?;
    write_output(
        args,
        json!({ "close": {
            "handle": close.handle,
            "ptyKilled": close.pty_killed,
            "tabId": close.tab_id,
        } }),
        "Terminal closed".to_owned(),
    )
}

async fn focus(peer: &LocalProtocolClient, args: &[OsString]) -> Result<(), TerminalCommandError> {
    let response = unary::<FocusMethod>(
        peer,
        &TerminalServiceFocusRequest {
            terminal: required_flag(args, "--terminal")?,
        },
    )
    .await?;
    let focus = response
        .focus
        .ok_or(TerminalCommandError::InvalidResponse)?;
    write_output(
        args,
        json!({ "focus": {
            "handle": focus.handle,
            "tabId": focus.tab_id,
            "worktreeId": focus.worktree_id,
        } }),
        "Terminal focused".to_owned(),
    )
}

fn terminal_summary_json(
    terminal: yiru_protocol::runtime::v1::TerminalSummary,
) -> Result<Value, TerminalCommandError> {
    let agent_phase = terminal
        .agent_phase
        .map(|phase| match TerminalAgentPhase::try_from(phase) {
            Ok(TerminalAgentPhase::Thinking) => Ok("thinking"),
            Ok(TerminalAgentPhase::Executing) => Ok("executing"),
            Ok(TerminalAgentPhase::WaitingDecision) => Ok("waiting-decision"),
            Ok(TerminalAgentPhase::Complete) => Ok("complete"),
            Ok(TerminalAgentPhase::Unspecified) | Err(_) => {
                Err(TerminalCommandError::InvalidResponse)
            }
        })
        .transpose()?;
    let mut value = Map::from_iter([
        ("handle".to_owned(), Value::String(terminal.handle)),
        (
            "ptyId".to_owned(),
            terminal.pty_id.map_or(Value::Null, Value::String),
        ),
        ("worktreeId".to_owned(), Value::String(terminal.worktree_id)),
        (
            "worktreePath".to_owned(),
            Value::String(terminal.worktree_path),
        ),
        ("branch".to_owned(), Value::String(terminal.branch)),
        ("tabId".to_owned(), Value::String(terminal.tab_id)),
        ("leafId".to_owned(), Value::String(terminal.leaf_id)),
        (
            "title".to_owned(),
            terminal.title.map_or(Value::Null, Value::String),
        ),
        ("connected".to_owned(), Value::Bool(terminal.connected)),
        ("writable".to_owned(), Value::Bool(terminal.writable)),
        (
            "lastOutputAt".to_owned(),
            terminal.last_output_at.map_or(Value::Null, Value::from),
        ),
        ("preview".to_owned(), Value::String(terminal.preview)),
    ]);
    if let Some(agent_phase) = agent_phase {
        value.insert(
            "agentPhase".to_owned(),
            Value::String(agent_phase.to_owned()),
        );
    }
    Ok(Value::Object(value))
}

fn terminal_create_json(
    terminal: &yiru_protocol::runtime::v1::TerminalCreate,
) -> Result<Value, TerminalCommandError> {
    let surface = match TerminalSurface::try_from(terminal.surface) {
        Ok(TerminalSurface::Background) => "background",
        Ok(TerminalSurface::Visible) => "visible",
        Ok(TerminalSurface::Unspecified) | Err(_) => {
            return Err(TerminalCommandError::InvalidResponse);
        }
    };
    let restore = terminal
        .restore
        .as_ref()
        .ok_or(TerminalCommandError::InvalidResponse)?;
    let kind = match TerminalRestoreKind::try_from(restore.kind) {
        Ok(TerminalRestoreKind::None) => "none",
        Ok(TerminalRestoreKind::Snapshot) => "snapshot",
        Ok(TerminalRestoreKind::Replay) => "replay",
        Ok(TerminalRestoreKind::ColdRestore) => "cold-restore",
        Ok(TerminalRestoreKind::Unspecified) | Err(_) => {
            return Err(TerminalCommandError::InvalidResponse);
        }
    };
    let mut restore_value = Map::from_iter([
        ("kind".to_owned(), Value::String(kind.to_owned())),
        (
            "isAlternateScreen".to_owned(),
            Value::Bool(restore.is_alternate_screen),
        ),
    ]);
    if let Some(value) = restore.snapshot_cols {
        restore_value.insert("snapshotCols".to_owned(), Value::from(value));
    }
    if let Some(value) = restore.snapshot_rows {
        restore_value.insert("snapshotRows".to_owned(), Value::from(value));
    }
    if let Some(value) = &restore.cwd {
        restore_value.insert("cwd".to_owned(), Value::String(value.clone()));
    }
    if let Some(value) = &restore.startup_cwd_fallback {
        restore_value.insert(
            "startupCwdFallback".to_owned(),
            json!({ "kind": "worktree", "cwd": value.cwd }),
        );
    }
    let mut value = Map::from_iter([
        ("handle".to_owned(), Value::String(terminal.handle.clone())),
        ("tabId".to_owned(), Value::String(terminal.tab_id.clone())),
        (
            "paneKey".to_owned(),
            Value::String(terminal.pane_key.clone()),
        ),
        ("ptyId".to_owned(), Value::String(terminal.pty_id.clone())),
        (
            "worktreeId".to_owned(),
            Value::String(terminal.worktree_id.clone()),
        ),
        (
            "title".to_owned(),
            terminal.title.clone().map_or(Value::Null, Value::String),
        ),
        ("surface".to_owned(), Value::String(surface.to_owned())),
        (
            "transportGeneration".to_owned(),
            Value::String(terminal.transport_generation.clone()),
        ),
        ("isReattach".to_owned(), Value::Bool(terminal.is_reattach)),
        (
            "sessionExpired".to_owned(),
            Value::Bool(terminal.session_expired),
        ),
        ("restore".to_owned(), Value::Object(restore_value)),
    ]);
    if let Some(warning) = &terminal.warning {
        value.insert("warning".to_owned(), Value::String(warning.clone()));
    }
    Ok(Value::Object(value))
}

fn terminal_read_json(
    terminal: &yiru_protocol::runtime::v1::TerminalRead,
) -> Result<Value, TerminalCommandError> {
    let status = match TerminalState::try_from(terminal.status) {
        Ok(TerminalState::Running) => "running",
        Ok(TerminalState::Exited) => "exited",
        Ok(TerminalState::Unknown) => "unknown",
        Ok(TerminalState::Unspecified) | Err(_) => {
            return Err(TerminalCommandError::InvalidResponse);
        }
    };
    Ok(json!({
        "handle": terminal.handle,
        "status": status,
        "tail": terminal.tail,
        "truncated": terminal.truncated,
        "limited": terminal.limited,
        "oldestCursor": terminal.oldest_cursor,
        "nextCursor": terminal.next_cursor,
        "latestCursor": terminal.latest_cursor,
        "returnedLineCount": terminal.returned_line_count,
    }))
}

fn terminal_send_json(
    send: &yiru_protocol::runtime::v1::TerminalSend,
) -> Result<Value, TerminalCommandError> {
    let mut value = Map::from_iter([
        ("handle".to_owned(), Value::String(send.handle.clone())),
        ("accepted".to_owned(), Value::Bool(send.accepted)),
        ("bytesWritten".to_owned(), Value::from(send.bytes_written)),
    ]);
    let reason = match yiru_protocol::runtime::v1::TerminalSendRefusedReason::try_from(
        send.refused_reason,
    ) {
        Ok(yiru_protocol::runtime::v1::TerminalSendRefusedReason::Unspecified) => None,
        Ok(yiru_protocol::runtime::v1::TerminalSendRefusedReason::NoAgent) => Some("no-agent"),
        Ok(yiru_protocol::runtime::v1::TerminalSendRefusedReason::Permission) => Some("permission"),
        Err(_) => return Err(TerminalCommandError::InvalidResponse),
    };
    if let Some(reason) = reason {
        value.insert("refusedReason".to_owned(), Value::String(reason.to_owned()));
    }
    Ok(Value::Object(value))
}

fn visual_layout_json(layout: &TerminalVisualLayout) -> Result<Value, TerminalCommandError> {
    Ok(json!({
        "worktreeId": layout.worktree_id,
        "worktreePath": layout.worktree_path,
        "root": visual_layout_node_json(
            layout.root.as_ref().ok_or(TerminalCommandError::InvalidResponse)?
        )?,
    }))
}

fn visual_layout_node_json(node: &TerminalVisualLayoutNode) -> Result<Value, TerminalCommandError> {
    use yiru_protocol::runtime::v1::terminal_visual_layout_node::Node;
    match node
        .node
        .as_ref()
        .ok_or(TerminalCommandError::InvalidResponse)?
    {
        Node::Group(group) => Ok(json!({
            "type": "group",
            "groupId": group.group_id,
            "activeTabId": group.active_tab_id,
            "tabs": group.tabs.iter().map(|tab| {
                Ok(json!({
                    "tabId": tab.tab_id,
                    "title": tab.title,
                    "activeLeafId": tab.active_leaf_id,
                    "panes": visual_pane_node_json(
                        tab.panes.as_ref().ok_or(TerminalCommandError::InvalidResponse)?
                    )?,
                }))
            }).collect::<Result<Vec<Value>, TerminalCommandError>>()?,
        })),
        Node::Split(split) => Ok(json!({
            "type": "split",
            "direction": split_direction(split.direction)?,
            "first": visual_layout_node_json(
                split.first.as_ref().ok_or(TerminalCommandError::InvalidResponse)?
            )?,
            "second": visual_layout_node_json(
                split.second.as_ref().ok_or(TerminalCommandError::InvalidResponse)?
            )?,
        })),
    }
}

fn visual_pane_node_json(node: &TerminalVisualPaneNode) -> Result<Value, TerminalCommandError> {
    use yiru_protocol::runtime::v1::terminal_visual_pane_node::Node;
    match node
        .node
        .as_ref()
        .ok_or(TerminalCommandError::InvalidResponse)?
    {
        Node::Terminal(terminal) => Ok(json!({
            "type": "terminal",
            "handle": terminal.handle,
            "tabId": terminal.tab_id,
            "leafId": terminal.leaf_id,
            "title": terminal.title,
            "connected": terminal.connected,
            "active": terminal.active,
        })),
        Node::Split(split) => Ok(json!({
            "type": "pane-split",
            "direction": split_direction(split.direction)?,
            "first": visual_pane_node_json(
                split.first.as_ref().ok_or(TerminalCommandError::InvalidResponse)?
            )?,
            "second": visual_pane_node_json(
                split.second.as_ref().ok_or(TerminalCommandError::InvalidResponse)?
            )?,
        })),
    }
}

fn split_direction(value: i32) -> Result<&'static str, TerminalCommandError> {
    match TerminalSplitDirection::try_from(value) {
        Ok(TerminalSplitDirection::Horizontal) => Ok("horizontal"),
        Ok(TerminalSplitDirection::Vertical) => Ok("vertical"),
        Ok(TerminalSplitDirection::Unspecified) | Err(_) => {
            Err(TerminalCommandError::InvalidResponse)
        }
    }
}

async fn unary<Method>(
    peer: &LocalProtocolClient,
    request: &Method::Request,
) -> Result<Method::Response, TerminalCommandError>
where
    Method: UnaryMethod,
{
    peer.unary::<Method>(request, CALL_TIMEOUT)
        .await
        .map_err(map_peer_error)
}

fn write_output(
    args: &[OsString],
    output: Value,
    text: String,
) -> Result<(), TerminalCommandError> {
    if has_flag(args, "--json") {
        println!("{}", serde_json::to_string(&output)?);
    } else {
        println!("{text}");
    }
    Ok(())
}

fn map_peer_error(error: ProtocolPeerError) -> TerminalCommandError {
    TerminalCommandError::Peer(error)
}

fn required_flag(args: &[OsString], name: &'static str) -> Result<String, TerminalCommandError> {
    optional_flag(args, name).ok_or(TerminalCommandError::MissingFlag(name))
}

fn optional_flag(args: &[OsString], name: &str) -> Option<String> {
    read_flag(args, name)
        .and_then(OsStr::to_str)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

fn javascript_number(value: &str) -> Option<f64> {
    let value = value.trim();
    if value.is_empty() {
        return Some(0.0);
    }
    for (prefix, radix) in [
        ("0x", 16),
        ("0X", 16),
        ("0o", 8),
        ("0O", 8),
        ("0b", 2),
        ("0B", 2),
    ] {
        if let Some(digits) = value.strip_prefix(prefix) {
            return u64::from_str_radix(digits, radix)
                .ok()
                .map(|value| value as f64);
        }
    }
    value.parse().ok()
}

fn read_flag<'a>(args: &'a [OsString], name: &str) -> Option<&'a OsStr> {
    let index = args.iter().position(|argument| argument == name)?;
    let value = args.get(index + 1)?;
    (!value.to_string_lossy().starts_with("--")).then_some(value)
}

fn has_flag(args: &[OsString], name: &str) -> bool {
    args.iter().any(|argument| argument == name)
}

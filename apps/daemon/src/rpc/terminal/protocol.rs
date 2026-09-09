use serde_json::{Map, Value};
use yiru_protocol::protocol::v1::{Status, StatusCode};
use yiru_protocol::runtime::v1::{
    TerminalAgentRequirement as ProtocolAgentRequirement,
    TerminalClientIdentity as ProtocolClientIdentity, TerminalClientKind as ProtocolClientKind,
    TerminalClose as ProtocolClose, TerminalCreate as ProtocolCreate,
    TerminalCwdFallback as ProtocolCwdFallback, TerminalFocus as ProtocolFocus,
    TerminalInputKind as ProtocolInputKind, TerminalPresentation as ProtocolPresentation,
    TerminalRead as ProtocolRead, TerminalRestore as ProtocolRestore,
    TerminalRestoreKind as ProtocolRestoreKind, TerminalSend as ProtocolSend,
    TerminalSendRefusedReason as ProtocolSendRefusedReason, TerminalServiceCloseRequest,
    TerminalServiceCloseResponse, TerminalServiceCreateRequest, TerminalServiceCreateResponse,
    TerminalServiceFocusRequest, TerminalServiceFocusResponse, TerminalServiceListRequest,
    TerminalServiceListResponse, TerminalServiceOpenMultiplexRequest,
    TerminalServiceOpenMultiplexResponse, TerminalServiceReadRequest, TerminalServiceReadResponse,
    TerminalServiceSendRequest, TerminalServiceSendResponse,
    TerminalSplitDirection as ProtocolSplitDirection,
    TerminalStartupCommandDelivery as ProtocolStartupCommandDelivery,
    TerminalStartupCwdFallback as ProtocolStartupCwdFallback, TerminalState as ProtocolState,
    TerminalSummary as ProtocolSummary, TerminalSurface as ProtocolSurface,
    TerminalViewport as ProtocolViewport, TerminalVisualGroup as ProtocolVisualGroup,
    TerminalVisualLayout as ProtocolVisualLayout,
    TerminalVisualLayoutNode as ProtocolVisualLayoutNode,
    TerminalVisualLayoutSplit as ProtocolVisualLayoutSplit,
    TerminalVisualPaneNode as ProtocolVisualPaneNode,
    TerminalVisualPaneSplit as ProtocolVisualPaneSplit, TerminalVisualTab as ProtocolVisualTab,
    TerminalVisualTerminal as ProtocolVisualTerminal, terminal_visual_layout_node,
    terminal_visual_pane_node,
};
use yiru_protocol::transport::{decode, encode};

use crate::rpc::protocol_call::status;
use crate::terminal_session::{
    TerminalClient, TerminalClientType, TerminalCreateRequest, TerminalCreateResult,
    TerminalFocusResult, TerminalLaunchConfig, TerminalPresentation, TerminalReadResult,
    TerminalSendInputKind, TerminalSendRequest, TerminalSendResult, TerminalSessionAuthority,
    TerminalSessionError, TerminalStartupCommandDelivery, TerminalSummary, TerminalViewport,
};

pub(super) async fn list(
    authority: &TerminalSessionAuthority,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<TerminalServiceListRequest>(payload)?;
    let limit = request.limit.map_or(200, |limit| limit.max(1) as usize);
    let result = authority
        .list(
            nonempty(request.worktree).as_deref(),
            limit,
            request.require_fresh_pty_liveness,
        )
        .await
        .map_err(terminal_status)?;
    let visual_layouts = result
        .visual_layouts
        .iter()
        .map(protocol_visual_layout)
        .collect::<Result<Vec<_>, _>>()?;
    Ok(encode(&TerminalServiceListResponse {
        terminals: result.terminals.into_iter().map(protocol_summary).collect(),
        total_count: u64::try_from(result.total_count).unwrap_or(u64::MAX),
        truncated: result.truncated,
        visual_layouts,
    }))
}

pub(super) async fn create(
    authority: &TerminalSessionAuthority,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<TerminalServiceCreateRequest>(payload)?;
    let request = create_request(request)?;
    let terminal = authority.create(request).await.map_err(terminal_status)?;
    Ok(encode(&TerminalServiceCreateResponse {
        terminal: Some(protocol_create(terminal)?),
    }))
}

pub(super) async fn read(
    authority: &TerminalSessionAuthority,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<TerminalServiceReadRequest>(payload)?;
    required(&request.terminal, "Terminal handle")?;
    let limit = request
        .limit
        .filter(|limit| *limit > 0)
        .map(|limit| limit.min(2_000) as usize);
    let terminal = authority
        .read(&request.terminal, request.cursor, limit)
        .await
        .map_err(terminal_status)?;
    Ok(encode(&TerminalServiceReadResponse {
        terminal: Some(protocol_read(terminal)?),
    }))
}

pub(super) async fn send(
    authority: &TerminalSessionAuthority,
    payload: &[u8],
    principal_id: &str,
) -> Result<Vec<u8>, Status> {
    let request = decode::<TerminalServiceSendRequest>(payload)?;
    let request = send_request(request)?;
    let send = authority
        .send_guarded(request, principal_id)
        .await
        .map_err(terminal_status)?;
    Ok(encode(&TerminalServiceSendResponse {
        send: Some(protocol_send(send)),
    }))
}

pub(super) async fn close(
    authority: &TerminalSessionAuthority,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<TerminalServiceCloseRequest>(payload)?;
    required(&request.terminal, "Terminal handle")?;
    let (tab_id, _, _) = authority
        .identity(&request.terminal)
        .map_err(terminal_status)?;
    let pty_killed = authority
        .close(&request.terminal)
        .await
        .map_err(terminal_status)?;
    Ok(encode(&TerminalServiceCloseResponse {
        close: Some(ProtocolClose {
            handle: request.terminal,
            tab_id,
            pty_killed,
        }),
    }))
}

pub(super) async fn focus(
    authority: &TerminalSessionAuthority,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<TerminalServiceFocusRequest>(payload)?;
    required(&request.terminal, "Terminal handle")?;
    let focus = authority
        .focus(&request.terminal)
        .await
        .map_err(terminal_status)?;
    Ok(encode(&TerminalServiceFocusResponse {
        focus: Some(protocol_focus(focus)),
    }))
}

pub(super) fn open_multiplex(
    authority: &TerminalSessionAuthority,
    payload: &[u8],
    principal_id: &str,
) -> Result<Vec<u8>, Status> {
    let request = decode::<TerminalServiceOpenMultiplexRequest>(payload)?;
    required(&request.client_instance_id, "Terminal client instance ID")?;
    required(&request.environment_id, "Terminal environment ID")?;
    let ticket = authority
        .multiplex()
        .issue_ticket(
            principal_id.to_owned(),
            request.client_instance_id,
            request.environment_id,
        )
        .map_err(|_| internal("Terminal multiplex ticket could not be issued"))?;
    Ok(encode(&TerminalServiceOpenMultiplexResponse {
        bulk_ticket: ticket.bulk_ticket,
        expires_at: ticket.expires_at,
        max_frame_bytes: ticket.max_frame_bytes,
    }))
}

fn create_request(request: TerminalServiceCreateRequest) -> Result<TerminalCreateRequest, Status> {
    let viewport = request.viewport.unwrap_or(ProtocolViewport {
        cols: 120,
        rows: 40,
    });
    let cols = dimension(viewport.cols, 1_000, "Terminal columns")?;
    let rows = dimension(viewport.rows, 500, "Terminal rows")?;
    let cwd_fallback = match ProtocolCwdFallback::try_from(request.cwd_fallback) {
        Ok(ProtocolCwdFallback::Unspecified) => false,
        Ok(ProtocolCwdFallback::Worktree) => true,
        Err(_) => return Err(invalid("Terminal cwd fallback is invalid")),
    };
    let startup_command_delivery =
        match ProtocolStartupCommandDelivery::try_from(request.startup_command_delivery) {
            Ok(ProtocolStartupCommandDelivery::Unspecified) => None,
            Ok(ProtocolStartupCommandDelivery::Fast) => Some(TerminalStartupCommandDelivery::Fast),
            Ok(ProtocolStartupCommandDelivery::ShellReady) => {
                Some(TerminalStartupCommandDelivery::ShellReady)
            }
            Err(_) => return Err(invalid("Terminal startup delivery is invalid")),
        };
    let presentation = match ProtocolPresentation::try_from(request.presentation) {
        Ok(ProtocolPresentation::Unspecified) => None,
        Ok(ProtocolPresentation::Background) => Some(TerminalPresentation::Background),
        Ok(ProtocolPresentation::Visible) => Some(TerminalPresentation::Visible),
        Ok(ProtocolPresentation::Focused) => Some(TerminalPresentation::Focused),
        Err(_) => return Err(invalid("Terminal presentation is invalid")),
    };
    if request.env_to_delete.len() > 32
        || request
            .env_to_delete
            .iter()
            .any(|name| name.is_empty() || name.len() > 256)
    {
        return Err(invalid("Terminal environment deletion list is invalid"));
    }
    if request
        .launch_agent
        .as_deref()
        .is_some_and(|agent| !crate::settings::is_tui_agent(agent))
    {
        return Err(invalid("Terminal launch agent is invalid"));
    }
    Ok(TerminalCreateRequest {
        activate: request.activate,
        cols,
        command: nonempty(request.command),
        cwd: nonempty(request.cwd),
        cwd_fallback,
        env: request.env.into_iter().collect(),
        env_to_delete: request.env_to_delete,
        focus: request.focus,
        launch_agent: request.launch_agent,
        launch_config: request.launch_config.map(|config| TerminalLaunchConfig {
            omp_resume_file_path: config.omp_resume_file_path,
            agent_args: config.agent_args,
            agent_command: config.agent_command,
            agent_env: config.agent_env.into_iter().collect(),
        }),
        launch_token: nonempty(request.launch_token),
        leaf_id: nonempty(request.leaf_id),
        presentation,
        renderer_backed: request.renderer_backed,
        rows,
        split_direction: None,
        split_from_leaf_id: None,
        split_telemetry_source: None,
        startup_command_delivery,
        tab_id: nonempty(request.tab_id),
        title: nonempty(request.title),
        worktree: nonempty(request.worktree),
    })
}

fn send_request(request: TerminalServiceSendRequest) -> Result<TerminalSendRequest, Status> {
    required(&request.terminal, "Terminal handle")?;
    let require_agent_sendable =
        match ProtocolAgentRequirement::try_from(request.require_agent_status) {
            Ok(ProtocolAgentRequirement::Unspecified) => false,
            Ok(ProtocolAgentRequirement::Sendable) => true,
            Err(_) => return Err(invalid("Terminal agent requirement is invalid")),
        };
    let input_kind = match ProtocolInputKind::try_from(request.input_kind) {
        Ok(ProtocolInputKind::Unspecified) => None,
        Ok(ProtocolInputKind::QueryReply) => Some(TerminalSendInputKind::QueryReply),
        Err(_) => return Err(invalid("Terminal input kind is invalid")),
    };
    let viewport = request
        .viewport
        .map(|viewport| {
            Ok::<TerminalViewport, Status>(TerminalViewport {
                cols: dimension(viewport.cols, 1_000, "Terminal columns")?,
                rows: dimension(viewport.rows, 500, "Terminal rows")?,
            })
        })
        .transpose()?;
    Ok(TerminalSendRequest {
        claim_viewport: request.claim_viewport,
        client: request.client.map(terminal_client).transpose()?,
        enter: request.enter,
        input_kind,
        interrupt: request.interrupt,
        require_agent_sendable,
        terminal: request.terminal,
        text: nonempty(request.text),
        viewport,
    })
}

pub(super) fn terminal_client(client: ProtocolClientIdentity) -> Result<TerminalClient, Status> {
    required(&client.id, "Terminal client ID")?;
    let kind = match ProtocolClientKind::try_from(client.kind) {
        Ok(ProtocolClientKind::Unspecified | ProtocolClientKind::Desktop) => {
            TerminalClientType::Desktop
        }
        Ok(ProtocolClientKind::Mobile) => TerminalClientType::Mobile,
        Ok(ProtocolClientKind::Extension) => TerminalClientType::Extension,
        Ok(ProtocolClientKind::Daemon) => TerminalClientType::Daemon,
        Ok(ProtocolClientKind::Cli) => TerminalClientType::Cli,
        Err(_) => return Err(invalid("Terminal client kind is invalid")),
    };
    Ok(TerminalClient {
        id: client.id,
        kind,
    })
}

pub(super) fn protocol_summary(summary: TerminalSummary) -> ProtocolSummary {
    ProtocolSummary {
        handle: summary.handle,
        pty_id: summary.pty_id,
        worktree_id: summary.worktree_id,
        worktree_path: summary.worktree_path,
        branch: summary.branch,
        tab_id: summary.tab_id,
        leaf_id: summary.leaf_id,
        title: summary.title,
        connected: summary.connected,
        writable: summary.writable,
        last_output_at: summary.last_output_at,
        preview: summary.preview,
        agent_phase: None,
    }
}

fn protocol_create(terminal: TerminalCreateResult) -> Result<ProtocolCreate, Status> {
    let surface = match terminal.surface {
        "background" => ProtocolSurface::Background,
        "visible" => ProtocolSurface::Visible,
        _ => return Err(internal("Terminal surface is invalid")),
    };
    let restore_kind = match terminal.restore.kind {
        "none" => ProtocolRestoreKind::None,
        "snapshot" => ProtocolRestoreKind::Snapshot,
        "replay" => ProtocolRestoreKind::Replay,
        "cold-restore" => ProtocolRestoreKind::ColdRestore,
        _ => return Err(internal("Terminal restore kind is invalid")),
    };
    Ok(ProtocolCreate {
        handle: terminal.handle,
        tab_id: terminal.tab_id,
        pane_key: terminal.pane_key,
        pty_id: terminal.pty_id,
        worktree_id: terminal.worktree_id,
        title: terminal.title,
        surface: surface as i32,
        warning: terminal.warning,
        transport_generation: terminal.transport_generation,
        is_reattach: terminal.is_reattach,
        session_expired: terminal.session_expired,
        restore: Some(ProtocolRestore {
            kind: restore_kind as i32,
            is_alternate_screen: terminal.restore.is_alternate_screen,
            snapshot_cols: None,
            snapshot_rows: None,
            cwd: None,
            startup_cwd_fallback: terminal
                .restore
                .startup_cwd_fallback
                .map(|fallback| ProtocolStartupCwdFallback { cwd: fallback.cwd }),
        }),
    })
}

fn protocol_read(terminal: TerminalReadResult) -> Result<ProtocolRead, Status> {
    let state = match terminal.status {
        "running" => ProtocolState::Running,
        "exited" => ProtocolState::Exited,
        "unknown" => ProtocolState::Unknown,
        _ => return Err(internal("Terminal state is invalid")),
    };
    Ok(ProtocolRead {
        handle: terminal.handle,
        status: state as i32,
        tail: terminal.tail,
        truncated: terminal.truncated,
        limited: terminal.limited,
        oldest_cursor: terminal.oldest_cursor,
        next_cursor: terminal.next_cursor,
        latest_cursor: terminal.latest_cursor,
        returned_line_count: u32::try_from(terminal.returned_line_count).unwrap_or(u32::MAX),
    })
}

fn protocol_send(send: TerminalSendResult) -> ProtocolSend {
    let refused_reason = match send.refused_reason {
        Some("no-agent") => ProtocolSendRefusedReason::NoAgent,
        Some("permission") => ProtocolSendRefusedReason::Permission,
        Some(_) | None => ProtocolSendRefusedReason::Unspecified,
    };
    ProtocolSend {
        handle: send.handle,
        accepted: send.accepted,
        bytes_written: u64::try_from(send.bytes_written).unwrap_or(u64::MAX),
        refused_reason: refused_reason as i32,
    }
}

fn protocol_focus(focus: TerminalFocusResult) -> ProtocolFocus {
    ProtocolFocus {
        handle: focus.handle,
        tab_id: focus.tab_id,
        worktree_id: focus.worktree_id,
    }
}

fn protocol_visual_layout(value: &Value) -> Result<ProtocolVisualLayout, Status> {
    let object = object(value, "Terminal visual layout")?;
    Ok(ProtocolVisualLayout {
        worktree_id: string(object, "worktreeId", "Terminal visual layout worktree")?.to_owned(),
        worktree_path: string(object, "worktreePath", "Terminal visual layout path")?.to_owned(),
        root: Some(protocol_visual_layout_node(value_at(object, "root")?)?),
    })
}

fn protocol_visual_layout_node(value: &Value) -> Result<ProtocolVisualLayoutNode, Status> {
    let object = object(value, "Terminal visual layout node")?;
    let node = match string(object, "type", "Terminal visual layout node type")? {
        "group" => terminal_visual_layout_node::Node::Group(ProtocolVisualGroup {
            group_id: nullable_string(object.get("groupId"))?,
            active_tab_id: nullable_string(object.get("activeTabId"))?,
            tabs: array(object, "tabs", "Terminal visual group tabs")?
                .iter()
                .map(protocol_visual_tab)
                .collect::<Result<Vec<_>, _>>()?,
        }),
        "split" => terminal_visual_layout_node::Node::Split(Box::new(ProtocolVisualLayoutSplit {
            direction: protocol_direction(string(
                object,
                "direction",
                "Terminal visual layout split direction",
            )?)? as i32,
            first: Some(Box::new(protocol_visual_layout_node(value_at(
                object, "first",
            )?)?)),
            second: Some(Box::new(protocol_visual_layout_node(value_at(
                object, "second",
            )?)?)),
        })),
        _ => return Err(internal("Terminal visual layout node type is invalid")),
    };
    Ok(ProtocolVisualLayoutNode { node: Some(node) })
}

fn protocol_visual_tab(value: &Value) -> Result<ProtocolVisualTab, Status> {
    let object = object(value, "Terminal visual tab")?;
    Ok(ProtocolVisualTab {
        tab_id: string(object, "tabId", "Terminal visual tab ID")?.to_owned(),
        title: nullable_string(object.get("title"))?,
        active_leaf_id: nullable_string(object.get("activeLeafId"))?,
        panes: Some(protocol_visual_pane_node(value_at(object, "panes")?)?),
    })
}

fn protocol_visual_pane_node(value: &Value) -> Result<ProtocolVisualPaneNode, Status> {
    let object = object(value, "Terminal visual pane")?;
    let node = match string(object, "type", "Terminal visual pane type")? {
        "terminal" => terminal_visual_pane_node::Node::Terminal(ProtocolVisualTerminal {
            handle: string(object, "handle", "Terminal visual pane handle")?.to_owned(),
            tab_id: string(object, "tabId", "Terminal visual pane tab")?.to_owned(),
            leaf_id: string(object, "leafId", "Terminal visual pane leaf")?.to_owned(),
            title: nullable_string(object.get("title"))?,
            connected: boolean(object, "connected", "Terminal visual pane connected")?,
            active: boolean(object, "active", "Terminal visual pane active")?,
        }),
        "pane-split" => terminal_visual_pane_node::Node::Split(Box::new(ProtocolVisualPaneSplit {
            direction: protocol_direction(string(
                object,
                "direction",
                "Terminal visual pane split direction",
            )?)? as i32,
            first: Some(Box::new(protocol_visual_pane_node(value_at(
                object, "first",
            )?)?)),
            second: Some(Box::new(protocol_visual_pane_node(value_at(
                object, "second",
            )?)?)),
        })),
        _ => return Err(internal("Terminal visual pane type is invalid")),
    };
    Ok(ProtocolVisualPaneNode { node: Some(node) })
}

fn protocol_direction(value: &str) -> Result<ProtocolSplitDirection, Status> {
    match value {
        "horizontal" => Ok(ProtocolSplitDirection::Horizontal),
        "vertical" => Ok(ProtocolSplitDirection::Vertical),
        _ => Err(internal("Terminal split direction is invalid")),
    }
}

pub(super) fn dimension(value: u32, maximum: u32, label: &str) -> Result<u16, Status> {
    if value == 0 || value > maximum {
        return Err(invalid(&format!("{label} are invalid")));
    }
    u16::try_from(value).map_err(|_| invalid(&format!("{label} are invalid")))
}

pub(super) fn nonempty(value: Option<String>) -> Option<String> {
    value.filter(|value| !value.is_empty())
}

pub(super) fn required(value: &str, label: &str) -> Result<(), Status> {
    if value.is_empty() {
        Err(invalid(&format!("{label} is required")))
    } else {
        Ok(())
    }
}

fn object<'a>(value: &'a Value, label: &str) -> Result<&'a Map<String, Value>, Status> {
    value
        .as_object()
        .ok_or_else(|| internal(&format!("{label} is invalid")))
}

fn value_at<'a>(object: &'a Map<String, Value>, name: &str) -> Result<&'a Value, Status> {
    object
        .get(name)
        .ok_or_else(|| internal("Terminal visual layout is incomplete"))
}

fn string<'a>(object: &'a Map<String, Value>, name: &str, label: &str) -> Result<&'a str, Status> {
    object
        .get(name)
        .and_then(Value::as_str)
        .ok_or_else(|| internal(&format!("{label} is invalid")))
}

fn nullable_string(value: Option<&Value>) -> Result<Option<String>, Status> {
    match value {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(value)) => Ok(Some(value.clone())),
        Some(_) => Err(internal("Terminal visual layout string is invalid")),
    }
}

fn array<'a>(
    object: &'a Map<String, Value>,
    name: &str,
    label: &str,
) -> Result<&'a [Value], Status> {
    object
        .get(name)
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .ok_or_else(|| internal(&format!("{label} are invalid")))
}

fn boolean(object: &Map<String, Value>, name: &str, label: &str) -> Result<bool, Status> {
    object
        .get(name)
        .and_then(Value::as_bool)
        .ok_or_else(|| internal(&format!("{label} is invalid")))
}

pub(super) fn terminal_status(error: TerminalSessionError) -> Status {
    let code = match &error {
        TerminalSessionError::InvalidInput(_) => StatusCode::InvalidArgument,
        TerminalSessionError::NotFound => StatusCode::NotFound,
        TerminalSessionError::NotWritable => StatusCode::FailedPrecondition,
        TerminalSessionError::WaitTimeout => StatusCode::DeadlineExceeded,
        TerminalSessionError::Host(_)
        | TerminalSessionError::HostFilesystem(_)
        | TerminalSessionError::Project(_)
        | TerminalSessionError::Worktree(_) => StatusCode::InvalidArgument,
        TerminalSessionError::LaunchPreparation(_)
        | TerminalSessionError::Process(_)
        | TerminalSessionError::ProcessTask(_)
        | TerminalSessionError::Settings(_)
        | TerminalSessionError::WorkspaceSession(_) => StatusCode::Internal,
    };
    status(code, &error.to_string())
}

pub(super) fn invalid(message: &str) -> Status {
    status(StatusCode::InvalidArgument, message)
}

pub(super) fn internal(message: &str) -> Status {
    status(StatusCode::Internal, message)
}

use std::collections::HashSet;
use std::sync::atomic::AtomicBool;

use agentstart_protocol::protocol::v1::{Status, StatusCode};
use agentstart_protocol::runtime::v1::session_tabs_service_all_event::Event as AllEvent;
use agentstart_protocol::runtime::v1::session_tabs_service_event::Event;
use agentstart_protocol::runtime::v1::session_tabs_service_move_request::Detail;
use agentstart_protocol::runtime::v1::{
    SessionTabsMoveKind, SessionTabsServiceActivateRequest, SessionTabsServiceAllEvent,
    SessionTabsServiceClosedResponse, SessionTabsServiceCreateTerminalRequest,
    SessionTabsServiceCreateTerminalResponse, SessionTabsServiceEvent,
    SessionTabsServiceListAllRequest, SessionTabsServiceListAllResponse,
    SessionTabsServiceListRequest, SessionTabsServiceMoveRequest, SessionTabsServiceMovedResponse,
    SessionTabsServiceSetTabPropsRequest, SessionTabsServiceSnapshotList,
    SessionTabsServiceTabRequest, SessionTabsServiceUnsubscribeAllRequest,
    SessionTabsServiceUnsubscribeRequest, SessionTabsServiceUnsubscribedResponse,
    SessionTabsServiceUpdatePaneLayoutRequest, SessionTabsServiceUpdatedResponse,
    SessionTabsSplitDirection, SessionTabsStartupCommandDelivery, session_tabs_nullable_color,
    session_tabs_nullable_string_field, session_tabs_pane_layout_node,
    session_tabs_pane_layout_root, session_tabs_startup_command_delivery,
};
use agentstart_protocol::transport::{decode, encode};
use serde_json::{Map, Value};

use crate::rpc::protocol_call::ProtocolCallContext;
use crate::session_tabs::{
    SessionTabCreate, SessionTabMove, SessionTabsError, SessionTabsScope,
    SessionTabsSubscriptionEvent, WorktreeStreamUpdate,
};
use crate::terminal_session::{TerminalLaunchConfig, TerminalStartupCommandDelivery};
use crate::worktrees::WorktreeCatalogError;

use super::SessionTabsRpc;
use super::input::{
    MAX_AGENT_PROMPT_BYTES, MAX_PANE_LAYOUT_DEPTH, MAX_PANE_LAYOUT_NODES, TUI_AGENTS,
};
use super::protocol_values::{pane_layout_value, protocol_snapshot, protocol_tab};

pub(in crate::rpc) async fn activate(
    rpc: &SessionTabsRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<SessionTabsServiceActivateRequest>(payload)?;
    validate_worktree_tab(&request.worktree, &request.tab_id)?;
    validate_bounded(request.leaf_id.as_deref(), 128, "Leaf id")?;
    let snapshot = rpc
        .authority
        .activate(
            &request.worktree,
            &request.tab_id,
            request.leaf_id.as_deref(),
            request.notify_clients.unwrap_or(true),
        )
        .await
        .map_err(tabs_status)?;
    Ok(encode(&protocol_snapshot(snapshot)?))
}

pub(in crate::rpc) async fn close(rpc: &SessionTabsRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<SessionTabsServiceTabRequest>(payload)?;
    validate_worktree_tab(&request.worktree, &request.tab_id)?;
    rpc.authority
        .close_tab(&request.worktree, &request.tab_id)
        .await
        .map_err(tabs_status)?;
    Ok(encode(&SessionTabsServiceClosedResponse { closed: true }))
}

pub(in crate::rpc) async fn create_terminal(
    rpc: &SessionTabsRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<SessionTabsServiceCreateTerminalRequest>(payload)?;
    let input = create_input(request)?;
    // Why: the legacy create path polls its connection liveness flag while it
    // waits for the renderer projection; a protobuf call instead ends by
    // dropping this future, so the always-live flag keeps the same polling
    // loop running until the caller cancels.
    let is_active = AtomicBool::new(true);
    let output = rpc
        .authority
        .create_terminal(&input.worktree, input.request, &is_active)
        .await
        .map_err(tabs_status)?;
    let object = output
        .as_object()
        .ok_or_else(|| data_loss("Session tabs create result is not an object"))?;
    let tab = object
        .get("tab")
        .cloned()
        .ok_or_else(|| data_loss("Session tabs create result is missing its tab"))?;
    Ok(encode(&SessionTabsServiceCreateTerminalResponse {
        tab: Some(protocol_tab(&tab)?),
        publication_epoch: object
            .get("publicationEpoch")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_owned(),
        snapshot_version: object
            .get("snapshotVersion")
            .and_then(Value::as_f64)
            .filter(|version| version.is_finite())
            .unwrap_or_default(),
    }))
}

pub(in crate::rpc) async fn list(rpc: &SessionTabsRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<SessionTabsServiceListRequest>(payload)?;
    validate_worktree(&request.worktree)?;
    let snapshot = rpc
        .authority
        .list(&request.worktree)
        .await
        .map_err(tabs_status)?;
    Ok(encode(&protocol_snapshot(snapshot)?))
}

pub(in crate::rpc) async fn list_all(
    rpc: &SessionTabsRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    decode::<SessionTabsServiceListAllRequest>(payload)?;
    let snapshots = rpc
        .authority
        .list_all()
        .await
        .map_err(tabs_status)?
        .into_iter()
        .map(protocol_snapshot)
        .collect::<Result<Vec<_>, Status>>()?;
    Ok(encode(&SessionTabsServiceListAllResponse { snapshots }))
}

pub(in crate::rpc) async fn move_tab(
    rpc: &SessionTabsRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<SessionTabsServiceMoveRequest>(payload)?;
    validate_worktree_tab(&request.worktree, &request.tab_id)?;
    if request.target_group_id.is_empty() {
        return Err(invalid_argument("Target group id must not be empty"));
    }
    let kind = move_kind(&request)?;
    rpc.authority
        .move_tab(
            &request.worktree,
            &request.tab_id,
            &request.target_group_id,
            kind,
        )
        .await
        .map_err(tabs_status)?;
    Ok(encode(&SessionTabsServiceMovedResponse { moved: true }))
}

pub(in crate::rpc) async fn set_tab_props(
    rpc: &SessionTabsRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<SessionTabsServiceSetTabPropsRequest>(payload)?;
    validate_worktree_tab(&request.worktree, &request.tab_id)?;
    let color = match request.color {
        None => None,
        Some(color) => match color.value {
            Some(session_tabs_nullable_color::Value::Null(_)) => Some(None),
            Some(session_tabs_nullable_color::Value::Text(text)) => Some(Some(text)),
            None => return Err(invalid_argument("Tab color must be a string or null")),
        },
    };
    rpc.authority
        .set_tab_props(&request.worktree, &request.tab_id, color, request.is_pinned)
        .await
        .map_err(tabs_status)?;
    Ok(encode(&SessionTabsServiceUpdatedResponse { updated: true }))
}

pub(in crate::rpc) async fn update_pane_layout(
    rpc: &SessionTabsRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<SessionTabsServiceUpdatePaneLayoutRequest>(payload)?;
    validate_worktree_tab(&request.worktree, &request.tab_id)?;
    let root = match request.root {
        None => return Err(invalid_argument("Pane layout root must be provided")),
        Some(root) => match root.value {
            Some(session_tabs_pane_layout_root::Value::Null(_)) => None,
            Some(session_tabs_pane_layout_root::Value::Node(node)) => {
                validate_pane_layout(&node)?;
                Some(pane_layout_value(node))
            }
            None => return Err(invalid_argument("Pane layout root must be a tree or null")),
        },
    };
    let expanded_leaf_id = match request.expanded_leaf_id {
        None => None,
        Some(expanded) => match expanded.value {
            Some(session_tabs_nullable_string_field::Value::Null(_)) => None,
            Some(session_tabs_nullable_string_field::Value::Text(text)) => Some(text),
            None => {
                return Err(invalid_argument(
                    "Expanded leaf id must be a string or null",
                ));
            }
        },
    };
    let titles_by_leaf_id = (!request.titles_by_leaf_id.is_empty()).then(|| {
        request
            .titles_by_leaf_id
            .into_iter()
            .map(|(leaf, title)| (leaf, Value::String(title)))
            .collect::<Map<String, Value>>()
    });
    rpc.authority
        .update_pane_layout(
            &request.worktree,
            &request.tab_id,
            root,
            expanded_leaf_id,
            titles_by_leaf_id,
        )
        .await
        .map_err(tabs_status)?;
    Ok(encode(&SessionTabsServiceUpdatedResponse { updated: true }))
}

pub(in crate::rpc) async fn unsubscribe(
    rpc: &SessionTabsRpc,
    payload: &[u8],
    connection_id: &str,
) -> Result<Vec<u8>, Status> {
    let request = decode::<SessionTabsServiceUnsubscribeRequest>(payload)?;
    validate_worktree(&request.worktree)?;
    let scope = rpc
        .authority
        .resolve_scope(&request.worktree)
        .await
        .map_err(tabs_status)?;
    rpc.authority
        .unsubscribe(connection_id, &scope, request.subscription_id.as_deref())
        .await;
    Ok(encode(&SessionTabsServiceUnsubscribedResponse {
        unsubscribed: true,
    }))
}

pub(in crate::rpc) async fn unsubscribe_all(
    rpc: &SessionTabsRpc,
    payload: &[u8],
    connection_id: &str,
) -> Result<Vec<u8>, Status> {
    let request = decode::<SessionTabsServiceUnsubscribeAllRequest>(payload)?;
    rpc.authority
        .unsubscribe(
            connection_id,
            &SessionTabsScope::All,
            request.subscription_id.as_deref(),
        )
        .await;
    Ok(encode(&SessionTabsServiceUnsubscribedResponse {
        unsubscribed: true,
    }))
}

pub(in crate::rpc) async fn subscribe(
    rpc: &SessionTabsRpc,
    payload: &[u8],
    connection_id: &str,
    context: &ProtocolCallContext,
) -> Result<(), Status> {
    let request = decode::<SessionTabsServiceListRequest>(payload)?;
    validate_worktree(&request.worktree)?;
    let scope = rpc
        .authority
        .resolve_scope(&request.worktree)
        .await
        .map_err(tabs_status)?;
    let SessionTabsScope::Worktree { worktree, .. } = &scope else {
        return Err(tabs_status(SessionTabsError::HostProvenance));
    };
    let worktree = worktree.clone();
    let subscription_id = context.call_id().to_string();
    let mut subscription = rpc
        .authority
        .subscribe(connection_id, scope.clone(), &subscription_id);
    let initial = rpc
        .authority
        .snapshot_for_scope(&scope)
        .await
        .map_err(tabs_status)?;
    if subscription.is_cancelled() {
        return Ok(());
    }
    let mut had_snapshot = initial.get("publicationEpoch").and_then(Value::as_str) != Some("none");
    context
        .send_stream_payload(encode(&SessionTabsServiceEvent {
            event: Some(Event::Snapshot(protocol_snapshot(initial)?)),
        }))
        .await?;
    loop {
        match subscription.next().await {
            SessionTabsSubscriptionEvent::Changed(update) => {
                let (had_next, update) = rpc
                    .authority
                    .worktree_stream_update(&scope, &worktree, had_snapshot, &update)
                    .await
                    .map_err(tabs_status)?;
                had_snapshot = had_next;
                if let WorktreeStreamUpdate::Publish(snapshot) = update {
                    context
                        .send_stream_payload(encode(&SessionTabsServiceEvent {
                            event: Some(Event::Updated(protocol_snapshot(snapshot)?)),
                        }))
                        .await?;
                }
            }
            SessionTabsSubscriptionEvent::Resync => {
                let (had_next, update) =
                    resync_worktree(rpc, &scope, &worktree, had_snapshot).await?;
                had_snapshot = had_next;
                if let WorktreeStreamUpdate::Publish(snapshot) = update {
                    context
                        .send_stream_payload(encode(&SessionTabsServiceEvent {
                            event: Some(Event::Updated(protocol_snapshot(snapshot)?)),
                        }))
                        .await?;
                }
            }
            SessionTabsSubscriptionEvent::End => break,
        }
    }
    context
        .send_stream_payload(encode(&SessionTabsServiceEvent {
            event: Some(Event::End(true)),
        }))
        .await
}

pub(in crate::rpc) async fn subscribe_all(
    rpc: &SessionTabsRpc,
    payload: &[u8],
    connection_id: &str,
    context: &ProtocolCallContext,
) -> Result<(), Status> {
    decode::<SessionTabsServiceListAllRequest>(payload)?;
    let subscription_id = context.call_id().to_string();
    let mut subscription =
        rpc.authority
            .subscribe(connection_id, SessionTabsScope::All, &subscription_id);
    let initial_values = rpc.authority.list_all().await.map_err(tabs_status)?;
    let mut known_worktrees = initial_values
        .iter()
        .filter_map(|snapshot| snapshot.get("worktree").and_then(Value::as_str))
        .map(str::to_owned)
        .collect::<HashSet<_>>();
    let initial = initial_values
        .into_iter()
        .map(protocol_snapshot)
        .collect::<Result<Vec<_>, Status>>()?;
    if subscription.is_cancelled() {
        return Ok(());
    }
    context
        .send_stream_payload(encode(&SessionTabsServiceAllEvent {
            event: Some(AllEvent::Snapshots(SessionTabsServiceSnapshotList {
                snapshots: initial,
            })),
        }))
        .await?;
    loop {
        match subscription.next().await {
            SessionTabsSubscriptionEvent::Changed(update) => {
                if let Some(worktrees) = update.worktrees {
                    for worktree in worktrees {
                        let snapshot = if worktree.removed {
                            known_worktrees.remove(&worktree.worktree);
                            rpc.authority.removed_snapshot(
                                &worktree.worktree,
                                worktree.removed_epoch.as_deref(),
                            )
                        } else {
                            known_worktrees.insert(worktree.worktree.clone());
                            rpc.authority
                                .snapshot_for_worktree(&worktree.worktree)
                                .await
                                .map_err(tabs_status)?
                        };
                        context
                            .send_stream_payload(encode(&SessionTabsServiceAllEvent {
                                event: Some(AllEvent::Updated(protocol_snapshot(snapshot)?)),
                            }))
                            .await?;
                    }
                } else {
                    resync_all(rpc, context, &mut known_worktrees).await?;
                }
            }
            SessionTabsSubscriptionEvent::Resync => {
                resync_all(rpc, context, &mut known_worktrees).await?;
            }
            SessionTabsSubscriptionEvent::End => break,
        }
    }
    context
        .send_stream_payload(encode(&SessionTabsServiceAllEvent {
            event: Some(AllEvent::End(true)),
        }))
        .await
}

async fn resync_worktree(
    rpc: &SessionTabsRpc,
    scope: &SessionTabsScope,
    worktree: &str,
    had_snapshot: bool,
) -> Result<(bool, WorktreeStreamUpdate), Status> {
    let current = rpc
        .authority
        .snapshot_for_scope(scope)
        .await
        .map_err(tabs_status)?;
    let is_missing = current.get("publicationEpoch").and_then(Value::as_str) == Some("none");
    let snapshot = if had_snapshot && is_missing {
        rpc.authority.removed_snapshot(worktree, None)
    } else {
        current
    };
    Ok((!is_missing, WorktreeStreamUpdate::Publish(snapshot)))
}

async fn resync_all(
    rpc: &SessionTabsRpc,
    context: &ProtocolCallContext,
    known_worktrees: &mut HashSet<String>,
) -> Result<(), Status> {
    let snapshots = rpc.authority.list_all().await.map_err(tabs_status)?;
    let current = snapshots
        .iter()
        .filter_map(|snapshot| snapshot.get("worktree").and_then(Value::as_str))
        .map(str::to_owned)
        .collect::<HashSet<_>>();
    for worktree in known_worktrees
        .difference(&current)
        .cloned()
        .collect::<Vec<_>>()
    {
        let snapshot = rpc.authority.removed_snapshot(&worktree, None);
        context
            .send_stream_payload(encode(&SessionTabsServiceAllEvent {
                event: Some(AllEvent::Updated(protocol_snapshot(snapshot)?)),
            }))
            .await?;
    }
    for snapshot in snapshots {
        context
            .send_stream_payload(encode(&SessionTabsServiceAllEvent {
                event: Some(AllEvent::Updated(protocol_snapshot(snapshot)?)),
            }))
            .await?;
    }
    *known_worktrees = current;
    Ok(())
}

struct CreateTerminalInput {
    worktree: String,
    request: SessionTabCreate,
}

fn create_input(
    request: SessionTabsServiceCreateTerminalRequest,
) -> Result<CreateTerminalInput, Status> {
    validate_worktree(&request.worktree)?;
    validate_bounded(request.after_tab_id.as_deref(), 128, "After tab id")?;
    validate_bounded(
        request.client_mutation_id.as_deref(),
        128,
        "Client mutation id",
    )?;
    validate_bounded(request.launch_token.as_deref(), 128, "Launch token")?;
    if request.cwd.as_deref().is_some_and(str::is_empty) {
        return Err(invalid_argument("Working directory must not be empty"));
    }
    let agent = match request.agent.as_deref() {
        None => None,
        Some(agent) if TUI_AGENTS.contains(&agent) => Some(agent.to_owned()),
        Some(_) => return Err(invalid_argument("Unknown agent preset")),
    };
    let agent_prompt = match request.agent_prompt.as_deref() {
        None => None,
        Some(prompt) if prompt.trim().is_empty() => {
            return Err(invalid_argument("Agent prompt cannot be empty"));
        }
        Some(prompt) if prompt.len() > MAX_AGENT_PROMPT_BYTES => {
            return Err(invalid_argument("Agent prompt exceeds the length limit"));
        }
        Some(prompt) => Some(prompt.to_owned()),
    };
    if agent_prompt.is_some() && agent.is_none() {
        return Err(invalid_argument("Agent prompt requires an agent preset"));
    }
    if agent_prompt.is_some() && request.command.is_some() {
        return Err(invalid_argument(
            "Agent prompt cannot be combined with a startup command",
        ));
    }
    let launch_config = match request.launch_config {
        None => None,
        Some(config) if config.agent_args.is_empty() => {
            return Err(invalid_argument("Launch configuration is invalid"));
        }
        Some(config) => Some(TerminalLaunchConfig {
            omp_resume_file_path: config.omp_resume_file_path,
            agent_args: config.agent_args,
            agent_command: config.agent_command,
            agent_env: config.agent_env.into_iter().collect(),
        }),
    };
    let startup_command_delivery = match request.startup_command_delivery {
        None => None,
        Some(SessionTabsStartupCommandDelivery {
            delivery: Some(session_tabs_startup_command_delivery::Delivery::Fast(_)),
        }) => Some(TerminalStartupCommandDelivery::Fast),
        Some(SessionTabsStartupCommandDelivery {
            delivery: Some(session_tabs_startup_command_delivery::Delivery::ShellReady(_)),
        }) => Some(TerminalStartupCommandDelivery::ShellReady),
        Some(_) => {
            return Err(invalid_argument("Startup command delivery is invalid"));
        }
    };
    Ok(CreateTerminalInput {
        worktree: request.worktree,
        request: SessionTabCreate {
            activate: request.activate.unwrap_or(true),
            after_tab_id: request.after_tab_id,
            agent,
            agent_prompt,
            client_mutation_id: request.client_mutation_id,
            command: request.command,
            cwd: request.cwd,
            env: request.env.into_iter().collect(),
            env_to_delete: request.env_to_delete,
            launch_agent: request.launch_agent,
            launch_config,
            launch_token: request.launch_token,
            startup_command_delivery,
            target_group_id: request.target_group_id,
        },
    })
}

fn move_kind(request: &SessionTabsServiceMoveRequest) -> Result<SessionTabMove, Status> {
    match (
        SessionTabsMoveKind::try_from(request.kind),
        request.detail.as_ref(),
    ) {
        (Ok(SessionTabsMoveKind::Reorder), Some(Detail::Reorder(reorder))) => {
            if reorder.tab_order.is_empty() {
                return Err(invalid_argument("Move order must not be empty"));
            }
            Ok(SessionTabMove::Reorder {
                tab_order: reorder.tab_order.clone(),
            })
        }
        (Ok(SessionTabsMoveKind::MoveToGroup), Some(Detail::MoveToGroup(move_to_group))) => {
            Ok(SessionTabMove::MoveToGroup {
                index: move_to_group.index.map(|index| index as usize),
            })
        }
        (Ok(SessionTabsMoveKind::Split), Some(Detail::Split(split))) => {
            let direction = match SessionTabsSplitDirection::try_from(split.direction) {
                Ok(SessionTabsSplitDirection::Left) => "left",
                Ok(SessionTabsSplitDirection::Right) => "right",
                Ok(SessionTabsSplitDirection::Up) => "up",
                Ok(SessionTabsSplitDirection::Down) => "down",
                _ => return Err(invalid_argument("Split direction is invalid")),
            };
            Ok(SessionTabMove::Split {
                direction: direction.to_owned(),
            })
        }
        (Ok(SessionTabsMoveKind::Unspecified), _) | (_, None) => Err(invalid_argument(
            "Move kind and its detail must be provided together",
        )),
        _ => Err(invalid_argument("Move kind and its detail do not match")),
    }
}

fn validate_pane_layout(
    node: &agentstart_protocol::runtime::v1::SessionTabsPaneLayoutNode,
) -> Result<(), Status> {
    let mut count = 0_usize;
    let mut stack = vec![(node, 0_usize)];
    while let Some((node, depth)) = stack.pop() {
        count = count.saturating_add(1);
        if depth > MAX_PANE_LAYOUT_DEPTH || count > MAX_PANE_LAYOUT_NODES {
            return Err(invalid_argument("Invalid or too-deep pane layout tree"));
        }
        match node.node.as_ref() {
            Some(session_tabs_pane_layout_node::Node::Leaf(leaf)) => {
                if leaf.leaf_id.is_empty() || leaf.leaf_id.len() > 128 {
                    return Err(invalid_argument("Invalid or too-deep pane layout tree"));
                }
            }
            Some(session_tabs_pane_layout_node::Node::Split(split)) => {
                if split
                    .ratio
                    .is_some_and(|ratio| !(0.0..=1.0).contains(&ratio))
                {
                    return Err(invalid_argument("Invalid or too-deep pane layout tree"));
                }
                let (Some(first), Some(second)) = (split.first.as_deref(), split.second.as_deref())
                else {
                    return Err(invalid_argument("Invalid or too-deep pane layout tree"));
                };
                stack.push((first, depth.saturating_add(1)));
                stack.push((second, depth.saturating_add(1)));
            }
            None => return Err(invalid_argument("Invalid or too-deep pane layout tree")),
        }
    }
    Ok(())
}

fn validate_worktree(worktree: &str) -> Result<(), Status> {
    if worktree.is_empty() {
        return Err(invalid_argument("Worktree selector must not be empty"));
    }
    Ok(())
}

fn validate_worktree_tab(worktree: &str, tab_id: &str) -> Result<(), Status> {
    validate_worktree(worktree)?;
    if tab_id.is_empty() {
        return Err(invalid_argument("Tab id must not be empty"));
    }
    Ok(())
}

fn validate_bounded(value: Option<&str>, maximum: usize, name: &str) -> Result<(), Status> {
    if value.is_some_and(|value| value.len() > maximum) {
        return Err(invalid_argument(&format!(
            "{name} exceeds the length limit"
        )));
    }
    Ok(())
}

// Why: the legacy JSON surface answers each authority failure with a specific
// 409/500 code string and no error data, so the protobuf surface reproduces
// that exact outcome mapping instead of inventing finer statuses.
pub(in crate::rpc) fn tabs_status(error: SessionTabsError) -> Status {
    let code = match &error {
        SessionTabsError::EditorDirty => StatusCode::FailedPrecondition,
        SessionTabsError::HostProvenance => {
            return status(
                StatusCode::FailedPrecondition,
                "renderer_snapshot_host_unresolved",
            );
        }
        SessionTabsError::StateChanged => {
            return status(StatusCode::Aborted, "session_tabs_state_changed");
        }
        SessionTabsError::Worktree(WorktreeCatalogError::NotFound)
        | SessionTabsError::Worktree(WorktreeCatalogError::Project(
            crate::projects::ProjectCatalogError::NotFound,
        )) => {
            return status(StatusCode::Internal, "selector_not_found");
        }
        SessionTabsError::Worktree(WorktreeCatalogError::AmbiguousSelector)
        | SessionTabsError::Worktree(WorktreeCatalogError::Project(
            crate::projects::ProjectCatalogError::AmbiguousSelector,
        )) => {
            return status(StatusCode::Internal, "selector_ambiguous");
        }
        _ => StatusCode::Internal,
    };
    status(code, &error.to_string())
}

fn invalid_argument(message: &str) -> Status {
    status(StatusCode::InvalidArgument, message)
}

fn data_loss(message: &str) -> Status {
    status(StatusCode::DataLoss, message)
}

fn status(code: StatusCode, message: &str) -> Status {
    Status {
        code: code as i32,
        message: message.to_owned(),
        details: Vec::new(),
    }
}

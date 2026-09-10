use std::future::pending;

use thiserror::Error;
use tokio::sync::mpsc;
use tokio::task::JoinSet;
use tokio::time::{Instant, sleep_until};

use crate::diagnostics::scope_optional;
use crate::reverse_protocol::ReverseProtocolClient;

use super::channel::{AuthenticatedChannel, RpcMessage};
use super::protocol_call::{
    ProtocolAccessContext, ProtocolCompletion, ProtocolResponseBudget, ProtocolRouter,
    ProtocolRouterInputs, execute_protocol_call,
};
use super::protocol_session::ProtocolReceive;
use super::services::SessionServices;

const MAX_ACTIVE_CALLS_PER_CONNECTION: usize = 128;
const PROTOCOL_COMPLETION_LIMIT: usize = 256;

#[derive(Debug, Error)]
pub(crate) enum SessionError {
    #[error("authenticated channel is closed")]
    ChannelClosed,
    #[error("terminal duplex channel is unavailable")]
    TerminalDuplexUnavailable,
    #[error("terminal multiplex frame is invalid")]
    InvalidTerminalFrame,
    #[error("RPC request task failed: {0}")]
    RequestTask(#[from] tokio::task::JoinError),
    #[error("AgentStart protocol frame is invalid: {0}")]
    Protocol(String),
}

pub(crate) async fn run_session(
    mut channel: AuthenticatedChannel,
    services: SessionServices,
) -> Result<(), SessionError> {
    let peer_kind = channel.protocol_peer_kind();
    let mut trace_attributes = serde_json::Map::new();
    trace_attributes.insert(
        "session.peer_kind".to_owned(),
        serde_json::Value::from(peer_kind as i32),
    );
    // Why a root: a connection is opened by a peer, not caused by any span this
    // daemon is running. Attaching it to whatever happened to be current on the
    // accept task would splice unrelated work into the session's trace.
    let mut trace_span = services
        .protocol_diagnostics()
        .start_root_trace_span("runtime.session", trace_attributes);
    // Why captured here: `tokio::spawn` does not carry the ambient parent into a
    // new task, so each request task below is handed this identity explicitly.
    // That is what keeps two concurrent requests siblings of the session rather
    // than of each other.
    let session_span = trace_span.identity();
    let connection_id = channel.connection_id().to_owned();
    let principal_id = channel.principal_id().to_owned();
    let outgoing = channel.outgoing();
    let shell_services = services.shell_services();
    let reverse_protocol = services.reverse_protocol();
    let (reverse_client, mut reverse_commands, mut reverse_controls) =
        ReverseProtocolClient::channel();
    let mut reverse_registration = None;
    let mut multiplex_close = services.register_terminal_connection(connection_id.clone());
    let mut protocol_session = super::protocol_session::ProtocolSession::new(
        services.protocol_status(),
        &connection_id,
        channel.protocol_peer_kind(),
    );
    let protocol_access = ProtocolAccessContext::new(
        channel.authorization(),
        channel.principal(),
        channel.principal_id().to_owned(),
        channel.runtime_authorization(),
    );
    let protocol_router = ProtocolRouter::new(ProtocolRouterInputs {
        accounts: services.protocol_accounts(),
        app_control: services.protocol_app_control(),
        browser: services.protocol_browser(),
        agent_status: services.protocol_agent_status(),
        ai_vault: services.protocol_ai_vault(),
        cli: services.protocol_cli(),
        connection_id: connection_id.clone(),
        agent_session: services.protocol_agent_session(),
        agent_trust: services.protocol_agent_trust(),
        computer: services.protocol_computer(),
        markdown: services.protocol_markdown(),
        preflight: services.protocol_preflight(),
        ui: services.protocol_ui(),
        files: services.protocol_files(),
        browser_command: services.protocol_browser_command(),
        browser_replay: services.protocol_browser_replay(),
        browser_writeback: services.protocol_browser_writeback(),
        emulator: services.protocol_emulator(),
        shell_files: services.protocol_shell_files(),
        git: services.protocol_git(),
        orchestration: services.protocol_orchestration(),
        provider_usage: services.protocol_provider_usage(),
        rate_limit_resume: services.protocol_rate_limit_resume(),
        crash_reports: services.protocol_crash_reports(),
        feedback: services.protocol_feedback(),
        layout: services.protocol_layout(),
        star_nag: services.protocol_star_nag(),
        worktree_labels: services.protocol_worktree_labels(),
        diagnostics: services.protocol_diagnostics(),
        github: services.protocol_github(),
        host_registry: services.protocol_host_registry(),
        local_downloads: services.protocol_local_downloads(),
        mobile: services.protocol_mobile(),
        notifications: services.protocol_notifications(),
        repo: services.protocol_repo(),
        repository_refs: services.protocol_repository_refs(),
        session_tabs: services.protocol_session_tabs(),
        project_group: services.protocol_project_group(),
        shell_platform: services.protocol_shell_platform(),
        skills: services.protocol_skills(),
        settings: services.protocol_settings(),
        repo_host: services.protocol_repo_host(),
        runtime_environments: services.protocol_runtime_environments(),
        stats: services.protocol_stats(),
        status: services.protocol_status(),
        terminal: services.protocol_terminal(),
        updater: services.protocol_updater(),
        workspace_events: services.protocol_workspace_events(),
        worktree: services.protocol_worktree(),
        windows_firewall: services.protocol_windows_firewall(),
        developer_permissions: services.protocol_developer_permissions(),
        keybindings: services.protocol_keybindings(),
        artifact: services.protocol_artifact(),
        dangerous_approval: services.protocol_dangerous_approval(),
        project_host_setup: services.protocol_project_host_setup(),
        clipboard: services.protocol_clipboard(),
        folder_workspace: services.protocol_folder_workspace(),
        profiles: services.protocol_profiles(),
        workspace_cleanup: services.protocol_workspace_cleanup(),
        workspace_session: services.protocol_workspace_session(),
        shell_telemetry: services.protocol_shell_telemetry(),
        ritual: services.protocol_ritual(),
        workspace_ports: services.protocol_workspace_ports(),
        shell_state: services.protocol_shell_state(),
        project: services.protocol_project(),
        visual_regression: services.protocol_visual_regression(),
        workspace_space: services.protocol_workspace_space(),
        client_events: services.protocol_client_events(),
        project_context: services.protocol_project_context(),
        notebook: services.protocol_notebook(),
        external_editor: services.protocol_external_editor(),
        shell_events: services.protocol_shell_events(),
        shell_runtime: services.protocol_shell_runtime(),
        shell_host: shell_services.clone(),
        host_progress: services.protocol_host_progress(),
    });
    let mut protocol_tasks = JoinSet::<()>::new();
    let (protocol_completions, mut incoming_protocol_completions) =
        mpsc::channel::<ProtocolCompletion>(PROTOCOL_COMPLETION_LIMIT);
    let protocol_response_budget = ProtocolResponseBudget::new();
    let result = loop {
        let protocol_maintenance_at = protocol_session.next_maintenance_at();
        tokio::select! {
            frame = channel.receive() => {
                let Some(frame) = frame else {
                    break Ok(());
                };
                let RpcMessage::Binary(bytes) = frame else {
                    outgoing.close(1003, "This connection accepts only AgentStart protocol frames");
                    break Ok(());
                };
                        match protocol_session.receive(
                            &bytes,
                            &outgoing,
                            MAX_ACTIVE_CALLS_PER_CONNECTION,
                        ) {
                            Ok(ProtocolReceive::Consumed) => {
                                if reverse_registration.is_none()
                                    && protocol_session.reverse_calls_enabled()
                                {
                                    protocol_session.configure_reverse();
                                    reverse_registration = Some(reverse_protocol.connect_web(
                                        connection_id.clone(),
                                        reverse_client.clone(),
                                    ));
                                }
                                continue;
                            }
                            Ok(ProtocolReceive::Dispatch(call)) => {
                                let access = protocol_access.clone();
                                let router = protocol_router.clone();
                                let completions = protocol_completions.clone();
                                let response_budget = protocol_response_budget.clone();
                                let parent = session_span.clone();
                                protocol_tasks.spawn(scope_optional(parent, async move {
                                    Box::pin(execute_protocol_call(
                                        router,
                                        access,
                                        call,
                                        completions,
                                        response_budget,
                                    )).await
                                }));
                                continue;
                            }
                            Ok(ProtocolReceive::Unrecognized) => {
                                outgoing.close(1003, "Connection received a non-AgentStart frame");
                                break Ok(());
                            }
                            Err(error) => break Err(error),
                        }
            }
            completed = incoming_protocol_completions.recv() => {
                let Some(completed) = completed else {
                    break Err(SessionError::Protocol(
                        "Protocol completion channel closed".to_owned()
                    ));
                };
                if let Err(error) = protocol_session.complete(completed, &outgoing) {
                    break Err(error);
                }
            }
            command = reverse_commands.recv(), if reverse_registration.is_some() => {
                let Some(command) = command else {
                    break Err(SessionError::Protocol(
                        "Reverse protocol command channel closed".to_owned()
                    ));
                };
                protocol_session.start_reverse(command, &outgoing)?;
            }
            control = reverse_controls.recv(), if reverse_registration.is_some() => {
                let Some(control) = control else {
                    break Err(SessionError::Protocol(
                        "Reverse protocol control channel closed".to_owned()
                    ));
                };
                protocol_session.control_reverse(control, &outgoing)?;
            }
            completed = protocol_tasks.join_next(), if !protocol_tasks.is_empty() => {
                let Some(completed) = completed else {
                    continue;
                };
                if let Err(error) = completed
                    && !error.is_cancelled()
                {
                    break Err(error.into());
                }
            }
            () = wait_for_protocol_maintenance(protocol_maintenance_at) => {
                if let Err(error) = protocol_session.maintain(Instant::now(), &outgoing) {
                    break Err(error);
                }
            }
            close = multiplex_close_requested(&mut multiplex_close) => {
                if let Some(close) = close {
                    outgoing.close(close.code, close.reason);
                }
                break Ok(());
            }
        }
    };
    shell_services.disconnect(&connection_id).await;
    drop(reverse_registration);
    protocol_session.cancel_all();
    protocol_tasks.abort_all();
    while protocol_tasks.join_next().await.is_some() {}
    services.close_terminal_connection(&connection_id);
    services.close_github_connection(&connection_id);
    services.close_session_tabs_connection(&connection_id);
    services.close_local_download_connection(&connection_id);
    services.revoke_file_grants(&principal_id);
    if result.is_ok() {
        trace_span.success();
    } else {
        trace_span.failure("runtime session failed");
    }
    result
}

async fn wait_for_protocol_maintenance(deadline: Option<Instant>) {
    match deadline {
        Some(deadline) => sleep_until(deadline).await,
        None => pending::<()>().await,
    }
}

async fn multiplex_close_requested(
    receiver: &mut tokio::sync::watch::Receiver<
        Option<crate::terminal_session::TerminalMultiplexClose>,
    >,
) -> Option<crate::terminal_session::TerminalMultiplexClose> {
    if let Some(close) = receiver.borrow().clone() {
        return Some(close);
    }
    while receiver.changed().await.is_ok() {
        if let Some(close) = receiver.borrow().clone() {
            return Some(close);
        }
    }
    None
}

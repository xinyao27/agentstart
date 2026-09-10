use serde_json::Value;
use tokio::sync::{mpsc, oneshot};
use tokio::task::JoinHandle;

use crate::persistence::WorkspaceJournal;
use crate::settings::SettingsAuthority;
use crate::shell_services::ShellServicesRegistry;

use super::{MobileNotificationEvent, NotificationAuthority, NotificationSource};

const AGENT_PHASE_CAPACITY: usize = 256;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum AgentPhase {
    Complete,
    Executing,
    Thinking,
    WaitingDecision,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum NotificationPhase {
    Complete,
    WaitingDecision,
}

#[derive(Clone, Debug)]
pub(crate) struct AgentPhaseTransition {
    pub(crate) agent_type: String,
    pub(crate) interrupted: bool,
    pub(crate) last_assistant_message: Option<String>,
    pub(crate) phase: AgentPhase,
    pub(crate) terminal_handle: String,
    pub(crate) tool_input: Option<String>,
    pub(crate) tool_name: Option<String>,
    pub(crate) worktree_id: String,
}

#[derive(Clone)]
pub(crate) struct AgentPhasePublisher {
    sender: mpsc::Sender<AgentPhaseTransition>,
}

pub(crate) struct AgentPhaseReceiver {
    receiver: mpsc::Receiver<AgentPhaseTransition>,
}

pub(crate) struct AgentPhaseWorker {
    shutdown: Option<oneshot::Sender<()>>,
    task: JoinHandle<()>,
}

pub(crate) fn agent_phase_channel() -> (AgentPhasePublisher, AgentPhaseReceiver) {
    let (sender, receiver) = mpsc::channel(AGENT_PHASE_CAPACITY);
    (
        AgentPhasePublisher { sender },
        AgentPhaseReceiver { receiver },
    )
}

pub(crate) fn transition_from_status(
    terminal_handle: String,
    previous: Option<&Value>,
    current: &Value,
) -> Option<AgentPhaseTransition> {
    if current.get("providerSessionOnly").and_then(Value::as_bool) == Some(true) {
        return None;
    }
    let worktree_id = current
        .get("worktreeId")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())?;
    let phase = phase_from_status(current)?;
    let previous_phase = previous.and_then(phase_from_status);
    if previous_phase == Some(phase) {
        return None;
    }
    Some(AgentPhaseTransition {
        agent_type: stored_string(current, "agentType").unwrap_or_else(|| "unknown".to_owned()),
        interrupted: current.get("interrupted").and_then(Value::as_bool) == Some(true),
        last_assistant_message: stored_string(current, "lastAssistantMessage"),
        phase,
        terminal_handle,
        tool_input: stored_string(current, "toolInput"),
        tool_name: stored_string(current, "toolName"),
        worktree_id: worktree_id.to_owned(),
    })
}

pub(crate) fn start_agent_phase_worker(
    mut phases: AgentPhaseReceiver,
    notifications: NotificationAuthority,
    settings: SettingsAuthority,
    shells: ShellServicesRegistry,
    journal: WorkspaceJournal,
) -> AgentPhaseWorker {
    let (shutdown, mut closed) = oneshot::channel();
    let task = tokio::spawn(async move {
        loop {
            let transition = tokio::select! {
                biased;
                _ = &mut closed => {
                    phases.receiver.close();
                    break;
                }
                transition = phases.receive() => transition,
            };
            let Some(transition) = transition else {
                return;
            };
            publish_notification(&notifications, &settings, &shells, &journal, transition).await;
        }
        while let Some(transition) = phases.receive().await {
            publish_notification(&notifications, &settings, &shells, &journal, transition).await;
        }
    });
    AgentPhaseWorker {
        shutdown: Some(shutdown),
        task,
    }
}

fn phase_from_status(status: &Value) -> Option<AgentPhase> {
    match status.get("state").and_then(Value::as_str)? {
        "blocked" | "waiting" => Some(AgentPhase::WaitingDecision),
        "done" => Some(AgentPhase::Complete),
        "working" if status.get("toolName").and_then(Value::as_str).is_some() => {
            Some(AgentPhase::Executing)
        }
        "working" => Some(AgentPhase::Thinking),
        _ => None,
    }
}

fn stored_string(value: &Value, field: &str) -> Option<String> {
    value
        .get(field)
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

impl AgentPhasePublisher {
    pub(crate) async fn publish(&self, transition: AgentPhaseTransition) {
        // Why: hook state remains authoritative if shutdown has already closed notification
        // delivery, while a live consumer applies bounded backpressure instead of dropping phases.
        let _ = self.sender.send(transition).await;
    }
}

impl AgentPhaseReceiver {
    pub(crate) async fn receive(&mut self) -> Option<AgentPhaseTransition> {
        self.receiver.recv().await
    }
}

impl AgentPhaseWorker {
    pub(crate) async fn shutdown(mut self) {
        if let Some(shutdown) = self.shutdown.take() {
            let _ = shutdown.send(());
        }
        let _ = self.task.await;
    }
}

async fn publish_notification(
    notifications: &NotificationAuthority,
    settings: &SettingsAuthority,
    shells: &ShellServicesRegistry,
    journal: &WorkspaceJournal,
    transition: AgentPhaseTransition,
) {
    let settings = settings.notification_settings();
    if !settings.enabled || !settings.agent_task_complete {
        return;
    }
    let (phase, title) = match transition.phase {
        AgentPhase::Complete => (NotificationPhase::Complete, "AgentStart agent completed"),
        AgentPhase::WaitingDecision => (
            NotificationPhase::WaitingDecision,
            "AgentStart needs your decision",
        ),
        AgentPhase::Executing | AgentPhase::Thinking => return,
    };
    let body = notification_body(&transition);
    if notifications.reserve_mobile_delivery(&transition.worktree_id) {
        let event = MobileNotificationEvent::Notification {
            body: body.clone(),
            notification_id: Some(transition.terminal_handle.clone()),
            source: NotificationSource::AgentTaskComplete,
            title: title.to_owned(),
            worktree_id: Some(transition.worktree_id.clone()),
        };
        if let Err(error) = notifications.dispatch(event).await {
            notifications.rollback_mobile_delivery(&transition.worktree_id);
            eprintln!("[daemon] Failed to persist agent phase notification: {error}");
        }
    }
    if !shells.has_web_connection().await
        && notifications.reserve_local_delivery(&transition.worktree_id)
        && !super::native::publish(
            journal,
            phase,
            title,
            &body,
            &transition.terminal_handle,
            &transition.worktree_id,
        )
        .await
    {
        notifications.rollback_local_delivery(&transition.worktree_id);
    }
}

fn notification_body(transition: &AgentPhaseTransition) -> String {
    if let Some(message) = transition
        .last_assistant_message
        .as_deref()
        .and_then(normalized_preview)
    {
        return message;
    }
    let tool_name = transition.tool_name.as_deref().and_then(normalized_preview);
    let tool_input = transition
        .tool_input
        .as_deref()
        .and_then(normalized_preview);
    match (tool_name, tool_input) {
        (Some(name), Some(input)) => format!("Using {name}: {input}"),
        (Some(name), None) => format!("Using {name}"),
        (None, Some(input)) => format!("Tool input: {input}"),
        (None, None) if transition.interrupted => {
            format!("{} stopped.", agent_label(&transition.agent_type))
        }
        (None, None) => "Open AgentStart to review the agent session".to_owned(),
    }
}

fn normalized_preview(value: &str) -> Option<String> {
    let normalized = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if normalized.is_empty() {
        return None;
    }
    let mut characters = normalized.chars();
    let preview = characters.by_ref().take(179).collect::<String>();
    Some(if characters.next().is_some() {
        format!("{preview}…")
    } else {
        preview
    })
}

fn agent_label(agent_type: &str) -> &str {
    match agent_type {
        "claude" => "Claude",
        "codex" => "Codex",
        "gemini" => "Gemini",
        "opencode" => "OpenCode",
        "unknown" => "Agent",
        value => value,
    }
}

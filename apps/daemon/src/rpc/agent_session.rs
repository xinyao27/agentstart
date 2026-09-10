mod protocol;

use serde_json::{Value, json};
use thiserror::Error;

use crate::host_registry::{HostRegistry, HostRegistryError};
use crate::hosts::{HostFilesystem, HostFilesystemError};
use crate::persistence::{AgentSessionRow, AgentSessionStore};
use crate::terminal_session::{
    TerminalClient, TerminalClientType, TerminalCreateRequest, TerminalPresentation,
    TerminalSendRequest, TerminalSessionAuthority, TerminalSessionError,
};
use crate::worktrees::{WorktreeCatalog, WorktreeCatalogError};

const PROVIDERS: &[(&str, &str, &[&str], bool)] = &[
    ("claude", "Claude Code", &["claude"], true),
    ("openclaude", "OpenClaude", &["openclaude"], false),
    ("codex", "OpenAI Codex", &["codex"], true),
    ("autohand", "Autohand", &["autohand"], false),
    ("opencode", "OpenCode", &["opencode"], true),
    ("mimo-code", "Mimo Code", &["mimo"], true),
    ("pi", "Pi", &["pi"], true),
    ("omp", "OMP", &["omp"], true),
    ("gemini", "Gemini CLI", &["gemini"], true),
    ("antigravity", "Antigravity", &["agy", "antigravity"], true),
    ("aider", "Aider", &["aider"], false),
    ("goose", "Goose", &["goose"], false),
    ("amp", "Amp", &["amp"], false),
    ("kilo", "Kilocode", &["kilo"], false),
    ("kiro", "Kiro", &["kiro-cli", "kiro"], false),
    ("crush", "Crush", &["crush"], false),
    ("aug", "Auggie", &["auggie", "aug"], false),
    ("cline", "Cline", &["cline"], false),
    ("codebuff", "Codebuff", &["codebuff"], false),
    ("command-code", "Command Code", &["command-code"], false),
    ("continue", "Continue", &["cn", "continue"], false),
    ("cursor", "Cursor Agent", &["cursor-agent", "cursor"], false),
    ("droid", "Factory Droid", &["droid"], true),
    ("kimi", "Kimi", &["kimi"], false),
    ("mistral-vibe", "Mistral Vibe", &["vibe"], false),
    ("qwen-code", "Qwen Code", &["qwen", "qwen-code"], false),
    ("rovo", "Rovo Dev", &["acli", "rovo"], false),
    ("hermes", "Hermes Agent", &["hermes"], false),
    ("openclaw", "OpenClaw", &["openclaw"], false),
    ("copilot", "GitHub Copilot CLI", &["copilot"], false),
    ("grok", "Grok CLI", &["grok"], true),
    ("devin", "Devin CLI", &["devin"], true),
    ("ante", "Ante", &["ante"], false),
    ("trae", "Trae", &["trae"], false),
];

#[derive(Clone)]
pub(crate) struct AgentSessionAuthority {
    store: AgentSessionStore,
    terminals: TerminalSessionAuthority,
    hosts: HostRegistry,
    worktrees: WorktreeCatalog,
}

#[derive(Clone)]
pub(super) struct AgentSessionRpc {
    authority: AgentSessionAuthority,
}

// Why: the typed launch primitive shared with layouts::authority (an agent pane in a layout
// recipe) and the legacy agentSession.start JSON handler in this file.
#[derive(Clone)]
pub(crate) struct AgentSessionLaunchRequest {
    pub(crate) agent: String,
    pub(crate) presentation: TerminalPresentation,
    pub(crate) prompt: Option<String>,
    pub(crate) title: Option<String>,
    pub(crate) worktree_id: String,
}

pub(crate) struct AgentSessionLaunch {
    pub(crate) session_id: String,
    // Why: the legacy agentSession.start JSON handler returns this exact object (the same value
    // session_value(&terminal) would recompute); carrying it here avoids a second lookup after
    // store.create that could theoretically disagree with what was just persisted.
    pub(crate) session: Value,
    pub(crate) terminal_handle: String,
    pub(crate) title: String,
}

// Why: the typed followup primitive shared by the legacy agentSession.followup JSON handler and
// the protobuf AgentSessionService.Followup handler, mirroring launch()'s split above.
pub(crate) struct AgentSessionFollowupRequest {
    pub(crate) session_id: String,
    pub(crate) prompt: String,
}

pub(crate) struct AgentSessionFollowup {
    pub(crate) accepted: bool,
    pub(crate) session: Value,
}

#[derive(Debug, Error)]
pub(crate) enum AgentSessionLaunchError {
    #[error("agent_provider_unknown")]
    UnknownProvider,
    #[error("agent_provider_unavailable:{0}")]
    ProviderUnavailable(String),
    #[error("agent_session_terminal_missing")]
    TerminalMissing,
    // Why: forwards row_from_value's exact "agent_session_invalid:<field>" message; that helper
    // stays String-shaped since it also backs the untyped legacy dispatch below.
    #[error("{0}")]
    InvalidSessionRow(String),
    // Why: AgentSessionStore's error type is private to the persistence module and out of this
    // slice's owned files, so its message is captured as text rather than widening its visibility.
    #[error("{0}")]
    Store(String),
    #[error(transparent)]
    Filesystem(#[from] HostFilesystemError),
    #[error(transparent)]
    Host(#[from] HostRegistryError),
    #[error(transparent)]
    Terminal(#[from] TerminalSessionError),
    #[error(transparent)]
    Worktree(#[from] WorktreeCatalogError),
}

impl AgentSessionAuthority {
    pub(crate) fn new(
        store: AgentSessionStore,
        terminals: TerminalSessionAuthority,
        hosts: HostRegistry,
        worktrees: WorktreeCatalog,
    ) -> Self {
        Self {
            store,
            terminals,
            hosts,
            worktrees,
        }
    }

    async fn providers(&self, host_id: &str) -> Result<Value, String> {
        let host = self
            .hosts
            .execution_host(host_id)
            .await
            .map_err(|error| error.to_string())?;
        let filesystem = HostFilesystem::new(host);
        let mut providers = Vec::with_capacity(PROVIDERS.len());
        for &(id, label, candidates, resumable) in PROVIDERS {
            let executable = find_executable(&filesystem, candidates)
                .await
                .map_err(|error| error.to_string())?;
            providers.push(json!({
                "available": executable.is_some(),
                "executable": executable,
                "id": id,
                "label": label,
                "resumable": resumable,
            }));
        }
        Ok(json!({ "providers": providers }))
    }

    async fn list(&self, worktree_id: Option<&str>) -> Result<Value, String> {
        let live = self
            .terminals
            .agent_status_snapshot()
            .into_iter()
            .filter(|terminal| worktree_id.is_none_or(|id| id == terminal.worktree_id))
            .map(|terminal| (terminal.handle.clone(), terminal))
            .collect::<std::collections::HashMap<_, _>>();
        let mut sessions = Vec::new();
        let stored = self
            .store
            .list(worktree_id)
            .await
            .map_err(|error| error.to_string())?;
        let mut stored_handles = std::collections::HashSet::new();
        for row in stored {
            stored_handles.insert(row.terminal_handle.clone());
            if let Some(terminal) = live.get(&row.terminal_handle) {
                let current = session_value(terminal);
                let phase = current
                    .get("phase")
                    .and_then(Value::as_str)
                    .unwrap_or("thinking");
                let status = current
                    .get("status")
                    .and_then(Value::as_str)
                    .unwrap_or("interrupted");
                if row.phase != phase || row.status != status {
                    let updated = self
                        .store
                        .update(&row.id, phase, status)
                        .await
                        .map_err(|error| error.to_string())?;
                    sessions.push(updated.map_or(current, |value| row_value(&value)));
                } else {
                    sessions.push(row_value(&row));
                }
            } else if row.status == "running" {
                let updated = self
                    .store
                    .update(&row.id, "complete", "interrupted")
                    .await
                    .map_err(|error| error.to_string())?;
                if let Some(value) = updated {
                    sessions.push(row_value(&value));
                }
            } else {
                sessions.push(row_value(&row));
            }
        }
        sessions.extend(
            live.into_iter()
                .filter(|(handle, _)| !stored_handles.contains(handle))
                .map(|(_, terminal)| session_value(&terminal)),
        );
        sessions.sort_by(|left, right| {
            right
                .get("updatedAt")
                .and_then(Value::as_i64)
                .cmp(&left.get("updatedAt").and_then(Value::as_i64))
        });
        Ok(json!({ "sessions": sessions }))
    }

    // Why: Layout agent panes use the same launch lifecycle as direct agent-session requests.
    pub(crate) async fn launch(
        &self,
        request: AgentSessionLaunchRequest,
    ) -> Result<AgentSessionLaunch, AgentSessionLaunchError> {
        let provider = provider(&request.agent).ok_or(AgentSessionLaunchError::UnknownProvider)?;
        let worktree = self.worktrees.resolve_managed(&request.worktree_id).await?;
        let host = self.hosts.execution_host(&worktree.host_id).await?;
        let filesystem = HostFilesystem::new(host);
        let Some(executable) = find_executable(&filesystem, provider.2).await? else {
            return Err(AgentSessionLaunchError::ProviderUnavailable(request.agent));
        };
        let selector = format!("id:{}", request.worktree_id);
        let startup = self
            .terminals
            .agent_startup_with_executable(
                &selector,
                &request.agent,
                request.prompt.as_deref(),
                Some(&executable),
            )
            .await?;
        let title = request.title.unwrap_or_else(|| provider.1.to_owned());
        let created = self
            .terminals
            .create(TerminalCreateRequest {
                activate: false,
                cols: 120,
                command: Some(startup.command),
                cwd: None,
                cwd_fallback: false,
                env: startup.environment,
                env_to_delete: Vec::new(),
                focus: false,
                launch_agent: Some(request.agent),
                launch_config: Some(startup.launch_config),
                launch_token: None,
                leaf_id: None,
                presentation: Some(request.presentation),
                rows: 40,
                startup_command_delivery: startup.startup_command_delivery,
                renderer_backed: false,
                tab_id: None,
                title: Some(title.clone()),
                split_direction: None,
                split_from_leaf_id: None,
                split_telemetry_source: None,
                worktree: Some(selector),
            })
            .await?;
        let terminal = self
            .terminals
            .agent_status_snapshot()
            .into_iter()
            .find(|entry| entry.handle == created.handle)
            .ok_or(AgentSessionLaunchError::TerminalMissing)?;
        let session = session_value(&terminal);
        let row = row_from_value(&session).map_err(AgentSessionLaunchError::InvalidSessionRow)?;
        self.store
            .create(row)
            .await
            .map_err(|error| AgentSessionLaunchError::Store(error.to_string()))?;
        Ok(AgentSessionLaunch {
            session_id: created.handle.clone(),
            session,
            terminal_handle: created.handle,
            title,
        })
    }

    // Why: Partial-layout rollback stops the newly launched agent session, including its owned resources.
    pub(crate) async fn stop_launched(&self, session_id: &str) {
        let _ = self.terminals.close(session_id).await;
        let _ = self.store.update(session_id, "complete", "complete").await;
    }

    // Why: backs the protobuf AgentSessionService.Followup handler — see launch()'s own Why
    // comment for the same authority-vs-transport split.
    pub(crate) async fn send_followup(
        &self,
        request: AgentSessionFollowupRequest,
        principal_id: &str,
    ) -> Result<AgentSessionFollowup, String> {
        let current = self.session(&request.session_id).await?;
        if current.get("status").and_then(Value::as_str) != Some("running") {
            return Ok(AgentSessionFollowup {
                accepted: false,
                session: current,
            });
        }
        let prompt_sent = self
            .terminals
            .send_guarded(
                TerminalSendRequest {
                    claim_viewport: false,
                    client: Some(TerminalClient {
                        id: principal_id.to_owned(),
                        kind: TerminalClientType::Mobile,
                    }),
                    enter: false,
                    input_kind: None,
                    interrupt: false,
                    require_agent_sendable: true,
                    terminal: request.session_id.clone(),
                    text: Some(request.prompt),
                    viewport: None,
                },
                principal_id,
            )
            .await
            .map_err(|error| error.to_string())?;
        if !prompt_sent.accepted {
            return Ok(AgentSessionFollowup {
                accepted: false,
                session: self.session(&request.session_id).await?,
            });
        }
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        let submitted = self
            .terminals
            .send_guarded(
                TerminalSendRequest {
                    claim_viewport: false,
                    client: Some(TerminalClient {
                        id: principal_id.to_owned(),
                        kind: TerminalClientType::Mobile,
                    }),
                    enter: true,
                    input_kind: None,
                    interrupt: false,
                    require_agent_sendable: true,
                    terminal: request.session_id.clone(),
                    text: None,
                    viewport: None,
                },
                principal_id,
            )
            .await
            .map_err(|error| error.to_string())?;
        let session = self.session(&request.session_id).await?;
        Ok(AgentSessionFollowup {
            accepted: submitted.accepted,
            session,
        })
    }

    async fn stop(&self, session_id: &str) -> Result<Value, String> {
        let record = self.session(session_id).await?;
        if record
            .get("status")
            .and_then(Value::as_str)
            .is_some_and(|status| status == "running")
        {
            self.terminals
                .close(session_id)
                .await
                .map_err(|error| error.to_string())?;
        }
        let session = match self
            .store
            .update(session_id, "complete", "complete")
            .await
            .map_err(|error| error.to_string())?
        {
            Some(row) => row_value(&row),
            None => {
                let mut value = self.session(session_id).await?;
                let completed_at = now();
                if let Some(object) = value.as_object_mut() {
                    object.insert("completedAt".to_owned(), json!(completed_at));
                    object.insert("phase".to_owned(), json!("complete"));
                    object.insert("status".to_owned(), json!("complete"));
                    object.insert("updatedAt".to_owned(), json!(completed_at));
                }
                value
            }
        };
        Ok(json!({ "session": session }))
    }

    async fn session(&self, session_id: &str) -> Result<Value, String> {
        if let Some(terminal) = self
            .terminals
            .agent_status_snapshot()
            .into_iter()
            .find(|entry| entry.handle == session_id)
        {
            return Ok(session_value(&terminal));
        }
        if let Some(row) = self
            .store
            .find(session_id)
            .await
            .map_err(|error| error.to_string())?
        {
            if row.status == "running" {
                return self
                    .store
                    .update(session_id, "complete", "interrupted")
                    .await
                    .map_err(|error| error.to_string())?
                    .map_or_else(
                        || Err("agent_session_not_found".to_owned()),
                        |updated| Ok(row_value(&updated)),
                    );
            }
            return Ok(row_value(&row));
        }
        Err("agent_session_not_found".to_owned())
    }
}

impl AgentSessionRpc {
    pub(super) fn new(authority: AgentSessionAuthority) -> Self {
        Self { authority }
    }

    pub(super) async fn protocol_providers(
        &self,
        payload: &[u8],
    ) -> Result<Vec<u8>, agentstart_protocol::protocol::v1::Status> {
        protocol::providers(self, payload).await
    }

    pub(super) async fn protocol_list(
        &self,
        payload: &[u8],
    ) -> Result<Vec<u8>, agentstart_protocol::protocol::v1::Status> {
        protocol::list(self, payload).await
    }

    pub(super) async fn protocol_start(
        &self,
        payload: &[u8],
    ) -> Result<Vec<u8>, agentstart_protocol::protocol::v1::Status> {
        protocol::start(self, payload).await
    }

    pub(super) async fn protocol_followup(
        &self,
        payload: &[u8],
        principal_id: &str,
    ) -> Result<Vec<u8>, agentstart_protocol::protocol::v1::Status> {
        protocol::followup(self, payload, principal_id).await
    }

    pub(super) async fn protocol_stop(
        &self,
        payload: &[u8],
    ) -> Result<Vec<u8>, agentstart_protocol::protocol::v1::Status> {
        protocol::stop(self, payload).await
    }
}

fn provider(
    agent: &str,
) -> Option<&'static (&'static str, &'static str, &'static [&'static str], bool)> {
    PROVIDERS.iter().find(|entry| entry.0 == agent)
}

// Why: shared by providers() (probing every catalog entry) and launch() (probing one provider's
// candidates before starting it), so the "first candidate found on PATH wins" rule lives in
// exactly one place.
async fn find_executable(
    filesystem: &HostFilesystem,
    candidates: &[&str],
) -> Result<Option<String>, HostFilesystemError> {
    for candidate in candidates {
        if let Some(path) = filesystem.which(candidate).await? {
            return Ok(Some(path));
        }
    }
    Ok(None)
}

fn session_value(record: &crate::terminal_session::TerminalAgentStatusSnapshot) -> Value {
    let phase = match record.status {
        Some("permission") => "waiting-decision",
        Some("idle") => "complete",
        Some("working") => "thinking",
        None if record.process_exited => "complete",
        None => "thinking",
        _ => "thinking",
    };
    let status = if record.is_running_agent {
        "running"
    } else if phase == "complete" {
        "complete"
    } else {
        "interrupted"
    };
    json!({
        "agent": record.agent_type,
        "completedAt": (status != "running").then_some(record.updated_at),
        "createdAt": record.created_at,
        "id": record.handle,
        "phase": phase,
        "status": status,
        "terminalHandle": record.handle,
        "title": record.title,
        "updatedAt": record.updated_at.max(record.created_at),
        "worktreeId": record.worktree_id,
    })
}

fn row_value(row: &AgentSessionRow) -> Value {
    json!({
        "agent": row.agent,
        "completedAt": row.completed_at,
        "createdAt": row.created_at,
        "id": row.id,
        "phase": row.phase,
        "status": row.status,
        "terminalHandle": row.terminal_handle,
        "title": row.title,
        "updatedAt": row.updated_at,
        "worktreeId": row.worktree_id,
    })
}

fn row_from_value(value: &Value) -> Result<AgentSessionRow, String> {
    let string = |name: &str| {
        value
            .get(name)
            .and_then(Value::as_str)
            .map(str::to_owned)
            .ok_or_else(|| format!("agent_session_invalid:{name}"))
    };
    Ok(AgentSessionRow {
        agent: string("agent")?,
        completed_at: value.get("completedAt").and_then(Value::as_i64),
        created_at: value
            .get("createdAt")
            .and_then(Value::as_i64)
            .ok_or_else(|| "agent_session_invalid:createdAt".to_owned())?,
        id: string("id")?,
        phase: string("phase")?,
        status: string("status")?,
        terminal_handle: string("terminalHandle")?,
        title: value
            .get("title")
            .and_then(Value::as_str)
            .map(str::to_owned),
        updated_at: value
            .get("updatedAt")
            .and_then(Value::as_i64)
            .ok_or_else(|| "agent_session_invalid:updatedAt".to_owned())?,
        worktree_id: string("worktreeId")?,
    })
}

fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .ok()
        .and_then(|duration| i64::try_from(duration.as_millis()).ok())
        .unwrap_or(0)
}

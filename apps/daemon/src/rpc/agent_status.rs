mod worktree_rows;
use std::collections::HashMap;
use std::net::TcpListener;
use std::path::Path as FilePath;
use std::sync::{Arc, Mutex, OnceLock};

use axum::Router;
use axum::body::Bytes;
use axum::extract::{Path as RoutePath, State};
use axum::http::{HeaderMap, StatusCode, header};
use axum::routing::post;
use serde_json::{Value, json};
use tokio::sync::watch;

use crate::notifications::{AgentPhasePublisher, transition_from_status};
use crate::terminal_session::TerminalSessionAuthority;

mod endpoint;
mod persistence;
pub(super) mod protocol;

pub(crate) use persistence::AgentStatusFlushError;
use persistence::AgentStatusPersistence;

const AGENT_STATUS_STALE_AFTER_MS: i64 = 30 * 60 * 1_000;

/// One revision's worth of stream changes, keyed the way both the legacy JSON
/// stream and the protobuf stream publish them: removed keys first as clears,
/// then changed or new values as sets, statuses before migration entries.
pub(super) struct AgentStatusEventDiff {
    pub(super) cleared_panes: Vec<String>,
    pub(super) set_statuses: Vec<Value>,
    pub(super) cleared_ptys: Vec<String>,
    pub(super) set_migration_entries: Vec<Value>,
}

/// The previous per-key state a subscriber compares the next revision against.
#[derive(Default)]
pub(super) struct AgentStatusKeyedSnapshots {
    statuses: HashMap<String, Value>,
    migration: HashMap<String, Value>,
}

#[derive(Clone, Copy)]
enum AgentInterruptIntent {
    PlainEscape,
    CtrlC,
}

struct AgentInterruptInference {
    pane_key: String,
    baseline_updated_at: f64,
    baseline_state_started_at: f64,
    baseline_prompt: String,
    baseline_agent_type: Option<String>,
    intent: AgentInterruptIntent,
    input_count: Option<i64>,
}

#[derive(Clone)]
pub(crate) struct AgentStatusAuthority {
    statuses: Arc<Mutex<HashMap<String, Value>>>,
    migration: Arc<Mutex<HashMap<String, Value>>>,
    phase_publisher: AgentPhasePublisher,
    revision: watch::Sender<u64>,
    terminals: TerminalSessionAuthority,
    hook_port: u16,
    hook_token: Arc<String>,
    hook_endpoint: Arc<OnceLock<String>>,
    persistence: Arc<OnceLock<AgentStatusPersistence>>,
}

impl AgentStatusAuthority {
    pub(crate) fn new(
        terminals: TerminalSessionAuthority,
        phase_publisher: AgentPhasePublisher,
    ) -> Self {
        let token = hook_token();
        let listener = token.as_ref().and_then(|token| {
            let listener = TcpListener::bind(("127.0.0.1", 0)).ok()?;
            listener.set_nonblocking(true).ok()?;
            Some((listener, token.clone()))
        });
        let (hook_port, hook_token) =
            listener
                .as_ref()
                .map_or((0, String::new()), |(listener, token)| {
                    (
                        listener.local_addr().map_or(0, |address| address.port()),
                        token.clone(),
                    )
                });
        let authority = Self {
            statuses: Arc::new(Mutex::new(HashMap::new())),
            migration: Arc::new(Mutex::new(HashMap::new())),
            phase_publisher,
            revision: watch::channel(0).0,
            terminals,
            hook_port,
            hook_token: Arc::new(hook_token),
            hook_endpoint: Arc::new(OnceLock::new()),
            persistence: Arc::new(OnceLock::new()),
        };
        if let Some((listener, _)) = listener
            && let Ok(listener) = tokio::net::TcpListener::from_std(listener)
        {
            let state = authority.clone();
            tokio::spawn(async move {
                let router = Router::new()
                    .route("/hook/{source}", post(receive_hook))
                    .with_state(state);
                let _ = axum::serve(listener, router).await;
            });
        }
        authority
    }

    pub(crate) fn hook_environment(&self) -> Vec<(String, String)> {
        if self.hook_port == 0 || self.hook_token.is_empty() {
            return Vec::new();
        }
        let mut environment = vec![
            (
                "YIRU_AGENT_HOOK_PORT".to_owned(),
                self.hook_port.to_string(),
            ),
            (
                "YIRU_AGENT_HOOK_TOKEN".to_owned(),
                self.hook_token.to_string(),
            ),
            ("YIRU_AGENT_HOOK_ENV".to_owned(), "production".to_owned()),
            ("YIRU_AGENT_HOOK_VERSION".to_owned(), "1".to_owned()),
        ];
        if let Some(path) = self.hook_endpoint.get() {
            environment.push(("YIRU_AGENT_HOOK_ENDPOINT".to_owned(), path.clone()));
        }
        environment
    }

    pub(crate) fn configure_persistence(&self, user_data_path: &FilePath) {
        if self.hook_endpoint.get().is_none()
            && let Some(path) = endpoint::write(user_data_path, &self.hook_environment())
        {
            let _ = self.hook_endpoint.set(path);
        }
        let path = user_data_path.join("agent-hooks").join("last-status.json");
        self.restore(&path);
        // Why: the writer starts only after the restore so its first write can
        // never replace a good file with the still-empty in-memory maps.
        let _ = self.persistence.set(AgentStatusPersistence::start(
            path,
            self.statuses.clone(),
            self.migration.clone(),
        ));
    }

    /// Waits for every revision scheduled so far to reach disk.
    ///
    /// Why: shutdown must not drop the final state, and the debounce means the
    /// newest revisions are still in memory when the runtime stops. The result
    /// is honest so a caller can report an unpersisted revision instead of
    /// assuming success.
    pub(crate) async fn flush(&self) -> Result<(), AgentStatusFlushError> {
        match self.persistence.get() {
            Some(persistence) => persistence.flush().await,
            // Why: no configured path means nothing was ever scheduled, so
            // there is no state to lose.
            None => Ok(()),
        }
    }

    fn restore(&self, path: &FilePath) {
        let Ok(raw) = std::fs::read_to_string(path) else {
            return;
        };
        let Ok(value) = serde_json::from_str::<Value>(&raw) else {
            return;
        };
        let Some(entries) = value.get("entries").and_then(Value::as_object) else {
            return;
        };
        let cutoff = now().saturating_sub(7 * 24 * 60 * 60 * 1_000);
        let mut statuses = self
            .statuses
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        for (pane_key, entry) in entries {
            if entry
                .get("receivedAt")
                .and_then(Value::as_i64)
                .is_some_and(|received_at| received_at >= cutoff)
            {
                statuses.insert(pane_key.clone(), entry.clone());
            }
        }
        if let Some(entries) = value
            .get("migrationUnsupportedPtys")
            .and_then(Value::as_array)
        {
            let mut migration = self
                .migration
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            for entry in entries {
                if let Some(pty_id) = entry.get("ptyId").and_then(Value::as_str) {
                    migration.insert(pty_id.to_owned(), entry.clone());
                }
            }
        }
    }

    fn snapshot(&self) -> Vec<Value> {
        self.statuses
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .values()
            .cloned()
            .collect()
    }

    pub(super) fn keyed_snapshots(&self) -> AgentStatusKeyedSnapshots {
        AgentStatusKeyedSnapshots {
            statuses: keyed_values(self.snapshot(), "paneKey"),
            migration: keyed_values(self.migration_snapshot(), "ptyId"),
        }
    }

    /// Compares the live state against a subscriber's previous keyed
    /// snapshots and returns the changed values plus the next baseline. Both
    /// the legacy JSON stream and the protobuf stream must publish through
    /// this one function so their event ordering and set semantics cannot
    /// drift.
    pub(super) fn event_diff(
        &self,
        previous: &AgentStatusKeyedSnapshots,
    ) -> (AgentStatusKeyedSnapshots, AgentStatusEventDiff) {
        let next_statuses = keyed_values(self.snapshot(), "paneKey");
        let next_migration = keyed_values(self.migration_snapshot(), "ptyId");
        let diff = AgentStatusEventDiff {
            cleared_panes: previous
                .statuses
                .keys()
                .filter(|key| !next_statuses.contains_key(*key))
                .cloned()
                .collect(),
            set_statuses: next_statuses
                .iter()
                .filter(|(key, status)| previous.statuses.get(*key) != Some(*status))
                .map(|(_, status)| status.clone())
                .collect(),
            cleared_ptys: previous
                .migration
                .keys()
                .filter(|key| !next_migration.contains_key(*key))
                .cloned()
                .collect(),
            set_migration_entries: next_migration
                .iter()
                .filter(|(key, entry)| previous.migration.get(*key) != Some(*entry))
                .map(|(_, entry)| entry.clone())
                .collect(),
        };
        (
            AgentStatusKeyedSnapshots {
                statuses: next_statuses,
                migration: next_migration,
            },
            diff,
        )
    }

    fn migration_snapshot(&self) -> Vec<Value> {
        self.migration
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .values()
            .cloned()
            .collect()
    }

    fn drop_pane(&self, pane_key: &str) {
        self.statuses
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .remove(pane_key);
        self.migration
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .retain(|_, entry| entry.get("paneKey").and_then(Value::as_str) != Some(pane_key));
        self.bump();
    }

    fn drop_tab(&self, tab_id: &str) {
        let prefix = format!("{tab_id}:");
        self.statuses
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .retain(|pane_key, _| !pane_key.starts_with(&prefix));
        self.migration
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .retain(|_, entry| entry.get("tabId").and_then(Value::as_str) != Some(tab_id));
        self.bump();
    }

    async fn infer_interrupt(&self, input: &AgentInterruptInference) -> bool {
        let pane_key = input.pane_key.as_str();
        let Some(status) = self
            .statuses
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .get(pane_key)
            .cloned()
        else {
            return false;
        };
        let actual_agent = status.get("agentType").and_then(Value::as_str);
        let baseline_agent = input.baseline_agent_type.as_deref();
        let actual_agent = (actual_agent != Some("unknown"))
            .then_some(actual_agent)
            .flatten();
        let baseline_agent = (baseline_agent != Some("unknown"))
            .then_some(baseline_agent)
            .flatten();
        let received_at = status.get("receivedAt").and_then(Value::as_i64);
        if status.get("state").and_then(Value::as_str) != Some("working")
            || status.get("prompt").and_then(Value::as_str) != Some(input.baseline_prompt.as_str())
            || status.get("receivedAt").and_then(Value::as_f64) != Some(input.baseline_updated_at)
            || status.get("stateStartedAt").and_then(Value::as_f64)
                != Some(input.baseline_state_started_at)
            || actual_agent != baseline_agent
            || received_at.is_none_or(|received_at| {
                now().saturating_sub(received_at) > AGENT_STATUS_STALE_AFTER_MS
            })
        {
            return false;
        }
        if actual_agent == Some("droid") && matches!(input.intent, AgentInterruptIntent::CtrlC) {
            return false;
        }
        if matches!(actual_agent, Some("opencode" | "copilot"))
            && matches!(input.intent, AgentInterruptIntent::PlainEscape)
            && input.input_count != Some(2)
        {
            return false;
        }
        if status
            .get("subagents")
            .and_then(Value::as_array)
            .is_some_and(|subagents| {
                subagents
                    .iter()
                    .any(|subagent| subagent.get("state").and_then(Value::as_str) != Some("idle"))
            })
        {
            return false;
        }
        let Some(mut next) = status.as_object().cloned() else {
            return false;
        };
        next.insert("state".to_owned(), json!("done"));
        next.insert("interrupted".to_owned(), json!(true));
        let completed_at = now();
        next.insert("receivedAt".to_owned(), json!(completed_at));
        next.insert("stateStartedAt".to_owned(), json!(completed_at));
        let next = Value::Object(next);
        let transition = self
            .terminals
            .resolve_pane(pane_key)
            .ok()
            .and_then(|terminal| transition_from_status(terminal.handle, Some(&status), &next));
        self.statuses
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .insert(pane_key.to_owned(), next);
        self.bump();
        if let Some(transition) = transition {
            self.phase_publisher.publish(transition).await;
        }
        true
    }

    fn transfer(&self, from: &str, to: &str, pty_id: Option<&str>) -> bool {
        let Ok(source) = self.terminals.resolve_pane(from) else {
            return false;
        };
        if from == to || pty_id.is_some_and(|pty| source.pty_id.as_deref() != Some(pty)) {
            return false;
        }
        let mut statuses = self
            .statuses
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let Some(mut status) = statuses.remove(from) else {
            return false;
        };
        if let Some(object) = status.as_object_mut() {
            object.insert("paneKey".to_owned(), json!(to));
        }
        statuses.insert(to.to_owned(), status);
        drop(statuses);
        self.bump();
        true
    }

    fn bump(&self) {
        let mut revision = 0;
        self.revision.send_modify(|value| {
            *value = value.saturating_add(1);
            revision = *value;
        });
        // Why: mutations only publish the new revision. The persistence actor
        // reads the live maps once per debounced write, so a burst of status
        // changes costs one file write instead of one per change.
        if let Some(persistence) = self.persistence.get() {
            persistence.schedule(revision);
        }
    }

    async fn ingest_hook(&self, source: &str, body: Value) -> bool {
        let Some(object) = body.as_object() else {
            return false;
        };
        let Some(pane_key) = object.get("paneKey").and_then(Value::as_str) else {
            return false;
        };
        let Ok(terminal) = self.terminals.resolve_pane(pane_key) else {
            return false;
        };
        let launch_token = object.get("launchToken").and_then(Value::as_str);
        if self
            .terminals
            .launch_token_for_pane(pane_key)
            .ok()
            .flatten()
            .is_some_and(|expected| launch_token != Some(expected.as_str()))
        {
            return false;
        }
        let Some(raw_payload) = object.get("payload") else {
            return false;
        };
        let payload = if let Some(raw) = raw_payload.as_str() {
            serde_json::from_str(raw).ok()
        } else {
            Some(raw_payload.clone())
        };
        let Some(payload) = payload.and_then(|value| value.as_object().cloned()) else {
            return false;
        };
        let event = object
            .get("hookEventName")
            .or_else(|| object.get("hook_event_name"))
            .and_then(Value::as_str)
            .or_else(|| payload.get("hookEventName").and_then(Value::as_str))
            .or_else(|| payload.get("hook_event_name").and_then(Value::as_str));
        let provider_session = provider_session(source, &payload);
        let provider_session_only =
            source == "pi" && event == Some("session_start") && provider_session.is_some();
        let previous = self
            .statuses
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .get(pane_key)
            .cloned();
        // The hook event is authoritative for known providers. A raw state is
        // accepted only for an event-less payload, which is the real fallback
        // used by already-normalized remote relays; an unknown event must not
        // be guessed from words such as "start" or "stop".
        let state = event
            .and_then(|event| provider_event_state(source, event, &payload))
            .or_else(|| {
                if event.is_none() {
                    payload
                        .get("state")
                        .and_then(Value::as_str)
                        .filter(|state| {
                            matches!(*state, "working" | "blocked" | "waiting" | "done")
                        })
                } else {
                    None
                }
            })
            .or_else(|| provider_session_only.then_some("done"));
        let Some(mut state) = state else {
            return false;
        };
        let normalized_subagents = normalize_subagents(&payload, previous.as_ref(), source, event);
        if state == "done"
            && source == "claude"
            && normalized_subagents
                .as_ref()
                .and_then(Value::as_array)
                .is_some_and(|children| {
                    children
                        .iter()
                        .any(|child| child.get("state").and_then(Value::as_str) != Some("idle"))
                })
        {
            state = "working";
        }
        let received_at = now();
        let state_started_at = previous
            .as_ref()
            .filter(|entry| entry.get("state").and_then(Value::as_str) == Some(state))
            .and_then(|entry| entry.get("stateStartedAt"))
            .and_then(Value::as_i64)
            .unwrap_or(received_at);
        let prompt = first_string(
            &payload,
            &[
                "prompt",
                "user_prompt",
                "userPrompt",
                "user_message",
                "userMessage",
                "last_user_prompt",
                "lastUserPrompt",
                "query",
                "text",
                "message",
            ],
        )
        .or_else(|| {
            previous
                .as_ref()
                .and_then(|entry| entry.get("prompt"))
                .and_then(Value::as_str)
                .map(str::to_owned)
        })
        .unwrap_or_default();
        let tool_name = first_string(&payload, &["toolName", "tool_name", "name"]).or_else(|| {
            previous
                .as_ref()
                .and_then(|entry| first_string_from_value(entry, "toolName"))
        });
        let tool_input = first_string(
            &payload,
            &["toolInput", "tool_input", "command", "file_path", "path"],
        )
        .or_else(|| {
            previous
                .as_ref()
                .and_then(|entry| first_string_from_value(entry, "toolInput"))
        });
        let interactive_prompt = interactive_prompt(source, event, &payload, tool_name.as_deref())
            .or_else(|| {
                previous
                    .as_ref()
                    .and_then(|entry| first_string_from_value(entry, "interactivePrompt"))
            });
        let last_assistant_message = first_string(
            &payload,
            &[
                "lastAssistantMessage",
                "last_assistant_message",
                "responseText",
                "response_text",
                "errorMessage",
                "error_message",
            ],
        )
        .or_else(|| {
            previous
                .as_ref()
                .and_then(|entry| first_string_from_value(entry, "lastAssistantMessage"))
        });
        let interrupted = state == "done"
            && (payload.get("interrupted").and_then(Value::as_bool) == Some(true)
                || (source == "claude" || source == "devin" || source == "kimi")
                    && event.is_some_and(|name| name == "Stop")
                    && payload.get("is_interrupt").and_then(Value::as_bool) == Some(true)
                || source == "amp"
                    && event == Some("agent.end")
                    && payload.get("status").and_then(Value::as_str) == Some("cancelled")
                || source == "cursor"
                    && event == Some("stop")
                    && payload.get("status").and_then(Value::as_str) != Some("completed"));
        let mut status = json!({
            "paneKey": pane_key,
            "launchToken": launch_token,
            "tabId": object.get("tabId").and_then(Value::as_str),
            "worktreeId": object.get("worktreeId").and_then(Value::as_str),
            "connectionId": Value::Null,
            "receivedAt": received_at,
            "stateStartedAt": state_started_at,
            "state": state,
            "prompt": prompt,
            "agentType": source,
            "model": payload.get("model"),
            "toolName": tool_name,
            "toolInput": tool_input,
            "interactivePrompt": interactive_prompt,
            "lastAssistantMessage": last_assistant_message,
            "subagents": normalized_subagents,
            "providerSession": provider_session,
            "providerSessionOnly": provider_session_only.then_some(true),
            "promptInteractionKey": prompt_interaction_key(source, &payload),
            "toolUseId": first_string(&payload, &["tool_use_id", "toolUseId"]),
            "toolAgentId": first_string(&payload, &["agent_id", "agentId"]),
            "toolAgentType": first_string(&payload, &["agent_type", "agentType"]),
            "interrupted": interrupted.then_some(true),
        });
        if let Some(object) = status.as_object_mut() {
            for key in [
                "launchToken",
                "tabId",
                "worktreeId",
                "model",
                "toolName",
                "toolInput",
                "interactivePrompt",
                "lastAssistantMessage",
                "subagents",
                "providerSession",
                "promptInteractionKey",
                "toolUseId",
                "toolAgentId",
                "toolAgentType",
                "interrupted",
            ] {
                if object.get(key).is_some_and(Value::is_null) {
                    object.remove(key);
                }
            }
        }
        let transition = transition_from_status(terminal.handle, previous.as_ref(), &status);
        self.statuses
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .insert(pane_key.to_owned(), status);
        self.bump();
        if let Some(transition) = transition {
            self.phase_publisher.publish(transition).await;
        }
        true
    }
}

fn keyed_values(values: Vec<Value>, key: &str) -> HashMap<String, Value> {
    values
        .into_iter()
        .filter_map(|value| {
            let key = value.get(key).and_then(Value::as_str).map(str::to_owned)?;
            Some((key, value))
        })
        .collect()
}

async fn receive_hook(
    RoutePath(source): RoutePath<String>,
    State(authority): State<AgentStatusAuthority>,
    headers: HeaderMap,
    body: Bytes,
) -> StatusCode {
    let Some(token) = headers
        .get("x-yiru-agent-hook-token")
        .and_then(|value| value.to_str().ok())
    else {
        return StatusCode::UNAUTHORIZED;
    };
    if token != authority.hook_token.as_str() {
        return StatusCode::UNAUTHORIZED;
    }
    if body.len() > 1_048_576 {
        return StatusCode::PAYLOAD_TOO_LARGE;
    }
    let payload = if headers
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value.starts_with("application/x-www-form-urlencoded"))
    {
        let mut object = serde_json::Map::new();
        for (key, value) in url::form_urlencoded::parse(&body) {
            object.insert(key.into_owned(), Value::String(value.into_owned()));
        }
        Value::Object(object)
    } else {
        match serde_json::from_slice::<Value>(&body) {
            Ok(value) => value,
            Err(_) => return StatusCode::NO_CONTENT,
        }
    };
    let source = source.trim().to_ascii_lowercase();
    if !matches!(
        source.as_str(),
        "claude"
            | "codex"
            | "gemini"
            | "antigravity"
            | "amp"
            | "opencode"
            | "mimo-code"
            | "cursor"
            | "pi"
            | "omp"
            | "droid"
            | "command-code"
            | "grok"
            | "copilot"
            | "hermes"
            | "devin"
            | "kimi"
    ) {
        return StatusCode::NOT_FOUND;
    }
    let _ = authority.ingest_hook(&source, payload).await;
    StatusCode::NO_CONTENT
}

fn first_string(payload: &serde_json::Map<String, Value>, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| {
        payload
            .get(*key)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty() && value.len() <= 16_000)
            .filter(|value| !value.chars().any(|character| character.is_control()))
            .map(str::to_owned)
    })
}

fn first_string_from_value(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty() && value.len() <= 16_000)
        .filter(|value| !value.chars().any(|character| character.is_control()))
        .map(str::to_owned)
}

fn interactive_prompt(
    _source: &str,
    event: Option<&str>,
    payload: &serde_json::Map<String, Value>,
    tool_name: Option<&str>,
) -> Option<String> {
    if let Some(value) = first_string(payload, &["interactivePrompt", "interactive_prompt"]) {
        return Some(value);
    }
    let tool_input = payload
        .get("toolInput")
        .or_else(|| payload.get("tool_input"))
        .or_else(|| payload.get("input"));
    let normalized_tool = tool_name.map(|name| {
        name.chars()
            .filter(|character| character.is_ascii_alphanumeric())
            .collect::<String>()
            .to_ascii_lowercase()
    });
    if normalized_tool.as_deref() == Some("askuserquestion")
        && event != Some("PostToolUse")
        && event != Some("postToolUse")
        && let Some(input) = tool_input
    {
        return serde_json::to_string(input).ok();
    }
    if event == Some("PermissionRequest")
        && let Some(tool) = tool_name
    {
        let summary = tool_input
            .and_then(|input| {
                input
                    .get("command")
                    .or_else(|| input.get("file_path"))
                    .or_else(|| input.get("path"))
                    .and_then(Value::as_str)
            })
            .unwrap_or_default();
        return serde_json::to_string(&json!({
            "approval": {"tool": tool, "summary": summary}
        }))
        .ok();
    }
    None
}

fn event_is(event: &str, names: &[&str]) -> bool {
    names.contains(&event)
}

fn provider_event_state(
    source: &str,
    event: &str,
    payload: &serde_json::Map<String, Value>,
) -> Option<&'static str> {
    match source {
        "claude" | "devin" | "kimi" => {
            let ask_user = payload
                .get("tool_name")
                .or_else(|| payload.get("toolName"))
                .and_then(Value::as_str)
                .is_some_and(|name| {
                    name.chars()
                        .filter(|character| character.is_ascii_alphanumeric())
                        .collect::<String>()
                        .eq_ignore_ascii_case("askuserquestion")
                });
            if event_is(
                event,
                &["UserPromptSubmit", "PostToolUse", "PostToolUseFailure"],
            ) || (event == "PreToolUse" && !ask_user)
            {
                Some("working")
            } else if event == "PermissionRequest" || (event == "PreToolUse" && ask_user) {
                Some("waiting")
            } else if event_is(event, &["Stop", "StopFailure"])
                || (source == "devin" && event == "SessionEnd")
            {
                Some("done")
            } else if source == "devin" && event == "PostCompaction" {
                Some("working")
            } else if event_is(event, &["SubagentStart", "SubagentStop", "TeammateIdle"]) {
                // Lifecycle events update the child roster; the aggregate
                // status remains working until the lead reports completion.
                Some("working")
            } else {
                None
            }
        }
        "codex" => {
            if event_is(
                event,
                &[
                    "SessionStart",
                    "UserPromptSubmit",
                    "PreToolUse",
                    "PostToolUse",
                ],
            ) {
                Some("working")
            } else if event == "PermissionRequest" {
                Some("waiting")
            } else if event == "Stop" {
                Some("done")
            } else if event_is(event, &["SubagentStart", "SubagentStop"]) {
                Some("working")
            } else {
                None
            }
        }
        "gemini" => {
            if event_is(
                event,
                &[
                    "BeforeAgent",
                    "BeforeTool",
                    "AfterTool",
                    "PreToolUse",
                    "PostToolUse",
                ],
            ) {
                Some("working")
            } else if event == "AfterAgent" {
                Some("done")
            } else {
                None
            }
        }
        "antigravity" => {
            if event == "PreToolUse" {
                let tool = first_string(payload, &["tool_name", "toolName", "name"]);
                if tool.as_deref().is_some_and(|name| {
                    name.eq_ignore_ascii_case("ask_question")
                        || name.eq_ignore_ascii_case("ask_permission")
                }) {
                    return Some("waiting");
                }
            }
            if event == "Stop" {
                return if payload
                    .get("fullyIdle")
                    .or_else(|| payload.get("fully_idle"))
                    .and_then(Value::as_bool)
                    == Some(false)
                {
                    Some("working")
                } else {
                    Some("done")
                };
            }
            if event_is(
                event,
                &[
                    "PreInvocation",
                    "PostInvocation",
                    "PreToolUse",
                    "PostToolUse",
                ],
            ) {
                Some("working")
            } else {
                None
            }
        }
        "amp" => {
            if event_is(event, &["agent.start", "tool.call", "tool.result"]) {
                Some("working")
            } else if event == "agent.end" {
                Some("done")
            } else {
                None
            }
        }
        "opencode" | "mimo-code" => {
            if event_is(event, &["SessionBusy", "MessagePart"]) {
                Some("working")
            } else if event == "SessionIdle" {
                Some("done")
            } else if event_is(event, &["PermissionRequest", "AskUserQuestion"]) {
                Some("waiting")
            } else {
                None
            }
        }
        "cursor" => {
            if event_is(
                event,
                &[
                    "beforeSubmitPrompt",
                    "sessionStart",
                    "preToolUse",
                    "postToolUse",
                    "postToolUseFailure",
                    "beforeShellExecution",
                    "beforeMCPExecution",
                ],
            ) {
                Some("working")
            } else if event_is(event, &["afterAgentResponse", "stop", "sessionEnd"]) {
                Some("done")
            } else {
                None
            }
        }
        "pi" | "omp" => {
            if event_is(
                event,
                &[
                    "before_agent_start",
                    "agent_start",
                    "tool_call",
                    "tool_execution_start",
                    "tool_execution_end",
                    "message_end",
                ],
            ) {
                Some("working")
            } else if event == "agent_end" {
                Some("done")
            } else {
                None
            }
        }
        "droid" => {
            if event == "SessionStart" {
                None
            } else if event == "PreToolUse" {
                let tool = first_string(payload, &["tool_name", "toolName", "name"]);
                if tool.as_deref().is_some_and(|name| {
                    name.to_ascii_lowercase().contains("ask")
                        || name.to_ascii_lowercase().contains("permission")
                        || payload.get("riskLevel").is_some()
                        || payload.get("risk_level").is_some()
                }) {
                    Some("waiting")
                } else {
                    Some("working")
                }
            } else if event_is(event, &["UserPromptSubmit", "PostToolUse"]) {
                Some("working")
            } else if event == "Stop" {
                Some("done")
            } else if event == "PermissionRequest" {
                Some("waiting")
            } else if event == "Notification" {
                let message = first_string(payload, &["message"])
                    .unwrap_or_default()
                    .to_ascii_lowercase();
                if message.contains("permission") || message.contains("approval") {
                    Some("waiting")
                } else if message.contains("idle") || message.contains("ready") {
                    Some("done")
                } else {
                    None
                }
            } else {
                None
            }
        }
        "command-code" => {
            if event_is(event, &["PreToolUse", "PostToolUse"]) {
                Some("working")
            } else if event == "Stop" {
                Some("done")
            } else if event == "PermissionRequest" {
                Some("waiting")
            } else {
                None
            }
        }
        "grok" => {
            if event_is(
                event,
                &[
                    "user_prompt_submit",
                    "post_tool_use",
                    "post_tool_use_failure",
                ],
            ) || (event == "pre_tool_use"
                && !first_string(payload, &["toolName", "tool_name", "name"]).is_some_and(|name| {
                    name.replace('_', "")
                        .eq_ignore_ascii_case("askuserquestion")
                }))
                || event_is(event, &["pre_llm_call", "pre_tool_call", "post_tool_call"])
            {
                Some("working")
            } else if event == "pre_tool_use" {
                Some("waiting")
            } else if event_is(
                event,
                &[
                    "stop",
                    "session_end",
                    "stop_failure",
                    "post_llm_call",
                    "on_session_end",
                    "on_session_finalize",
                    "on_session_reset",
                ],
            ) {
                Some("done")
            } else if event == "pre_approval_request" {
                Some("waiting")
            } else if event == "notification" {
                let message = first_string(payload, &["message"])
                    .unwrap_or_default()
                    .to_ascii_lowercase();
                if message.contains("permission") || message.contains("approval") {
                    Some("waiting")
                } else if message.contains("idle") || message.contains("ready") {
                    Some("done")
                } else {
                    None
                }
            } else {
                None
            }
        }
        "copilot" => {
            let normalized = match event {
                "notification" | "Notification" => "Notification",
                "error_occurred" | "ErrorOccurred" => "ErrorOccurred",
                _ => event,
            };
            if event_is(
                normalized,
                &[
                    "SessionStart",
                    "UserPromptSubmit",
                    "PostToolUse",
                    "PostToolUseFailure",
                    "PreToolUse",
                    "PermissionRequest",
                ],
            ) {
                Some("working")
            } else if normalized == "Notification" {
                let kind = first_string(payload, &["notification_type", "notificationType"]);
                if kind.as_deref().is_some_and(|value| {
                    value == "permission_prompt" || value == "elicitation_dialog"
                }) {
                    Some("blocked")
                } else {
                    None
                }
            } else if normalized == "ErrorOccurred" {
                Some(
                    if payload.get("recoverable").and_then(Value::as_bool) == Some(true) {
                        "working"
                    } else {
                        "done"
                    },
                )
            } else if event_is(normalized, &["Stop", "SessionEnd"]) {
                Some("done")
            } else {
                None
            }
        }
        "hermes" => {
            if event == "pre_approval_request" {
                Some("waiting")
            } else if event_is(
                event,
                &[
                    "post_llm_call",
                    "on_session_end",
                    "on_session_finalize",
                    "on_session_reset",
                ],
            ) {
                Some("done")
            } else if event_is(
                event,
                &[
                    "on_session_start",
                    "pre_llm_call",
                    "pre_tool_call",
                    "post_tool_call",
                    "post_approval_response",
                ],
            ) {
                Some("working")
            } else {
                None
            }
        }
        _ => None,
    }
}

fn provider_session(source: &str, payload: &serde_json::Map<String, Value>) -> Option<Value> {
    let (key, id_keys, path_keys): (&str, &[&str], &[&str]) = match source {
        "claude" | "codex" => {
            if source == "codex" && payload.contains_key("agent_id") {
                return None;
            }
            (
                "session_id",
                &["session_id"],
                &["transcript_path", "transcriptPath"],
            )
        }
        "gemini" | "droid" | "kimi" => ("session_id", &["session_id"], &[]),
        "antigravity" => ("conversation_id", &["conversationId"], &[]),
        "opencode" | "mimo-code" => ("session_id", &["sessionID"], &[]),
        "pi" => ("session_id", &["session_id"], &["session_file"]),
        "grok" => ("session_id", &["sessionId", "session_id"], &[]),
        "devin" => ("session_id", &["session_id", "sessionId"], &[]),
        "omp" => ("session_id", &["session_id"], &[]),
        _ => return None,
    };
    let id = first_session_value(payload, id_keys)?;
    if source == "pi" && first_session_value(payload, path_keys).is_none() {
        return None;
    }
    let mut object = serde_json::Map::new();
    object.insert("key".to_owned(), Value::String(key.to_owned()));
    object.insert("id".to_owned(), Value::String(id));
    if let Some(path) = first_session_value(payload, path_keys) {
        object.insert("transcriptPath".to_owned(), Value::String(path));
    }
    Some(Value::Object(object))
}

fn first_session_value(payload: &serde_json::Map<String, Value>, keys: &[&str]) -> Option<String> {
    first_string(payload, keys).filter(|value| !value.starts_with('-') && value.len() <= 512)
}

fn prompt_interaction_key(
    source: &str,
    payload: &serde_json::Map<String, Value>,
) -> Option<String> {
    match source {
        "codex" => first_string(payload, &["turn_id", "turnId"]),
        "opencode" | "mimo-code" => {
            first_string(payload, &["messageID", "messageId", "message_id"])
                .map(|id| format!("{source}-message-{id}"))
        }
        "command-code" => first_string(payload, &["interactionKey", "interaction_key"]),
        _ => None,
    }
}

fn normalize_subagents(
    payload: &serde_json::Map<String, Value>,
    previous: Option<&Value>,
    source: &str,
    event: Option<&str>,
) -> Option<Value> {
    if let Some(array) = payload.get("subagents").and_then(Value::as_array) {
        let values: Vec<Value> = array
            .iter()
            .filter_map(normalize_subagent)
            .take(64)
            .collect();
        return (!values.is_empty()).then_some(Value::Array(values));
    }
    let agent_id = first_string(payload, &["agent_id", "agentId"]);
    if !matches!(source, "claude" | "codex") || agent_id.is_none() {
        if matches!(source, "claude" | "codex")
            && !matches!(event, Some("SessionStart") | Some("Stop"))
        {
            return previous.and_then(|value| value.get("subagents")).cloned();
        }
        return None;
    }
    let mut values = previous
        .and_then(|value| value.get("subagents"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let id = agent_id?;
    let next_state = if event == Some("SubagentStop") || event == Some("TeammateIdle") {
        "idle"
    } else {
        "working"
    };
    if let Some(child) = values
        .iter_mut()
        .find(|child| child.get("id").and_then(Value::as_str) == Some(id.as_str()))
    {
        if let Some(object) = child.as_object_mut() {
            object.insert("state".to_owned(), json!(next_state));
        }
    } else {
        values.push(json!({"id": id, "state": next_state, "startedAt": now()}));
    }
    Some(Value::Array(values.into_iter().take(64).collect()))
}

fn normalize_subagent(value: &Value) -> Option<Value> {
    let object = value.as_object()?;
    let id = first_string(object, &["id", "agentId", "agent_id"])?;
    let state = first_string(object, &["state", "status"])?;
    let state = match state.as_str() {
        "working" | "blocked" | "waiting" | "idle" => state,
        _ => return None,
    };
    let mut normalized = serde_json::Map::new();
    normalized.insert("id".to_owned(), Value::String(id));
    normalized.insert("state".to_owned(), Value::String(state));
    normalized.insert(
        "startedAt".to_owned(),
        object
            .get("startedAt")
            .or_else(|| object.get("started_at"))
            .and_then(Value::as_i64)
            .filter(|value| *value > 0)
            .map_or_else(|| json!(now()), |value| json!(value)),
    );
    if let Some(value) = first_string(object, &["agentType", "agent_type"]) {
        normalized.insert("agentType".to_owned(), Value::String(value));
    }
    if let Some(value) = first_string(object, &["model"]) {
        normalized.insert("model".to_owned(), Value::String(value));
    }
    if let Some(value) = first_string(object, &["description"]) {
        normalized.insert("description".to_owned(), Value::String(value));
    }
    Some(Value::Object(normalized))
}

fn hook_token() -> Option<String> {
    let mut bytes = [0_u8; 32];
    getrandom::fill(&mut bytes).ok()?;
    Some(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}

fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .ok()
        .and_then(|value| i64::try_from(value.as_millis()).ok())
        .unwrap_or(0)
}

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};
use thiserror::Error;
use tokio::sync::{Mutex as AsyncMutex, oneshot};
use tokio::task::JoinHandle;

use crate::atomic_file_replace;
use crate::shell_services::ShellServicesRegistry;

const GRACE_MS: i64 = 30_000;
const HISTORY_MAX_AGE_MS: i64 = 24 * 60 * 60 * 1_000;
const ROLLOUT_TAIL_BYTES: u64 = 512 * 1_024;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RateLimitResumeSchedule {
    agent: String,
    pty_id: String,
    tab_id: String,
    pane_key: String,
    worktree_id: String,
    prompt: String,
    provider: Option<String>,
    detected_at: f64,
    resets_at: Option<f64>,
    reset_description: Option<String>,
    window: Option<String>,
    id: String,
    resume_at: f64,
    status: String,
    created_at: f64,
    fired_at: Option<f64>,
    failure_reason: Option<String>,
}

#[derive(Clone)]
pub(crate) struct RateLimitResumeAuthority {
    path: PathBuf,
    renderer_connection: Arc<Mutex<Option<String>>>,
    shell: ShellServicesRegistry,
    state: Arc<Mutex<Vec<RateLimitResumeSchedule>>>,
    write_gate: Arc<AsyncMutex<()>>,
}

pub(crate) struct RateLimitResumeWorker {
    shutdown: Option<oneshot::Sender<()>>,
    task: JoinHandle<()>,
}

#[derive(Debug, Error)]
pub(crate) enum RateLimitResumeError {
    #[error("rate-limit resume input is invalid: {0}")]
    Input(&'static str),
    #[error("Rate-limit resume not found.")]
    NotFound,
    #[error("Cannot schedule a resume without a reset time.")]
    MissingReset,
    #[error("No AgentStart window was available to resume the session.")]
    ShellUnavailable,
    #[error("rate-limit resume storage failed: {0}")]
    Io(#[from] std::io::Error),
    #[error("rate-limit resume JSON failed: {0}")]
    Json(#[from] serde_json::Error),
    #[error("rate-limit resume clock failed: {0}")]
    Clock(#[from] std::time::SystemTimeError),
    #[error("rate-limit resume identifier generation failed: {0}")]
    Random(#[from] getrandom::Error),
}

impl RateLimitResumeAuthority {
    pub(crate) async fn open(
        root: &Path,
        shell: ShellServicesRegistry,
    ) -> Result<Self, RateLimitResumeError> {
        let path = root.join("agentstart-data-runtime.json");
        let schedules = read_schedules(&path).await?;
        let authority = Self {
            path,
            renderer_connection: Arc::new(Mutex::new(None)),
            shell,
            state: Arc::new(Mutex::new(prune(schedules, now_ms()?))),
            write_gate: Arc::new(AsyncMutex::new(())),
        };
        Ok(authority)
    }

    pub(crate) fn start_scheduler(&self) -> RateLimitResumeWorker {
        let scheduler = self.clone();
        let (shutdown, mut closed) = oneshot::channel();
        let task = tokio::spawn(async move {
            let mut interval = tokio::time::interval(std::time::Duration::from_secs(30));
            interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
            loop {
                tokio::select! {
                    biased;
                    _ = &mut closed => break,
                    _ = interval.tick() => scheduler.dispatch_due().await,
                }
            }
        });
        RateLimitResumeWorker {
            shutdown: Some(shutdown),
            task,
        }
    }

    pub(crate) fn list(&self) -> Vec<Value> {
        lock(&self.state)
            .iter()
            .filter_map(|schedule| serde_json::to_value(schedule).ok())
            .collect()
    }

    pub(crate) async fn schedule(
        &self,
        hit: &Map<String, Value>,
    ) -> Result<Value, RateLimitResumeError> {
        let resets_at =
            finite_number(hit.get("resetsAt")).ok_or(RateLimitResumeError::MissingReset)?;
        let now = now_ms()?;
        let schedule = RateLimitResumeSchedule {
            agent: required_string(hit, "agent")?,
            pty_id: required_string(hit, "ptyId")?,
            tab_id: required_string(hit, "tabId")?,
            pane_key: required_string(hit, "paneKey")?,
            worktree_id: required_string(hit, "worktreeId")?,
            prompt: string(hit, "prompt")?,
            provider: nullable_member(
                hit,
                "provider",
                &[
                    "claude",
                    "codex",
                    "cursor",
                    "gemini",
                    "opencodeGo",
                    "kimi",
                    "antigravity",
                    "minimax",
                    "grok",
                ],
            )?,
            detected_at: required_finite(hit, "detectedAt")?,
            resets_at: Some(resets_at),
            reset_description: nullable_string(hit, "resetDescription")?,
            window: nullable_member(hit, "window", &["session", "weekly"])?,
            id: random_uuid()?,
            resume_at: resets_at.max(now) + GRACE_MS as f64,
            status: "scheduled".to_owned(),
            created_at: now,
            fired_at: None,
            failure_reason: None,
        };
        {
            let mut schedules = lock(&self.state);
            schedules.retain(|entry| entry.pty_id != schedule.pty_id || is_final(&entry.status));
            schedules.push(schedule.clone());
        }
        self.persist().await?;
        Ok(serde_json::to_value(schedule)?)
    }

    pub(crate) async fn update(
        &self,
        id: &str,
        status: &str,
        failure_reason: Option<String>,
    ) -> Result<Value, RateLimitResumeError> {
        let now = now_ms()?;
        let updated = {
            let mut schedules = lock(&self.state);
            let schedule = schedules
                .iter_mut()
                .find(|entry| entry.id == id)
                .ok_or(RateLimitResumeError::NotFound)?;
            schedule.status = status.to_owned();
            schedule.failure_reason = failure_reason;
            if status == "fired" {
                schedule.fired_at = Some(now);
            }
            schedule.clone()
        };
        self.persist().await?;
        Ok(serde_json::to_value(updated)?)
    }

    pub(crate) async fn run_now(&self, id: &str) -> Result<Value, RateLimitResumeError> {
        let schedule = lock(&self.state)
            .iter()
            .find(|entry| entry.id == id)
            .cloned()
            .ok_or(RateLimitResumeError::NotFound)?;
        let body = serde_json::to_value(&schedule)?;
        let connection = lock(&self.renderer_connection).clone();
        let Some(connection) = connection else {
            return Err(RateLimitResumeError::ShellUnavailable);
        };
        let accepted = self
            .shell
            .request_web_exact(&connection, "/rateLimitResume/dispatch", body)
            .await
            .ok()
            .and_then(|value| value.get("accepted").and_then(Value::as_bool))
            == Some(true);
        if !accepted {
            return Err(RateLimitResumeError::ShellUnavailable);
        }
        Ok(serde_json::to_value(schedule)?)
    }

    pub(crate) async fn renderer_ready(
        &self,
        rpc_connection_id: &str,
    ) -> Result<(), RateLimitResumeError> {
        let connection_id = format!("web:{rpc_connection_id}");
        if !self.shell.has_connection(&connection_id).await {
            return Err(RateLimitResumeError::ShellUnavailable);
        }
        *lock(&self.renderer_connection) = Some(connection_id);
        self.dispatch_due().await;
        Ok(())
    }

    pub(crate) async fn inspect_codex(
        &self,
        input: &Map<String, Value>,
        codex_limits: Option<&Value>,
    ) -> Result<Value, RateLimitResumeError> {
        let session_id = required_string(input, "sessionId")?;
        let turn_id = required_string(input, "turnId")?;
        let transcript = input.get("transcriptPath").and_then(Value::as_str);
        let Some(path) = resolve_rollout_path(&session_id, transcript).await? else {
            return Ok(Value::Null);
        };
        let Some(event) = inspect_rollout(&path, &turn_id).await? else {
            return Ok(Value::Null);
        };
        let now = now_ms()?;
        let fallback = codex_limits.and_then(|limits| exhausted_window(limits, now));
        let event_reset_is_usable = event.resets_at.is_some_and(|value| value > now);
        let (resets_at, reset_description, window) = if event_reset_is_usable {
            (event.resets_at, None, event.window)
        } else {
            fallback.map_or((None, None, None), |value| {
                (Some(value.1), value.2, Some(value.0))
            })
        };
        Ok(json!({
            "agent": "codex",
            "ptyId": required_string(input, "ptyId")?,
            "tabId": required_string(input, "tabId")?,
            "paneKey": required_string(input, "paneKey")?,
            "worktreeId": required_string(input, "worktreeId")?,
            "prompt": string(input, "prompt")?,
            "provider": "codex",
            "detectedAt": event.detected_at,
            "resetsAt": resets_at,
            "resetDescription": reset_description,
            "window": window
        }))
    }

    async fn persist(&self) -> Result<(), RateLimitResumeError> {
        let _guard = self.write_gate.lock().await;
        let schedules = lock(&self.state).clone();
        let mut document = match tokio::fs::read(&self.path).await {
            Ok(bytes) => serde_json::from_slice::<Map<String, Value>>(&bytes)?,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Map::new(),
            Err(error) => return Err(error.into()),
        };
        document.insert(
            "rateLimitResumes".to_owned(),
            serde_json::to_value(schedules)?,
        );
        if let Some(parent) = self.path.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        let temporary = self
            .path
            .with_extension(format!("{}.tmp", std::process::id()));
        tokio::fs::write(&temporary, serde_json::to_vec(&document)?).await?;
        atomic_file_replace::replace_async(&temporary, &self.path).await?;
        Ok(())
    }

    async fn dispatch_due(&self) {
        let Some(connection) = lock(&self.renderer_connection).clone() else {
            return;
        };
        let now = match now_ms() {
            Ok(now) => now,
            Err(_) => return,
        };
        let due = lock(&self.state)
            .iter()
            .filter(|entry| entry.status == "scheduled" && entry.resume_at <= now)
            .cloned()
            .collect::<Vec<_>>();
        for schedule in due {
            if let Ok(body) = serde_json::to_value(schedule) {
                let _ = self
                    .shell
                    .request_web_exact(&connection, "/rateLimitResume/dispatch", body)
                    .await;
            }
        }
    }
}

impl RateLimitResumeWorker {
    pub(crate) async fn shutdown(mut self) {
        if let Some(shutdown) = self.shutdown.take() {
            let _ = shutdown.send(());
        }
        let _ = self.task.await;
    }
}

#[derive(Default)]
struct UsageLimitEvent {
    detected_at: f64,
    resets_at: Option<f64>,
    window: Option<String>,
}

async fn inspect_rollout(
    path: &Path,
    turn_id: &str,
) -> Result<Option<UsageLimitEvent>, RateLimitResumeError> {
    use tokio::io::{AsyncReadExt, AsyncSeekExt};
    let mut file = tokio::fs::File::open(path).await?;
    let size = file.metadata().await?.len();
    let start = size.saturating_sub(ROLLOUT_TAIL_BYTES);
    file.seek(std::io::SeekFrom::Start(start)).await?;
    let mut bytes = Vec::with_capacity((size - start) as usize);
    file.read_to_end(&mut bytes).await?;
    let mut text = String::from_utf8_lossy(&bytes).into_owned();
    if start > 0
        && let Some(offset) = text.find('\n')
    {
        text.drain(..=offset);
    }
    let records = text
        .lines()
        .filter_map(|line| serde_json::from_str::<Value>(line).ok())
        .collect::<Vec<_>>();
    let mut found = None;
    for entry in records.iter().rev() {
        let Some(payload) = entry.get("payload").and_then(Value::as_object) else {
            continue;
        };
        if found.is_none() {
            let kind = payload.get("type").and_then(Value::as_str);
            let matching_turn = field_string(payload, "turn_id", "turnId") == Some(turn_id);
            let limited = payload
                .get("error")
                .and_then(Value::as_object)
                .and_then(|error| field_string(error, "codex_error_info", "codexErrorInfo"))
                == Some("usage_limit_exceeded");
            if matches!(kind, Some("task_complete" | "turn_complete")) && matching_turn && limited {
                let detected_at = entry
                    .get("timestamp")
                    .and_then(Value::as_str)
                    .and_then(|value| chrono::DateTime::parse_from_rfc3339(value).ok())
                    .map_or(now_ms()?, |value| value.timestamp_millis() as f64);
                found = Some(UsageLimitEvent {
                    detected_at,
                    ..UsageLimitEvent::default()
                });
            }
            continue;
        }
        if field_string(payload, "type", "type") == Some("task_started")
            && field_string(payload, "turn_id", "turnId") == Some(turn_id)
        {
            break;
        }
        if let Some(reset) = exhausted_reset(payload) {
            let event = found
                .as_mut()
                .ok_or(RateLimitResumeError::Input("rollout"))?;
            if event.resets_at.is_none() || reset.0 == "weekly" {
                event.window = Some(reset.0);
                event.resets_at = Some(reset.1);
            }
        }
    }
    Ok(found)
}

fn exhausted_reset(payload: &Map<String, Value>) -> Option<(String, f64)> {
    if payload.get("type").and_then(Value::as_str) != Some("token_count") {
        return None;
    }
    let limits = payload
        .get("rate_limits")
        .or_else(|| payload.get("rateLimits"))?
        .as_object()?;
    let mut session = None;
    for value in [limits.get("primary"), limits.get("secondary")]
        .into_iter()
        .flatten()
    {
        let Some(window) = value.as_object() else {
            continue;
        };
        let used = field_number(window, "used_percent", "usedPercent").unwrap_or(0.0);
        let Some(reset) = field_number(window, "resets_at", "resetsAt") else {
            continue;
        };
        let Some(minutes) = field_number(window, "window_minutes", "windowDurationMins") else {
            continue;
        };
        if used < 100.0 {
            continue;
        }
        if minutes == 10_080.0 {
            return Some(("weekly".to_owned(), reset * 1_000.0));
        }
        if minutes == 300.0 {
            session = Some(("session".to_owned(), reset * 1_000.0));
        }
    }
    session
}

async fn resolve_rollout_path(
    session_id: &str,
    transcript: Option<&str>,
) -> Result<Option<PathBuf>, RateLimitResumeError> {
    let home =
        crate::paths::resolve_local_home_path().ok_or(RateLimitResumeError::Input("home"))?;
    let root = std::env::var_os("CODEX_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| home.join(".codex"))
        .join("sessions");
    if let Some(candidate) = transcript.map(str::trim).filter(|value| !value.is_empty()) {
        let candidate = PathBuf::from(candidate);
        if candidate.extension().and_then(|value| value.to_str()) == Some("jsonl") {
            let canonical_root = match tokio::fs::canonicalize(&root).await {
                Ok(path) => path,
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
                Err(error) => return Err(error.into()),
            };
            let canonical_candidate = match tokio::fs::canonicalize(&candidate).await {
                Ok(path) => path,
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
                Err(error) => return Err(error.into()),
            };
            if canonical_candidate.starts_with(canonical_root)
                && tokio::fs::metadata(&canonical_candidate).await?.is_file()
            {
                return Ok(Some(canonical_candidate));
            }
        }
    }
    let mut pending = vec![root];
    let suffix = format!("-{session_id}.jsonl");
    while let Some(directory) = pending.pop() {
        let mut entries = match tokio::fs::read_dir(directory).await {
            Ok(entries) => entries,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(error) => return Err(error.into()),
        };
        while let Some(entry) = entries.next_entry().await? {
            let kind = entry.file_type().await?;
            if kind.is_symlink() {
                continue;
            }
            if kind.is_dir() {
                pending.push(entry.path());
                continue;
            }
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if name == format!("{session_id}.jsonl") || name.ends_with(&suffix) {
                return Ok(Some(entry.path()));
            }
        }
    }
    Ok(None)
}

fn exhausted_window(limits: &Value, now: f64) -> Option<(String, f64, Option<String>)> {
    for (key, name) in [("weekly", "weekly"), ("session", "session")] {
        let Some(window) = limits.get(key).and_then(Value::as_object) else {
            continue;
        };
        let Some(used) = window.get("usedPercent").and_then(Value::as_f64) else {
            continue;
        };
        let Some(resets_at) = window.get("resetsAt").and_then(Value::as_f64) else {
            continue;
        };
        if used >= 100.0 && resets_at > now {
            return Some((
                name.to_owned(),
                resets_at,
                window
                    .get("resetDescription")
                    .and_then(Value::as_str)
                    .map(str::to_owned),
            ));
        }
    }
    None
}

async fn read_schedules(path: &Path) -> Result<Vec<RateLimitResumeSchedule>, RateLimitResumeError> {
    let bytes = match tokio::fs::read(path).await {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(error.into()),
    };
    let document: Value = serde_json::from_slice(&bytes)?;
    Ok(document
        .get("rateLimitResumes")
        .cloned()
        .and_then(|value| serde_json::from_value::<Vec<RateLimitResumeSchedule>>(value).ok())
        .unwrap_or_default()
        .into_iter()
        .filter(valid_persisted_schedule)
        .collect())
}

fn valid_persisted_schedule(schedule: &RateLimitResumeSchedule) -> bool {
    !schedule.agent.is_empty()
        && !schedule.pty_id.is_empty()
        && !schedule.tab_id.is_empty()
        && !schedule.pane_key.is_empty()
        && !schedule.worktree_id.is_empty()
        && schedule.detected_at.is_finite()
        && schedule.resets_at.is_none_or(f64::is_finite)
        && schedule.resume_at.is_finite()
        && schedule.created_at.is_finite()
        && schedule.fired_at.is_none_or(f64::is_finite)
        && schedule.provider.as_deref().is_none_or(|provider| {
            matches!(
                provider,
                "claude"
                    | "codex"
                    | "cursor"
                    | "gemini"
                    | "opencodeGo"
                    | "kimi"
                    | "antigravity"
                    | "minimax"
                    | "grok"
            )
        })
        && schedule
            .window
            .as_deref()
            .is_none_or(|window| matches!(window, "session" | "weekly"))
        && matches!(
            schedule.status.as_str(),
            "scheduled" | "fired" | "cancelled" | "stale" | "failed"
        )
}

fn prune(schedules: Vec<RateLimitResumeSchedule>, now: f64) -> Vec<RateLimitResumeSchedule> {
    schedules
        .into_iter()
        .filter(|entry| {
            !is_final(&entry.status) || now - entry.created_at < HISTORY_MAX_AGE_MS as f64
        })
        .collect()
}

fn is_final(status: &str) -> bool {
    matches!(status, "fired" | "cancelled" | "stale" | "failed")
}
fn finite_number(value: Option<&Value>) -> Option<f64> {
    value
        .and_then(Value::as_f64)
        .filter(|value| value.is_finite())
}
fn required_finite(
    object: &Map<String, Value>,
    key: &'static str,
) -> Result<f64, RateLimitResumeError> {
    finite_number(object.get(key)).ok_or(RateLimitResumeError::Input(key))
}
fn required_string(
    object: &Map<String, Value>,
    key: &'static str,
) -> Result<String, RateLimitResumeError> {
    let value = string(object, key)?;
    if value.is_empty() {
        Err(RateLimitResumeError::Input(key))
    } else {
        Ok(value)
    }
}
fn string(object: &Map<String, Value>, key: &'static str) -> Result<String, RateLimitResumeError> {
    object
        .get(key)
        .and_then(Value::as_str)
        .map(str::to_owned)
        .ok_or(RateLimitResumeError::Input(key))
}
fn nullable_string(
    object: &Map<String, Value>,
    key: &'static str,
) -> Result<Option<String>, RateLimitResumeError> {
    match object.get(key) {
        Some(Value::Null) => Ok(None),
        Some(Value::String(value)) => Ok(Some(value.clone())),
        _ => Err(RateLimitResumeError::Input(key)),
    }
}
fn nullable_member(
    object: &Map<String, Value>,
    key: &'static str,
    members: &[&str],
) -> Result<Option<String>, RateLimitResumeError> {
    let value = nullable_string(object, key)?;
    if value
        .as_deref()
        .is_none_or(|value| members.contains(&value))
    {
        Ok(value)
    } else {
        Err(RateLimitResumeError::Input(key))
    }
}
fn field_string<'a>(object: &'a Map<String, Value>, snake: &str, camel: &str) -> Option<&'a str> {
    object
        .get(snake)
        .or_else(|| object.get(camel))
        .and_then(Value::as_str)
}
fn field_number(object: &Map<String, Value>, snake: &str, camel: &str) -> Option<f64> {
    object
        .get(snake)
        .or_else(|| object.get(camel))
        .and_then(Value::as_f64)
        .filter(|value| value.is_finite())
}
fn now_ms() -> Result<f64, std::time::SystemTimeError> {
    Ok(SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs_f64() * 1_000.0)
}

fn random_uuid() -> Result<String, getrandom::Error> {
    let mut bytes = [0_u8; 16];
    getrandom::fill(&mut bytes)?;
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    Ok(format!(
        "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        bytes[0],
        bytes[1],
        bytes[2],
        bytes[3],
        bytes[4],
        bytes[5],
        bytes[6],
        bytes[7],
        bytes[8],
        bytes[9],
        bytes[10],
        bytes[11],
        bytes[12],
        bytes[13],
        bytes[14],
        bytes[15]
    ))
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

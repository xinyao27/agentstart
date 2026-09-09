use super::token_delta::{self, Delta, Tokens};
use serde_json::Value;

pub(super) struct Event {
    pub session_id: String,
    pub timestamp: String,
    pub event_key: String,
    pub turn_id: Option<String>,
    pub model: Option<String>,
    pub cwd: Option<String>,
    pub tokens: Tokens,
}

pub(super) struct Parser {
    session_id: String,
    session_cwd: Option<String>,
    cwd: Option<String>,
    model: Option<String>,
    turn_id: Option<String>,
    previous: Option<Tokens>,
    saw_meta: bool,
    fork_anchor: Option<i64>,
    baseline_pending: bool,
}
impl Parser {
    pub fn new(session_id: String, skip_bytes: u64) -> Self {
        Self {
            session_id,
            session_cwd: None,
            cwd: None,
            model: None,
            turn_id: None,
            previous: None,
            saw_meta: false,
            fork_anchor: None,
            baseline_pending: skip_bytes > 0,
        }
    }
    pub fn parse(&mut self, line: &str) -> Option<Event> {
        let value: Value = serde_json::from_str(line).ok()?;
        let payload = value.get("payload")?;
        match value.get("type")?.as_str()? {
            "session_meta" => {
                if self.saw_meta {
                    return None;
                }
                self.saw_meta = true;
                if let Some(id) = string(payload.get("id")) {
                    self.session_id = id;
                }
                self.session_cwd = string(payload.get("cwd"));
                self.turn_id = None;
                if self.cwd.is_none() {
                    self.cwd = self.session_cwd.clone();
                }
                if string(payload.get("forked_from_id")).is_some()
                    || string(payload.pointer("/source/subagent/thread_spawn/parent_thread_id"))
                        .is_some()
                {
                    self.fork_anchor = timestamp(value.get("timestamp"));
                }
                return None;
            }
            "turn_context" => {
                self.cwd = string(payload.get("cwd"))
                    .or_else(|| self.cwd.clone())
                    .or_else(|| self.session_cwd.clone());
                self.model = model(payload).or_else(|| self.model.clone());
                self.turn_id = turn_id(payload).or_else(|| self.turn_id.clone());
                return None;
            }
            "event_msg" if payload.get("type").and_then(Value::as_str) == Some("task_started") => {
                self.turn_id = turn_id(payload).or_else(|| self.turn_id.clone());
                return None;
            }
            "event_msg" if payload.get("type").and_then(Value::as_str) == Some("token_count") => {}
            _ => return None,
        }
        let timestamp_text = value.get("timestamp")?.as_str()?;
        let info = payload.get("info")?;
        info.as_object()?;
        let total = info.get("total_token_usage").and_then(Tokens::read);
        let last = info.get("last_token_usage").and_then(Tokens::read);
        if self.baseline_pending {
            self.baseline_pending = false;
            if total.is_some() && last.is_none() && self.previous.is_none() {
                self.previous = total;
                return None;
            }
        }
        let (mut tokens, next) = match token_delta::resolve(total, last, self.previous)? {
            Delta::Baseline(total) => {
                self.previous = Some(total);
                return None;
            }
            Delta::Event { tokens, next } => (tokens, next),
        };
        tokens.cached_input_tokens = tokens.cached_input_tokens.min(tokens.input_tokens);
        if let Some(anchor) = self.fork_anchor {
            if let Some(time) = timestamp(value.get("timestamp"))
                && time.saturating_sub(anchor) < 1000
            {
                self.fork_anchor = Some(time);
                self.previous = next;
                return None;
            }
            self.fork_anchor = None;
        }
        if tokens == Tokens::default() {
            return None;
        }
        self.previous = next;
        Some(Event {
            session_id: self.session_id.clone(),
            timestamp: timestamp_text.to_owned(),
            event_key: format!(
                "{}|{}|{}",
                timestamp_text,
                total.map(Tokens::tuple).unwrap_or_default(),
                last.map(Tokens::tuple).unwrap_or_default()
            ),
            model: model(payload).or_else(|| self.model.clone()),
            turn_id: turn_id(payload).or_else(|| self.turn_id.clone()),
            cwd: self.cwd.clone().or_else(|| self.session_cwd.clone()),
            tokens,
        })
    }
}
fn timestamp(value: Option<&Value>) -> Option<i64> {
    chrono::DateTime::parse_from_rfc3339(value?.as_str()?)
        .ok()
        .map(|v| v.timestamp_millis())
}
fn string(value: Option<&Value>) -> Option<String> {
    value?
        .as_str()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_owned)
}
fn turn_id(value: &Value) -> Option<String> {
    string(value.get("turn_id"))
        .or_else(|| string(value.get("turnId")))
        .or_else(|| string(value.get("id")))
        .or_else(|| value.get("info").and_then(turn_id))
}
fn model(value: &Value) -> Option<String> {
    string(value.get("model"))
        .or_else(|| string(value.get("model_name")))
        .or_else(|| {
            value.get("info").and_then(|info| {
                string(info.get("model"))
                    .or_else(|| string(info.get("model_name")))
                    .or_else(|| string(info.pointer("/metadata/model")))
            })
        })
        .or_else(|| string(value.pointer("/metadata/model")))
}

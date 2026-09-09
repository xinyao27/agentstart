use rusqlite::{Connection, OpenFlags};
use serde_json::Value;
use std::collections::{BTreeMap, VecDeque};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

#[derive(Default, Clone)]
struct DatabaseState {
    size: u64,
    mtime: f64,
    last_row: i64,
    models: BTreeMap<String, Option<String>>,
    pending: BTreeMap<String, String>,
    pending_order: VecDeque<String>,
}
pub(super) struct Snapshot {
    pub models: BTreeMap<String, Option<String>>,
    pub fingerprint: String,
}
pub(super) fn load(homes: &[PathBuf]) -> Snapshot {
    static CACHE: OnceLock<Mutex<BTreeMap<PathBuf, DatabaseState>>> = OnceLock::new();
    let mut cache = CACHE
        .get_or_init(Default::default)
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    let mut models = BTreeMap::<String, Option<String>>::new();
    for home in homes {
        for path in [
            home.join("logs_2.sqlite"),
            home.join("sqlite").join("logs_2.sqlite"),
        ] {
            let Ok((mtime, size)) = super::discovery::stat(&path) else {
                continue;
            };
            let previous = cache.get(&path).cloned().unwrap_or_default();
            let mut state = if size >= previous.size {
                previous.clone()
            } else {
                DatabaseState::default()
            };
            if state.size != size || state.mtime != mtime {
                match scan(&path, &mut state) {
                    Ok(()) => {
                        state.size = size;
                        state.mtime = mtime;
                        cache.insert(path, state.clone());
                    }
                    Err(_) => state = previous,
                }
            }
            for (turn, model) in state.models {
                let current = models.entry(turn).or_default();
                if model.is_some() {
                    *current = model;
                }
            }
        }
    }
    let fingerprint = serde_json::to_string(&models.iter().collect::<Vec<_>>()).unwrap_or_default();
    Snapshot {
        models,
        fingerprint,
    }
}
fn scan(path: &Path, state: &mut DatabaseState) -> rusqlite::Result<()> {
    let db = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )?;
    db.busy_timeout(std::time::Duration::from_millis(250))?;
    db.execute_batch("PRAGMA query_only=ON")?;
    let mut statement=db.prepare("SELECT rowid,feedback_log_body FROM logs WHERE rowid>? AND
        (feedback_log_body LIKE '%websocket request:%' OR feedback_log_body LIKE '%websocket event:%'
        OR feedback_log_body LIKE '%service_tier: Some(Some(\"priority\"))%') ORDER BY rowid")?;
    let mut rows = statement.query([state.last_row])?;
    while let Some(row) = rows.next()? {
        let id: i64 = row.get(0)?;
        let body: String = row.get(1)?;
        state.last_row = state.last_row.max(id);
        if let Some((turn, model)) = completed(&body) {
            if let Some(current) = state.models.get_mut(&turn) {
                *current = Some(model);
            } else {
                if !state.pending.contains_key(&turn) {
                    state.pending_order.push_back(turn.clone());
                }
                state.pending.insert(turn, model);
                while state.pending.len() > 4096 {
                    if let Some(key) = state.pending_order.pop_front() {
                        state.pending.remove(&key);
                    }
                }
            }
        } else if let Some((turn, model)) = priority(&body) {
            let model = state.pending.remove(&turn).or(model);
            state.pending_order.retain(|key| key != &turn);
            state.models.insert(turn, model);
        }
    }
    Ok(())
}
fn priority(body: &str) -> Option<(String, Option<String>)> {
    if let Some((prefix, json)) = body.split_once("websocket request:") {
        let request: Value = serde_json::from_str(json.trim()).ok()?;
        if request.get("type")?.as_str()? != "response.create"
            || request.get("service_tier")?.as_str()? != "priority"
        {
            return None;
        }
        let turn = named(prefix, "turn.id")
            .or_else(|| named(prefix, "turn_id"))
            .or_else(|| string(request.get("turn_id")))
            .or_else(|| string(request.get("turnId")))?;
        return Some((turn, string(request.get("model"))));
    }
    if !body.contains("service_tier: Some(Some(\"priority\"))") {
        return None;
    }
    let tail = body.split_once("Submission sub=Submission {")?.1;
    let turn = tail.split_once("id: \"")?.1.split_once('"')?.0.trim();
    (!turn.is_empty()).then(|| (turn.to_owned(), None))
}
fn completed(body: &str) -> Option<(String, String)> {
    let (prefix, json) = body.split_once("websocket event:")?;
    let event: Value = serde_json::from_str(json.trim()).ok()?;
    if event.get("type")?.as_str()? != "response.completed" {
        return None;
    }
    Some((
        named(prefix, "turn.id").or_else(|| named(prefix, "turn_id"))?,
        string(event.pointer("/response/model"))?,
    ))
}
fn named(text: &str, name: &str) -> Option<String> {
    let marker = format!("{name}=");
    let tail = text.split_once(&marker)?.1;
    let value = tail
        .split(|ch: char| ch.is_whitespace() || ",])}:".contains(ch))
        .next()?
        .trim();
    (!value.is_empty()).then(|| value.to_owned())
}
fn string(value: Option<&Value>) -> Option<String> {
    value?
        .as_str()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_owned)
}

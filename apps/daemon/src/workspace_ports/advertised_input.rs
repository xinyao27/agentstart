use std::collections::{HashMap, VecDeque};
use std::sync::{Mutex, MutexGuard, OnceLock};

use regex::Regex;

const MAX_PENDING_ENTRIES: usize = 32;
const PENDING_PRE_BIND_LIMIT: usize = 16 * 1_024;
const PER_PTY_BUFFER_LIMIT: usize = 4_096;
const URL_CANDIDATE_LIMIT: usize = 2_048;

#[derive(Default)]
pub(super) struct AdvertisedInput {
    state: Mutex<InputState>,
}

#[derive(Default)]
struct InputState {
    bindings: HashMap<String, String>,
    buffers: HashMap<String, PtyBuffer>,
    pending: HashMap<String, String>,
    pending_order: VecDeque<String>,
}

#[derive(Default)]
struct PtyBuffer {
    raw: String,
}

pub(super) struct ObservedUrl {
    pub(super) url: String,
    pub(super) worktree_id: String,
}

impl AdvertisedInput {
    pub(super) fn bind(&self, pty_id: &str, worktree_id: &str) -> Vec<ObservedUrl> {
        let mut state = lock(&self.state);
        let pending = state.pending.remove(pty_id);
        state.pending_order.retain(|candidate| candidate != pty_id);
        if state
            .bindings
            .get(pty_id)
            .is_some_and(|bound| bound == worktree_id)
            && pending.is_none()
        {
            return Vec::new();
        }
        state
            .bindings
            .insert(pty_id.to_owned(), worktree_id.to_owned());
        pending.map_or_else(Vec::new, |chunk| state.ingest_bound(pty_id, chunk))
    }

    pub(super) fn ingest(&self, pty_id: &str, chunk: &str) -> Vec<ObservedUrl> {
        if chunk.is_empty() {
            return Vec::new();
        }
        let mut state = lock(&self.state);
        if !state.bindings.contains_key(pty_id) {
            state.buffer_pending(pty_id, chunk);
            return Vec::new();
        }
        state.ingest_bound(pty_id, chunk.to_owned())
    }

    pub(super) fn finish(&self, pty_id: &str) -> Vec<ObservedUrl> {
        let mut state = lock(&self.state);
        let Some(worktree_id) = state.bindings.get(pty_id).cloned() else {
            return Vec::new();
        };
        let finalized = state
            .buffers
            .get_mut(pty_id)
            .map(PtyBuffer::finish)
            .unwrap_or_default();
        extract_url_candidates(&finalized)
            .into_iter()
            .map(|url| ObservedUrl {
                url,
                worktree_id: worktree_id.clone(),
            })
            .collect()
    }

    pub(super) fn unbind(&self, pty_id: &str) {
        let mut state = lock(&self.state);
        state.bindings.remove(pty_id);
        state.buffers.remove(pty_id);
        state.pending.remove(pty_id);
        state.pending_order.retain(|candidate| candidate != pty_id);
    }

    pub(super) fn forget_worktree(&self, worktree_id: &str) {
        let mut state = lock(&self.state);
        let pty_ids = state
            .bindings
            .iter()
            .filter(|(_, bound)| *bound == worktree_id)
            .map(|(pty_id, _)| pty_id.clone())
            .collect::<Vec<_>>();
        for pty_id in pty_ids {
            state.bindings.remove(&pty_id);
            state.buffers.remove(&pty_id);
        }
    }

    pub(super) fn clear(&self) {
        *lock(&self.state) = InputState::default();
    }
}

impl InputState {
    fn ingest_bound(&mut self, pty_id: &str, chunk: String) -> Vec<ObservedUrl> {
        let Some(worktree_id) = self.bindings.get(pty_id).cloned() else {
            return Vec::new();
        };
        let finalized = self
            .buffers
            .entry(pty_id.to_owned())
            .or_default()
            .ingest(chunk);
        extract_url_candidates(&finalized)
            .into_iter()
            .map(|url| ObservedUrl {
                url,
                worktree_id: worktree_id.clone(),
            })
            .collect()
    }

    fn buffer_pending(&mut self, pty_id: &str, chunk: &str) {
        let merged = format!(
            "{}{}",
            self.pending.get(pty_id).map_or("", String::as_str),
            chunk
        );
        self.pending
            .insert(pty_id.to_owned(), tail(&merged, PENDING_PRE_BIND_LIMIT));
        self.pending_order.retain(|candidate| candidate != pty_id);
        self.pending_order.push_back(pty_id.to_owned());
        while self.pending.len() > MAX_PENDING_ENTRIES {
            let Some(oldest) = self.pending_order.pop_front() else {
                break;
            };
            self.pending.remove(&oldest);
        }
    }
}

impl PtyBuffer {
    fn ingest(&mut self, chunk: String) -> String {
        let chunk_has_line_break = chunk.contains(['\n', '\r']);
        self.raw.push_str(&chunk);
        self.raw = tail(&self.raw, PER_PTY_BUFFER_LIMIT);
        if !chunk_has_line_break {
            return String::new();
        }
        let Some(last_break) = self.raw.rfind(['\n', '\r']) else {
            return String::new();
        };
        let remaining = self.raw.split_off(last_break + 1);
        let finalized = std::mem::replace(&mut self.raw, remaining);
        strip_terminal_controls(&finalized)
    }

    fn finish(&mut self) -> String {
        strip_terminal_controls(&std::mem::take(&mut self.raw))
    }
}

fn extract_url_candidates(cleaned: &str) -> Vec<String> {
    static URL_PATTERN: OnceLock<Regex> = OnceLock::new();
    let pattern = URL_PATTERN.get_or_init(|| {
        Regex::new(r#"(?i)\bhttps?://[^\s<>\"'`]+"#).expect("URL candidate pattern is valid")
    });
    pattern
        .find_iter(cleaned)
        .filter_map(|candidate| {
            if candidate.as_str().len() > URL_CANDIDATE_LIMIT {
                return None;
            }
            let candidate = candidate.as_str().trim_end_matches([
                '.', ',', ';', ':', '!', '?', ')', ']', '}', '>', '\'', '"', '`',
            ]);
            (!candidate.is_empty()).then(|| candidate.to_owned())
        })
        .collect()
}

fn strip_terminal_controls(text: &str) -> String {
    static PATTERNS: OnceLock<[Regex; 4]> = OnceLock::new();
    let [osc, cursor_move, csi, single_escape] = PATTERNS.get_or_init(|| {
        [
            Regex::new("\\x1b\\][^\\x07\\x1b]*(?:\\x07|\\x1b\\\\)").expect("OSC pattern is valid"),
            Regex::new("\\x1b\\[[0-?]*[ -/]*[CDGHf]").expect("cursor pattern is valid"),
            Regex::new("\\x1b\\[[0-?]*[ -/]*[@-~]").expect("CSI pattern is valid"),
            Regex::new("\\x1b[@-_]").expect("escape pattern is valid"),
        ]
    });
    let normalized = text.replace("\r\n", "\n").replace('\r', "\n");
    let stripped = osc.replace_all(&normalized, "");
    let stripped = cursor_move.replace_all(&stripped, "[");
    let stripped = csi.replace_all(&stripped, "");
    single_escape
        .replace_all(&stripped, "")
        .chars()
        .filter(|character| {
            let code = u32::from(*character);
            !((code <= 8) || (11..=31).contains(&code) || code == 127)
        })
        .collect()
}

fn tail(value: &str, limit: usize) -> String {
    if value.len() <= limit {
        return value.to_owned();
    }
    let mut start = value.len() - limit;
    while !value.is_char_boundary(start) {
        start += 1;
    }
    value[start..].to_owned()
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

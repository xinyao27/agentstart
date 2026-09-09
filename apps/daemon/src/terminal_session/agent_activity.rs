use std::collections::{HashMap, HashSet, VecDeque};

use crate::account_usage::StatsAuthority;

use super::terminal_title::{AgentStatus, TerminalTitleParser, detect_agent_status};

const MAX_EXITED_PTYS: usize = 1_024;
const MAX_CONTROL_TAIL_BYTES: usize = 4_096;

#[derive(Default)]
pub(super) struct AgentActivity {
    ptys: HashMap<String, PtyActivity>,
    exited: HashSet<String>,
    exit_order: VecDeque<String>,
}

struct PtyActivity {
    title: TerminalTitleParser,
    status: Option<AgentStatus>,
    started_at: Option<i64>,
    meaningful_at: Option<i64>,
    control_tail: Vec<u8>,
}

impl AgentActivity {
    pub(super) fn output(&mut self, stats: &StatsAuthority, pty_id: &str, bytes: &[u8], at: i64) {
        if self.exited.contains(pty_id) {
            return;
        }
        let record = self
            .ptys
            .entry(pty_id.to_owned())
            .or_insert_with(|| PtyActivity {
                title: TerminalTitleParser::new(),
                status: None,
                started_at: None,
                meaningful_at: None,
                control_tail: Vec::new(),
            });
        let mut content = std::mem::take(&mut record.control_tail);
        content.extend_from_slice(bytes);
        let (meaningful, tail) = meaningful_content(&content);
        record.control_tail = tail;
        if record.started_at.is_some() && meaningful {
            record.meaningful_at = Some(at);
        }
        let Some(status) = record
            .title
            .observe(bytes)
            .and_then(|title| detect_agent_status(&title))
        else {
            return;
        };
        if record.status.is_none()
            || (record.started_at.is_none()
                && record.status != Some(AgentStatus::Working)
                && status == AgentStatus::Working)
        {
            record.started_at = Some(at);
            record.meaningful_at = meaningful.then_some(at);
            stats.start_agent(pty_id, at);
        } else if record.started_at.is_some()
            && record.status == Some(AgentStatus::Working)
            && status != AgentStatus::Working
        {
            stats.stop_agent(
                pty_id,
                record.meaningful_at.or(record.started_at).unwrap_or(at),
            );
            record.started_at = None;
            record.meaningful_at = None;
        }
        record.status = Some(status);
    }

    pub(super) fn exit(&mut self, stats: &StatsAuthority, pty_id: &str) {
        if let Some(record) = self.ptys.remove(pty_id)
            && let Some(started_at) = record.started_at
        {
            stats.stop_agent(pty_id, record.meaningful_at.unwrap_or(started_at));
        }
        if self.exited.insert(pty_id.to_owned()) {
            self.exit_order.push_back(pty_id.to_owned());
        }
        while self.exit_order.len() > MAX_EXITED_PTYS {
            if let Some(expired) = self.exit_order.pop_front() {
                self.exited.remove(&expired);
            }
        }
    }
}

// Why: ANSI redraws and incomplete control strings must not extend working time.
// Carry only an unfinished final control across chunks, bounded independently of PTY history.
fn meaningful_content(bytes: &[u8]) -> (bool, Vec<u8>) {
    let mut cursor = 0;
    let mut meaningful = false;
    while cursor < bytes.len() {
        if bytes[cursor] == 0x1b {
            let Some(end) = control_end(bytes, cursor) else {
                let mut tail = bytes[cursor..].to_vec();
                if tail.len() > MAX_CONTROL_TAIL_BYTES {
                    let suffix = tail.split_off(tail.len() - (MAX_CONTROL_TAIL_BYTES - 2));
                    tail.truncate(2);
                    tail.extend(suffix);
                }
                return (meaningful, tail);
            };
            cursor = end;
            continue;
        }
        let end = bytes[cursor..]
            .iter()
            .position(|byte| *byte == 0x1b)
            .map_or(bytes.len(), |offset| cursor + offset);
        meaningful |= String::from_utf8_lossy(&bytes[cursor..end])
            .chars()
            .any(|character| character > ' ' && !('\u{7f}'..='\u{9f}').contains(&character));
        cursor = end;
    }
    (meaningful, Vec::new())
}

fn control_end(bytes: &[u8], start: usize) -> Option<usize> {
    let introducer = *bytes.get(start + 1)?;
    match introducer {
        b'[' => bytes[start + 2..]
            .iter()
            .position(|byte| (0x40..=0x7e).contains(byte))
            .map(|offset| start + 3 + offset),
        b']' | b'P' | b'X' | b'^' | b'_' => {
            let mut index = start + 2;
            while index < bytes.len() {
                if introducer == b']' && bytes[index] == 0x07 {
                    return Some(index + 1);
                }
                if bytes[index] == 0x1b && bytes.get(index + 1) == Some(&b'\\') {
                    return Some(index + 2);
                }
                index += 1;
            }
            None
        }
        _ => Some(start + 2),
    }
}

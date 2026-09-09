use super::model::TerminalReadResult;
use std::collections::VecDeque;

const MAX_LINES: usize = 2_000;
const MAX_BYTES: usize = 256 * 1024;

#[derive(Default)]
pub(super) struct ReadHistory {
    lines: VecDeque<(u64, u64, String)>,
    latest: u64,
    bytes: usize,
    discarded: bool,
}

impl ReadHistory {
    pub(super) fn complete(&mut self, row: u64, text: String) {
        if let Some((_, _, previous)) = self.lines.iter_mut().rev().find(|(id, _, _)| *id == row) {
            self.bytes = self.bytes.saturating_sub(previous.len());
            *previous = text;
            self.bytes += previous.len();
        } else if self.lines.back().is_none_or(|(id, _, _)| row > *id) {
            self.latest = self.latest.saturating_add(1);
            self.bytes += text.len();
            self.lines.push_back((row, self.latest, text));
        }
        while self.lines.len() > MAX_LINES || self.bytes > MAX_BYTES {
            let Some((_, _, text)) = self.lines.pop_front() else {
                break;
            };
            self.bytes = self.bytes.saturating_sub(text.len());
            self.discarded = true;
        }
    }

    pub(super) fn clear(&mut self) {
        self.lines.clear();
        self.bytes = 0;
        self.discarded = true;
    }

    pub(super) fn read(
        &self,
        handle: String,
        status: &'static str,
        cursor: Option<u64>,
        limit: Option<usize>,
        visible: &str,
    ) -> TerminalReadResult {
        let oldest = self
            .lines
            .front()
            .map_or(self.latest, |(_, sequence, _)| sequence.saturating_sub(1));
        let limit = limit
            .unwrap_or(if cursor.is_some() { MAX_LINES } else { 120 })
            .clamp(1, MAX_LINES);
        let (mut tail, next, limited, truncated) = if let Some(cursor) = cursor {
            let start = cursor.max(oldest).min(self.latest);
            let entries = self
                .lines
                .iter()
                .filter(|(_, sequence, _)| *sequence > start)
                .take(limit)
                .collect::<Vec<_>>();
            let next = entries.last().map_or(start, |(_, sequence, _)| *sequence);
            (
                entries
                    .iter()
                    .map(|(_, _, text)| text.clone())
                    .collect::<Vec<_>>(),
                next,
                next < self.latest,
                cursor < oldest,
            )
        } else {
            let all = if visible.is_empty() {
                Vec::new()
            } else {
                visible
                    .trim_end_matches('\n')
                    .split('\n')
                    .collect::<Vec<_>>()
            };
            (
                all.iter()
                    .skip(all.len().saturating_sub(limit))
                    .map(|line| (*line).to_owned())
                    .collect(),
                self.latest,
                all.len() > limit,
                self.discarded,
            )
        };
        let mut bytes = tail.iter().map(String::len).sum::<usize>();
        let mut byte_limited = false;
        if cursor.is_none() {
            while tail.len() > 1 && bytes > 32 * 1024 {
                bytes -= tail.remove(0).len();
                byte_limited = true;
            }
            if let Some(line) = tail.first_mut()
                && line.len() > 32 * 1024
            {
                let mut start = line.len() - 32 * 1024;
                while !line.is_char_boundary(start) {
                    start += 1
                }
                line.drain(..start);
                byte_limited = true;
            }
        }
        TerminalReadResult {
            handle,
            status,
            latest_cursor: self.latest.to_string(),
            oldest_cursor: oldest.to_string(),
            next_cursor: next.to_string(),
            returned_line_count: tail.len(),
            tail,
            limited: limited || byte_limited,
            truncated,
        }
    }
}

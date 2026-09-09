use std::collections::VecDeque;

use super::tail_control;
use super::tail_redraw::{self, RedrawCursor};

const MAX_READ_LIMIT: usize = 2_000;
const MAX_TAIL_CHARS: usize = 256 * 1_024;
const MAX_PARTIAL_CHARS: usize = 4_000;

pub(super) struct TerminalTail {
    completed: VecDeque<String>,
    completed_count: u64,
    pending_ansi: String,
    partial: String,
    redraw_cursor: Option<RedrawCursor>,
    retained_chars: usize,
    truncated: bool,
}

impl TerminalTail {
    pub(super) fn new() -> Self {
        Self {
            completed: VecDeque::new(),
            completed_count: 0,
            pending_ansi: String::new(),
            partial: String::new(),
            redraw_cursor: None,
            retained_chars: 0,
            truncated: false,
        }
    }

    pub(super) fn append(&mut self, chunk: &str) {
        let (normalized, pending_ansi) = tail_control::normalize(chunk, &self.pending_ansi);
        self.pending_ansi = pending_ansi;
        if normalized.is_empty() {
            return;
        }
        if self.redraw_cursor.is_some() || tail_control::contains_vertical(&normalized) {
            self.append_redraw(&normalized);
        } else {
            self.append_single_line(&normalized);
        }
    }

    pub(super) fn clear(&mut self) {
        *self = Self::new();
    }

    pub(super) fn preview(&self) -> String {
        let mut value = Vec::new();
        if !self.partial.trim().is_empty() {
            value.push(self.partial.trim().to_owned());
        }
        for line in self.completed.iter().rev() {
            if value.len() >= 6 {
                break;
            }
            if !line.trim().is_empty() {
                value.push(line.trim().to_owned());
            }
        }
        value.reverse();
        trailing_utf8(&value.join("\n"), 300).to_owned()
    }

    pub(super) fn snapshot(&self) -> String {
        let mut value = self
            .completed
            .iter()
            .cloned()
            .collect::<Vec<_>>()
            .join("\n");
        if !self.partial.is_empty() {
            if !value.is_empty() {
                value.push('\n');
            }
            value.push_str(&self.partial);
        }
        value
    }

    fn append_single_line(&mut self, normalized: &str) {
        let previous_was_capped = self.partial.chars().count() > MAX_PARTIAL_CHARS;
        let mut combined = trailing_chars(&self.partial, MAX_PARTIAL_CHARS).to_owned();
        combined.push_str(normalized);
        let mut segments = combined.split('\n').collect::<Vec<_>>();
        let partial = segments.pop().unwrap_or_default();
        let complete_count = segments.len();
        let retained_start = complete_count.saturating_sub(MAX_READ_LIMIT);
        let mut retained = segments[retained_start..]
            .iter()
            .rev()
            .scan(0, |characters, segment| {
                let line = tail_control::apply_line(segment).text;
                *characters += line.len();
                (*characters <= MAX_TAIL_CHARS + line.len()).then_some(line)
            })
            .collect::<Vec<_>>();
        retained.reverse();
        if retained_start > 0 {
            self.completed.clear();
            self.truncated = true;
        }
        self.completed.extend(retained);
        let partial_control = tail_control::apply_line(partial);
        let next_partial = partial_control.text.trim_end_matches([' ', '\t']);
        self.partial = trailing_chars(next_partial, MAX_PARTIAL_CHARS).to_owned();
        self.redraw_cursor = (partial_control.had_control
            && partial_control.cursor != next_partial.chars().count())
        .then_some(RedrawCursor {
            column: partial_control.cursor,
            row_from_end: 0,
        });
        self.completed_count = self.completed_count.saturating_add(complete_count as u64);
        self.truncated |= previous_was_capped
            || retained_start > 0
            || next_partial.chars().count() > MAX_PARTIAL_CHARS;
        self.recount_and_trim();
    }

    fn append_redraw(&mut self, normalized: &str) {
        let previous = self.completed.iter().cloned().collect::<Vec<_>>();
        let result = tail_redraw::append(&previous, &self.partial, normalized, self.redraw_cursor);
        self.completed = result.lines.into();
        self.completed_count = self
            .completed_count
            .saturating_add(result.new_complete_lines);
        self.partial = result.partial;
        self.redraw_cursor = result.cursor;
        self.truncated |= result.truncated;
        self.recount_and_trim();
    }

    fn recount_and_trim(&mut self) {
        self.retained_chars = self.completed.iter().map(String::len).sum();
        while self.completed.len() > MAX_READ_LIMIT || self.retained_chars > MAX_TAIL_CHARS {
            let Some(line) = self.completed.pop_front() else {
                break;
            };
            self.retained_chars = self.retained_chars.saturating_sub(line.len());
            self.truncated = true;
        }
    }
}

fn trailing_utf8(value: &str, maximum: usize) -> &str {
    if value.len() <= maximum {
        return value;
    }
    let mut start = value.len() - maximum;
    while !value.is_char_boundary(start) {
        start += 1;
    }
    &value[start..]
}

fn trailing_chars(value: &str, maximum: usize) -> &str {
    value
        .char_indices()
        .rev()
        .nth(maximum)
        .map_or(value, |(index, _)| &value[index..])
}

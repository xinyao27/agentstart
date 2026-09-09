use super::tail_control;

const MAX_LINES: usize = 2_000;
const MAX_CHARS: usize = 256 * 1_024;
const MAX_PARTIAL_CHARS: usize = 4_000;
const SAFETY_ROWS: usize = 8;

#[derive(Clone, Copy)]
pub(super) struct RedrawCursor {
    pub(super) column: usize,
    pub(super) row_from_end: usize,
}

pub(super) struct RedrawResult {
    pub(super) cursor: Option<RedrawCursor>,
    pub(super) lines: Vec<String>,
    pub(super) new_complete_lines: u64,
    pub(super) partial: String,
    pub(super) truncated: bool,
}

struct Row {
    completed: bool,
    text: Vec<char>,
}

pub(super) fn append(
    previous_lines: &[String],
    previous_partial: &str,
    chunk: &str,
    previous_cursor: Option<RedrawCursor>,
) -> RedrawResult {
    let window_rows = upward_reach(chunk, previous_cursor) + SAFETY_ROWS;
    if window_rows >= previous_lines.len() {
        return append_window(previous_lines, previous_partial, chunk, previous_cursor);
    }
    let prefix_len = previous_lines.len() - window_rows;
    let mut result = append_window(
        &previous_lines[prefix_len..],
        previous_partial,
        chunk,
        previous_cursor,
    );
    let mut lines = previous_lines[..prefix_len]
        .iter()
        .map(|line| line.trim_end_matches([' ', '\t']).to_owned())
        .collect::<Vec<_>>();
    lines.append(&mut result.lines);
    result.lines = lines;
    trim_result(&mut result);
    result
}

fn append_window(
    previous_lines: &[String],
    previous_partial: &str,
    chunk: &str,
    previous_cursor: Option<RedrawCursor>,
) -> RedrawResult {
    let prior_was_capped = previous_partial.chars().count() > MAX_PARTIAL_CHARS;
    let bounded_partial = trailing_chars(previous_partial, MAX_PARTIAL_CHARS);
    let mut rows = previous_lines
        .iter()
        .map(|line| Row {
            completed: true,
            text: line.chars().collect(),
        })
        .chain(std::iter::once(Row {
            completed: false,
            text: bounded_partial.chars().collect(),
        }))
        .collect::<Vec<_>>();
    let mut cursor_row = previous_cursor.map_or(rows.len() - 1, |cursor| {
        rows.len()
            .saturating_sub(1)
            .saturating_sub(cursor.row_from_end)
    });
    let mut cursor_column =
        previous_cursor.map_or_else(|| bounded_partial.chars().count(), |cursor| cursor.column);
    let mut new_complete_lines = 0_u64;
    let mut truncated = prior_was_capped;
    let mut index = 0;
    while index < chunk.len() {
        let byte = chunk.as_bytes()[index];
        match byte {
            b'\n' => {
                ensure_row(&mut rows, cursor_row);
                rows[cursor_row].completed = true;
                new_complete_lines = new_complete_lines.saturating_add(1);
                cursor_row += 1;
                cursor_column = 0;
                ensure_row(&mut rows, cursor_row);
                trim_rows(&mut rows, &mut cursor_row, &mut truncated);
                index += 1;
            }
            b'\r' => {
                cursor_column = 0;
                index += 1;
            }
            0x08 => {
                cursor_column = cursor_column.saturating_sub(1);
                index += 1;
            }
            0x1b => {
                let Some((end, final_byte, first)) = tail_control::csi_action(chunk, index) else {
                    index += 1;
                    continue;
                };
                match final_byte {
                    b'A' => {
                        cursor_row = cursor_row.saturating_sub(first);
                    }
                    // Why: cursor motion does not erase rows; prompt redraws can return below them.
                    b'B' => {
                        cursor_row = cursor_row
                            .saturating_add(first)
                            .min(rows.len().saturating_sub(1));
                    }
                    b'K' => erase_line(&mut rows, cursor_row, cursor_column, first),
                    b'G' | b'`' => cursor_column = first.saturating_sub(1),
                    b'D' => cursor_column = cursor_column.saturating_sub(first),
                    b'C' => {
                        cursor_column = (cursor_column + first).min(MAX_PARTIAL_CHARS);
                    }
                    _ => {}
                }
                index = end + 1;
            }
            _ => {
                let Some(character) = chunk[index..].chars().next() else {
                    break;
                };
                ensure_row(&mut rows, cursor_row);
                let row = &mut rows[cursor_row];
                row.completed = false;
                if cursor_column > row.text.len() {
                    row.text.resize(cursor_column, ' ');
                }
                if cursor_column == row.text.len() {
                    row.text.push(character);
                } else {
                    row.text[cursor_column] = character;
                }
                cursor_column = (cursor_column + 1).min(MAX_PARTIAL_CHARS);
                index += character.len_utf8();
            }
        }
    }
    finalize(
        rows,
        cursor_row,
        cursor_column,
        truncated,
        new_complete_lines,
    )
}

fn finalize(
    mut rows: Vec<Row>,
    mut cursor_row: usize,
    cursor_column: usize,
    mut truncated: bool,
    new_complete_lines: u64,
) -> RedrawResult {
    rows.iter_mut().for_each(|row| {
        while row
            .text
            .last()
            .is_some_and(|character| matches!(character, ' ' | '\t'))
        {
            row.text.pop();
        }
    });
    if rows.len() > MAX_LINES + 1 {
        let remove = rows.len() - (MAX_LINES + 1);
        rows.drain(..remove);
        cursor_row = cursor_row.saturating_sub(remove);
        truncated = true;
    }
    while rows.len() > 1
        && cursor_row < rows.len() - 1
        && rows
            .last()
            .is_some_and(|row| !row.completed && row.text.is_empty())
    {
        rows.pop();
    }
    let has_partial = rows.last().is_some_and(|row| !row.completed);
    let mut partial = if has_partial {
        rows.pop()
            .map(|row| row.text.into_iter().collect())
            .unwrap_or_default()
    } else {
        String::new()
    };
    let mut lines = rows
        .into_iter()
        .map(|row| row.text.into_iter().collect())
        .collect::<Vec<_>>();
    if partial.chars().count() > MAX_PARTIAL_CHARS {
        partial = trailing_chars(&partial, MAX_PARTIAL_CHARS).to_owned();
        truncated = true;
    }
    let output_rows = lines.len() + 1;
    let default_row = output_rows - 1;
    let default_column = partial.chars().count();
    let cursor =
        (cursor_row != default_row || cursor_column != default_column).then_some(RedrawCursor {
            column: cursor_column.min(MAX_PARTIAL_CHARS),
            row_from_end: default_row.saturating_sub(cursor_row),
        });
    let mut result = RedrawResult {
        cursor,
        lines: std::mem::take(&mut lines),
        new_complete_lines,
        partial,
        truncated,
    };
    trim_result(&mut result);
    result
}

fn trim_result(result: &mut RedrawResult) {
    if result.lines.len() > MAX_LINES {
        let remove = result.lines.len() - MAX_LINES;
        result.lines.drain(..remove);
        result.truncated = true;
    }
    let mut total = result.partial.len() + result.lines.iter().map(String::len).sum::<usize>();
    let mut remove = 0;
    while remove < result.lines.len() && total > MAX_CHARS {
        total = total.saturating_sub(result.lines[remove].len());
        remove += 1;
    }
    if remove > 0 {
        result.lines.drain(..remove);
        result.truncated = true;
    }
}

fn erase_line(rows: &mut Vec<Row>, row_index: usize, column: usize, mode: usize) {
    ensure_row(rows, row_index);
    let row = &mut rows[row_index];
    row.completed = false;
    match mode {
        0 => row.text.truncate(column),
        1 => {
            let count = (column + 1).min(row.text.len());
            row.text
                .iter_mut()
                .take(count)
                .for_each(|character| *character = ' ');
        }
        2 => row.text.clear(),
        _ => {}
    }
}

fn ensure_row(rows: &mut Vec<Row>, index: usize) {
    while rows.len() <= index {
        rows.push(Row {
            completed: false,
            text: Vec::new(),
        });
    }
}

fn trim_rows(rows: &mut Vec<Row>, cursor_row: &mut usize, truncated: &mut bool) {
    if rows.len() <= MAX_LINES + 1 {
        return;
    }
    let remove = rows.len() - (MAX_LINES + 1);
    rows.drain(..remove);
    *cursor_row = cursor_row.saturating_sub(remove);
    *truncated = true;
}

fn upward_reach(chunk: &str, previous: Option<RedrawCursor>) -> usize {
    let mut reach = previous.map_or(0, |cursor| cursor.row_from_end);
    let mut index = 0;
    while let Some(offset) = chunk[index..].find('\x1b') {
        index += offset;
        let Some((end, final_byte, first)) = tail_control::csi_action(chunk, index) else {
            index += 1;
            continue;
        };
        if final_byte == b'A' {
            reach = reach.saturating_add(first);
        }
        index = end + 1;
    }
    reach
}

fn trailing_chars(value: &str, maximum: usize) -> &str {
    value
        .char_indices()
        .rev()
        .nth(maximum)
        .map_or(value, |(index, _)| &value[index..])
}

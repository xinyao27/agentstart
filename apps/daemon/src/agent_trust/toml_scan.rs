#[derive(Clone, Copy, Default)]
pub(super) struct ScanState {
    array_depth: usize,
    mode: StringMode,
}

#[derive(Clone, Copy, Default, Eq, PartialEq)]
enum StringMode {
    Basic,
    Literal,
    #[default]
    None,
}

pub(super) struct Line<'a> {
    pub(super) end: usize,
    pub(super) start: usize,
    pub(super) text: &'a str,
}

impl ScanState {
    pub(super) fn is_structural(self) -> bool {
        self.mode == StringMode::None && self.array_depth == 0
    }

    pub(super) fn scan_line(&mut self, line: &str) {
        let mut index = 0;
        while index < line.len() {
            if self.mode == StringMode::Basic {
                if line.as_bytes()[index] == b'\\' {
                    index = (index + 2).min(line.len());
                } else if line[index..].starts_with("\"\"\"") {
                    self.mode = StringMode::None;
                    index += 3;
                } else {
                    index += char_length(line, index);
                }
                continue;
            }
            if self.mode == StringMode::Literal {
                if line[index..].starts_with("'''") {
                    self.mode = StringMode::None;
                    index += 3;
                } else {
                    index += char_length(line, index);
                }
                continue;
            }
            if line[index..].starts_with("\"\"\"") {
                self.mode = StringMode::Basic;
                index += 3;
            } else if line[index..].starts_with("'''") {
                self.mode = StringMode::Literal;
                index += 3;
            } else {
                let byte = line.as_bytes()[index];
                match byte {
                    b'#' => break,
                    b'"' => index = skip_quoted(line, index + 1, b'"', true),
                    b'\'' => index = skip_quoted(line, index + 1, b'\'', false),
                    b'[' => {
                        self.array_depth += 1;
                        index += 1;
                    }
                    b']' => {
                        self.array_depth = self.array_depth.saturating_sub(1);
                        index += 1;
                    }
                    _ => index += char_length(line, index),
                }
            }
        }
    }
}

pub(super) fn lines(content: &str) -> impl Iterator<Item = Line<'_>> {
    let mut start = 0;
    std::iter::from_fn(move || {
        if start >= content.len() {
            return None;
        }
        let newline = content[start..]
            .find('\n')
            .map_or(content.len(), |offset| start + offset);
        let text_end = if content.as_bytes().get(newline.wrapping_sub(1)) == Some(&b'\r') {
            newline - 1
        } else {
            newline
        };
        let line = Line {
            end: text_end,
            start,
            text: &content[start..text_end],
        };
        start = if newline < content.len() {
            newline + 1
        } else {
            content.len()
        };
        Some(line)
    })
}

fn skip_quoted(line: &str, mut index: usize, quote: u8, escapes: bool) -> usize {
    while index < line.len() {
        if escapes && line.as_bytes()[index] == b'\\' {
            index = (index + 2).min(line.len());
        } else if line.as_bytes()[index] == quote {
            return index + 1;
        } else {
            index += char_length(line, index);
        }
    }
    index
}

fn char_length(line: &str, index: usize) -> usize {
    line[index..].chars().next().map_or(1, char::len_utf8)
}

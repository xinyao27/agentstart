const MAX_PENDING_ANSI_CHARS: usize = 4_096;
const MAX_PARTIAL_CHARS: usize = 4_000;

pub(super) struct LineControl {
    pub(super) cursor: usize,
    pub(super) had_control: bool,
    pub(super) text: String,
}

struct ParsedControl<'a> {
    end: usize,
    final_byte: Option<u8>,
    params: Option<&'a str>,
}

pub(super) fn normalize(chunk: &str, pending: &str) -> (String, String) {
    normalize_controls(chunk, pending, true)
}

pub(super) fn plain_text(value: &str) -> String {
    let value = value
        .replace('\u{009b}', "\x1b[")
        .replace('\u{009d}', "\x1b]")
        .replace('\u{0090}', "\x1bP")
        .replace('\u{0098}', "\x1bX")
        .replace('\u{009e}', "\x1b^")
        .replace('\u{009f}', "\x1b_")
        .replace('\u{009c}', "\x1b\\");
    let (text, _) = normalize_controls(&value, "", false);
    text.chars()
        .filter(|character| !character.is_control() || matches!(character, '\n' | '\t'))
        .collect()
}

fn normalize_controls(
    chunk: &str,
    pending: &str,
    preserve_line_controls: bool,
) -> (String, String) {
    if pending.is_empty() && !needs_normalization(chunk) {
        return (chunk.to_owned(), String::new());
    }
    let combined = format!("{pending}{chunk}");
    let bytes = combined.as_bytes();
    let mut output = String::with_capacity(combined.len());
    let mut index = 0;
    let mut text_start = 0;
    while index < bytes.len() {
        if bytes[index] == 0x1b {
            output.push_str(&combined[text_start..index]);
            let Some(parsed) = parse(&combined, index) else {
                return (output, bounded_pending(&combined[index..]));
            };
            if preserve_line_controls && is_line_control(&parsed) {
                output.push_str(&combined[index..=parsed.end]);
            }
            index = parsed.end + 1;
            text_start = index;
            continue;
        }
        if bytes[index] == b'\r' && bytes.get(index + 1) == Some(&b'\n') {
            output.push_str(&combined[text_start..index]);
            output.push('\n');
            index += 2;
            text_start = index;
            continue;
        }
        let byte = bytes[index];
        if matches!(byte, b'\t' | b'\n' | b'\r' | 0x08) {
            output.push_str(&combined[text_start..index]);
            output.push(char::from(byte));
            index += 1;
            text_start = index;
            continue;
        }
        if byte < 0x20 || byte == 0x7f || (0x80..=0x9f).contains(&byte) {
            output.push_str(&combined[text_start..index]);
            index += 1;
            text_start = index;
            continue;
        }
        index += char_width(byte);
    }
    output.push_str(&combined[text_start..]);
    (output, String::new())
}

pub(super) fn contains_vertical(value: &str) -> bool {
    let mut index = 0;
    while let Some(offset) = value[index..].find('\x1b') {
        index += offset;
        let Some(parsed) = parse(value, index) else {
            return false;
        };
        if matches!(parsed.final_byte, Some(b'A' | b'B')) && canonical(parsed.params) {
            return true;
        }
        index = parsed.end + 1;
    }
    false
}

pub(super) fn apply_line(value: &str) -> LineControl {
    let redraw = value.rsplit_once('\r').map_or(value, |(_, suffix)| suffix);
    if !redraw.contains(['\x08', '\x1b']) {
        return LineControl {
            cursor: redraw.chars().count(),
            had_control: redraw.len() != value.len(),
            text: redraw.to_owned(),
        };
    }
    let mut chars = Vec::<char>::new();
    let mut cursor = 0_usize;
    let mut index = 0;
    while index < redraw.len() {
        let byte = redraw.as_bytes()[index];
        if byte == 0x08 {
            cursor = cursor.saturating_sub(1);
            index += 1;
            continue;
        }
        if byte == 0x1b {
            let Some(parsed) = parse(redraw, index) else {
                break;
            };
            apply_csi(&mut chars, &mut cursor, &parsed);
            index = parsed.end + 1;
            continue;
        }
        let Some(character) = redraw[index..].chars().next() else {
            break;
        };
        if cursor > chars.len() {
            chars.resize(cursor, ' ');
        }
        if cursor == chars.len() {
            chars.push(character);
        } else {
            chars[cursor] = character;
        }
        cursor = (cursor + 1).min(MAX_PARTIAL_CHARS);
        index += character.len_utf8();
    }
    LineControl {
        cursor,
        had_control: true,
        text: chars.into_iter().collect(),
    }
}

pub(super) fn csi_action(value: &str, escape_index: usize) -> Option<(usize, u8, usize)> {
    let parsed = parse(value, escape_index)?;
    let final_byte = parsed.final_byte?;
    canonical(parsed.params).then_some((
        parsed.end,
        final_byte,
        first_param(parsed.params).unwrap_or(1),
    ))
}

fn apply_csi(chars: &mut Vec<char>, cursor: &mut usize, parsed: &ParsedControl<'_>) {
    if !canonical(parsed.params) {
        return;
    }
    let first = first_param(parsed.params);
    match parsed.final_byte {
        Some(b'K') => match first.unwrap_or(0) {
            0 => chars.truncate(*cursor),
            1 => {
                let count = (*cursor + 1).min(chars.len());
                chars
                    .iter_mut()
                    .take(count)
                    .for_each(|character| *character = ' ');
            }
            2 => chars.clear(),
            _ => {}
        },
        Some(b'G' | b'`') => *cursor = first.unwrap_or(1).saturating_sub(1),
        Some(b'D') => *cursor = cursor.saturating_sub(first.unwrap_or(1)),
        Some(b'C') => *cursor = (*cursor + first.unwrap_or(1)).min(MAX_PARTIAL_CHARS),
        _ => {}
    }
}

fn parse(value: &str, escape_index: usize) -> Option<ParsedControl<'_>> {
    let bytes = value.as_bytes();
    match bytes.get(escape_index + 1).copied()? {
        b'[' => {
            for (index, byte) in bytes.iter().enumerate().skip(escape_index + 2) {
                if (0x40..=0x7e).contains(byte) {
                    return Some(ParsedControl {
                        end: index,
                        final_byte: Some(*byte),
                        params: value.get(escape_index + 2..index),
                    });
                }
            }
            None
        }
        b']' => parse_string_control(bytes, escape_index, true),
        b'P' | b'X' | b'^' | b'_' => parse_string_control(bytes, escape_index, false),
        _ => Some(ParsedControl {
            end: escape_index + 1,
            final_byte: None,
            params: None,
        }),
    }
}

fn parse_string_control(bytes: &[u8], start: usize, bell: bool) -> Option<ParsedControl<'_>> {
    for (index, byte) in bytes.iter().enumerate().skip(start + 2) {
        if bell && *byte == 0x07 {
            return Some(ParsedControl {
                end: index,
                final_byte: None,
                params: None,
            });
        }
        if *byte == 0x1b && bytes.get(index + 1) == Some(&b'\\') {
            return Some(ParsedControl {
                end: index + 1,
                final_byte: None,
                params: None,
            });
        }
    }
    None
}

fn is_line_control(parsed: &ParsedControl<'_>) -> bool {
    canonical(parsed.params)
        && matches!(
            parsed.final_byte,
            Some(b'A' | b'B' | b'K' | b'G' | b'`' | b'D' | b'C')
        )
}

fn canonical(params: Option<&str>) -> bool {
    params.is_some_and(|value| {
        value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || byte == b';')
    })
}

fn first_param(params: Option<&str>) -> Option<usize> {
    params?.split(';').next()?.parse().ok()
}

fn bounded_pending(value: &str) -> String {
    if value.len() <= MAX_PENDING_ANSI_CHARS {
        return value.to_owned();
    }
    let prefix_end = value
        .char_indices()
        .nth(2)
        .map_or(value.len(), |(index, _)| index);
    let prefix = &value[..prefix_end];
    let suffix = trailing(value, MAX_PENDING_ANSI_CHARS.saturating_sub(prefix.len()));
    format!("{prefix}{suffix}")
}

fn trailing(value: &str, maximum: usize) -> &str {
    if value.len() <= maximum {
        return value;
    }
    let mut start = value.len() - maximum;
    while !value.is_char_boundary(start) {
        start += 1;
    }
    &value[start..]
}

fn needs_normalization(value: &str) -> bool {
    value.as_bytes().iter().any(|byte| {
        *byte == 0x1b
            || *byte == 0x7f
            || *byte == b'\r'
            || *byte < b'\t'
            || (*byte > b'\n' && *byte < 0x20)
            || (0x80..=0x9f).contains(byte)
    })
}

fn char_width(first: u8) -> usize {
    match first {
        0x00..=0x7f => 1,
        0xc0..=0xdf => 2,
        0xe0..=0xef => 3,
        _ => 4,
    }
}

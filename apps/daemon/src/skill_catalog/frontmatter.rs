use std::cmp::Ordering;

const METADATA_LIMIT_UTF16: usize = 1_000;

pub(super) struct SkillMetadata {
    pub(super) description: Option<String>,
    pub(super) name: Option<String>,
}

pub(super) fn read(text: &str) -> SkillMetadata {
    let Some(document) = document(text) else {
        return SkillMetadata::empty();
    };
    let lines = document.split('\n').collect::<Vec<_>>();
    let mut description = None;
    let mut name = None;
    let mut cursor = 0;
    while cursor < lines.len() {
        let line = lines[cursor];
        if indentation(line) != 0 || line.trim().is_empty() || line.trim_start().starts_with('#') {
            cursor += 1;
            continue;
        }
        let Some((key, source)) = split_entry(line) else {
            cursor += 1;
            continue;
        };
        if !matches!(key, "description" | "name") {
            cursor += 1;
            continue;
        }
        let (value, consumed) = if is_block_header(source) {
            block_scalar(&lines[cursor + 1..], source)
        } else {
            (flow_scalar(source), 0)
        };
        let value = value.and_then(normalize);
        match key {
            "description" => description = value,
            "name" => name = value,
            _ => unreachable!("metadata key was filtered"),
        }
        cursor += consumed + 1;
    }
    SkillMetadata { description, name }
}

pub(super) fn compare_names(left: &str, right: &str) -> Ordering {
    let left_key = collation_key(left);
    let right_key = collation_key(right);
    left_key.cmp(&right_key).then_with(|| {
        left.chars()
            .zip(right.chars())
            .find_map(|(left, right)| (left != right).then(|| case_order(left, right)))
            .unwrap_or_else(|| left.len().cmp(&right.len()))
    })
}

fn document(text: &str) -> Option<&str> {
    let body = text.strip_prefix("---\n")?;
    let end = body.find("\n---")?;
    Some(&body[..end])
}

fn split_entry(line: &str) -> Option<(&str, &str)> {
    let (key, value) = line.split_once(':')?;
    let key = key.trim();
    if key.is_empty() || key.chars().any(char::is_whitespace) {
        return None;
    }
    Some((key, value.trim_start()))
}

fn is_block_header(source: &str) -> bool {
    let header = source.split('#').next().unwrap_or("").trim();
    matches!(header.as_bytes().first(), Some(b'>' | b'|'))
        && header[1..]
            .chars()
            .all(|character| character == '-' || character == '+' || character.is_ascii_digit())
}

fn block_scalar(lines: &[&str], header: &str) -> (Option<String>, usize) {
    let header = header.split('#').next().unwrap_or("").trim();
    let explicit_indent = header
        .chars()
        .find_map(|character| character.to_digit(10))
        .map(|value| value as usize);
    let mut consumed = 0;
    while consumed < lines.len() {
        let line = lines[consumed];
        if !line.trim().is_empty() && indentation(line) == 0 {
            break;
        }
        consumed += 1;
    }
    let body = &lines[..consumed];
    let indent = explicit_indent.or_else(|| {
        body.iter()
            .filter(|line| !line.trim().is_empty())
            .map(|line| indentation(line))
            .filter(|indent| *indent > 0)
            .min()
    });
    let Some(indent) = indent else {
        return (Some(String::new()), consumed);
    };
    let normalized = body
        .iter()
        .map(|line| strip_indent(line, indent))
        .collect::<Vec<_>>();
    let value = if header.trim_start().starts_with('>') {
        fold_lines(&normalized)
    } else {
        normalized.join("\n")
    };
    (Some(value), consumed)
}

fn flow_scalar(source: &str) -> Option<String> {
    let source = source.trim();
    if source.starts_with('\'') {
        return single_quoted(source);
    }
    if source.starts_with('"') {
        return double_quoted(source);
    }
    let source = strip_plain_comment(source).trim();
    if source.is_empty()
        || source.starts_with(['[', '{', '&', '*', '!'])
        || is_non_string_scalar(source)
    {
        return None;
    }
    Some(source.to_owned())
}

fn strip_plain_comment(source: &str) -> &str {
    let mut previous_whitespace = false;
    for (index, character) in source.char_indices() {
        if character == '#' && previous_whitespace {
            return &source[..index];
        }
        previous_whitespace = character.is_whitespace();
    }
    source
}

fn single_quoted(source: &str) -> Option<String> {
    let body = source.strip_prefix('\'')?;
    let mut value = String::new();
    let mut characters = body.chars().peekable();
    while let Some(character) = characters.next() {
        if character != '\'' {
            value.push(character);
            continue;
        }
        if characters.peek() == Some(&'\'') {
            characters.next();
            value.push('\'');
            continue;
        }
        let trailing = characters.collect::<String>();
        return (trailing.trim().is_empty() || trailing.trim().starts_with('#')).then_some(value);
    }
    None
}

fn double_quoted(source: &str) -> Option<String> {
    let mut escaped = false;
    let mut end = None;
    for (index, character) in source.char_indices().skip(1) {
        if escaped {
            escaped = false;
        } else if character == '\\' {
            escaped = true;
        } else if character == '"' {
            end = Some(index + 1);
            break;
        }
    }
    let end = end?;
    let trailing = source[end..].trim();
    if !trailing.is_empty() && !trailing.starts_with('#') {
        return None;
    }
    serde_json::from_str(&source[..end]).ok()
}

fn fold_lines(lines: &[&str]) -> String {
    let mut result = String::new();
    for (index, line) in lines.iter().enumerate() {
        result.push_str(line);
        let Some(next) = lines.get(index + 1) else {
            continue;
        };
        if line.is_empty() || next.is_empty() || starts_more_indented(line, next) {
            result.push('\n');
        } else {
            result.push(' ');
        }
    }
    result
}

fn starts_more_indented(line: &str, next: &str) -> bool {
    line.starts_with(char::is_whitespace) || next.starts_with(char::is_whitespace)
}

fn strip_indent(line: &str, count: usize) -> &str {
    let mut offset = 0;
    for character in line.chars().take(count) {
        if character != ' ' {
            break;
        }
        offset += character.len_utf8();
    }
    &line[offset..]
}

fn indentation(line: &str) -> usize {
    line.bytes().take_while(|byte| *byte == b' ').count()
}

fn is_non_string_scalar(value: &str) -> bool {
    matches!(
        value.to_ascii_lowercase().as_str(),
        "null" | "~" | "true" | "false"
    ) || value.parse::<f64>().is_ok()
}

fn normalize(value: String) -> Option<String> {
    let value = value.trim_matches(is_ecmascript_whitespace);
    if value.is_empty() {
        return None;
    }
    let mut units = 0;
    Some(
        value
            .chars()
            .take_while(|character| {
                let next = units + character.len_utf16();
                if next > METADATA_LIMIT_UTF16 {
                    return false;
                }
                units = next;
                true
            })
            .collect(),
    )
}

fn collation_key(value: &str) -> String {
    value
        .chars()
        .flat_map(char::to_lowercase)
        .map(primary_character)
        .collect()
}

fn primary_character(character: char) -> char {
    match character {
        'à' | 'á' | 'â' | 'ã' | 'ä' | 'å' => 'a',
        'ç' => 'c',
        'è' | 'é' | 'ê' | 'ë' => 'e',
        'ì' | 'í' | 'î' | 'ï' => 'i',
        'ñ' => 'n',
        'ò' | 'ó' | 'ô' | 'õ' | 'ö' => 'o',
        'ù' | 'ú' | 'û' | 'ü' => 'u',
        'ý' | 'ÿ' => 'y',
        value => value,
    }
}

fn case_order(left: char, right: char) -> Ordering {
    match (left.is_lowercase(), right.is_lowercase()) {
        (true, false) => Ordering::Less,
        (false, true) => Ordering::Greater,
        _ => left.cmp(&right),
    }
}

fn is_ecmascript_whitespace(character: char) -> bool {
    matches!(
        character,
        '\u{0009}'
            ..='\u{000d}'
                | '\u{0020}'
                | '\u{00a0}'
                | '\u{1680}'
                | '\u{2000}'..='\u{200a}'
                | '\u{2028}'
                | '\u{2029}'
                | '\u{202f}'
                | '\u{205f}'
                | '\u{3000}'
                | '\u{feff}'
    )
}

impl SkillMetadata {
    const fn empty() -> Self {
        Self {
            description: None,
            name: None,
        }
    }
}

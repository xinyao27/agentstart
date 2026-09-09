pub(super) fn parse_project_header(line: &str) -> Option<String> {
    let line = line.trim_start();
    let mut index = 0;
    expect_byte(line, &mut index, b'[')?;
    skip_space(line, &mut index);
    expect_text(line, &mut index, "projects")?;
    skip_space(line, &mut index);
    expect_byte(line, &mut index, b'.')?;
    skip_space(line, &mut index);
    let value = parse_string(line, &mut index)?;
    skip_space(line, &mut index);
    expect_byte(line, &mut index, b']')?;
    skip_space(line, &mut index);
    (index == line.len() || line.as_bytes().get(index) == Some(&b'#')).then_some(value)
}

pub(super) fn is_trust_assignment(line: &str) -> bool {
    let line = line.trim();
    let Some(rest) = line.strip_prefix("trust_level") else {
        return false;
    };
    let Some(rest) = rest.trim_start().strip_prefix('=') else {
        return false;
    };
    let rest = rest.trim_start();
    let Some(value) = rest.strip_prefix('"').and_then(|rest| rest.split_once('"')) else {
        return rest
            .strip_prefix('\'')
            .and_then(|rest| rest.split_once('\''))
            .is_some_and(|(value, tail)| valid_trust_value(value, tail));
    };
    valid_trust_value(value.0, value.1)
}

pub(super) fn is_table_header(line: &str) -> bool {
    let line = line.trim_start();
    if !line.starts_with('[') {
        return false;
    }
    let mut basic = false;
    let mut literal = false;
    let mut escaped = false;
    for (index, character) in line.char_indices().skip(1) {
        if basic {
            if escaped {
                escaped = false;
            } else if character == '\\' {
                escaped = true;
            } else if character == '"' {
                basic = false;
            }
        } else if literal {
            literal = character != '\'';
        } else if character == '"' {
            basic = true;
        } else if character == '\'' {
            literal = true;
        } else if character == ']' {
            let tail = line[index + 1..].trim();
            return tail.is_empty() || tail.starts_with('#') || tail.starts_with(']');
        }
    }
    false
}

pub(super) fn lookup_path(path: &str) -> String {
    if !path.contains('\\') && !path.starts_with("//") {
        return path.to_owned();
    }
    let path = path.replace('\\', "/");
    let components = path.split('/').collect::<Vec<_>>();
    if is_wsl_unc(&components) {
        let mut result = format!("//wsl.localhost/{}", components[3].to_ascii_lowercase());
        let tail = &components[4..];
        let fold_tail = tail.len() >= 2
            && tail[0] == "mnt"
            && tail[1].len() == 1
            && tail[1].bytes().all(|byte| byte.is_ascii_alphabetic());
        for component in tail {
            result.push('/');
            if fold_tail {
                result.push_str(&component.to_ascii_lowercase());
            } else {
                result.push_str(component);
            }
        }
        return result;
    }
    path.to_ascii_lowercase()
}

pub(super) fn escape_string(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\u{0008}', "\\b")
        .replace('\u{000c}', "\\f")
        .replace('\n', "\\n")
        .replace('\r', "\\r")
        .replace('\t', "\\t")
}

fn parse_string(line: &str, index: &mut usize) -> Option<String> {
    let quote = *line.as_bytes().get(*index)?;
    if quote != b'"' && quote != b'\'' {
        return None;
    }
    *index += 1;
    let mut value = String::new();
    while *index < line.len() {
        let byte = line.as_bytes()[*index];
        if byte == quote {
            *index += 1;
            return Some(value);
        }
        if quote == b'"' && byte == b'\\' {
            *index += 1;
            value.push(parse_escape(line, index)?);
            continue;
        }
        let character = line[*index..].chars().next()?;
        value.push(character);
        *index += character.len_utf8();
    }
    None
}

fn parse_escape(line: &str, index: &mut usize) -> Option<char> {
    let byte = *line.as_bytes().get(*index)?;
    *index += 1;
    match byte {
        b'b' => Some('\u{0008}'),
        b't' => Some('\t'),
        b'n' => Some('\n'),
        b'f' => Some('\u{000c}'),
        b'r' => Some('\r'),
        b'"' => Some('"'),
        b'\\' => Some('\\'),
        b'u' => parse_unicode_escape(line, index, 4),
        b'U' => parse_unicode_escape(line, index, 8),
        _ => None,
    }
}

fn parse_unicode_escape(line: &str, index: &mut usize, length: usize) -> Option<char> {
    let end = index.checked_add(length)?;
    let raw = line.get(*index..end)?;
    if !raw.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return None;
    }
    *index = end;
    char::from_u32(u32::from_str_radix(raw, 16).ok()?)
}

fn valid_trust_value(value: &str, tail: &str) -> bool {
    matches!(value, "trusted" | "untrusted")
        && (tail.trim().is_empty() || tail.trim_start().starts_with('#'))
}

fn is_wsl_unc(components: &[&str]) -> bool {
    components.len() >= 4
        && components[0].is_empty()
        && components[1].is_empty()
        && matches!(
            components[2].to_ascii_lowercase().as_str(),
            "wsl$" | "wsl.localhost"
        )
}

fn skip_space(line: &str, index: &mut usize) {
    while matches!(line.as_bytes().get(*index), Some(b' ' | b'\t')) {
        *index += 1;
    }
}

fn expect_byte(line: &str, index: &mut usize, byte: u8) -> Option<()> {
    (*line.as_bytes().get(*index)? == byte).then(|| *index += 1)
}

fn expect_text(line: &str, index: &mut usize, text: &str) -> Option<()> {
    line.get(*index..)?
        .starts_with(text)
        .then(|| *index += text.len())
}

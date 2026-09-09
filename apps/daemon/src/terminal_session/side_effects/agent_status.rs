use serde_json::{Value, json};

pub(super) fn parse(payload: &[u8]) -> Option<Value> {
    let value: Value = serde_json::from_slice(payload).ok()?;
    let state = value.get("state")?.as_str()?;
    if !matches!(state, "working" | "blocked" | "waiting" | "done") {
        return None;
    }
    // Why: PTY ownership comes from the live record, never from untrusted OSC identity fields.
    Some(json!({
        "state": state,
        "prompt": prompt(&value),
        "agentType": single_line(&value, "agentType", 40),
        "toolName": single_line(&value, "toolName", 60),
        "toolInput": single_line(&value, "toolInput", 160),
        "lastAssistantMessage": value.get("lastAssistantMessage").and_then(Value::as_str)
            .map(|text| multiline(text, 8000)),
        "interrupted": state == "done" && value.get("interrupted").and_then(Value::as_bool) == Some(true),
    }))
}

fn single_line(value: &Value, key: &str, limit: usize) -> Option<String> {
    let text = value.get(key)?.as_str()?;
    let mut units = 0;
    let mut normalized = String::new();
    let mut separator = false;
    let scan = truncate(text, limit * 8 + 64);
    for character in scan.trim_start_matches(trim_whitespace).chars() {
        let is_separator = matches!(character, '\r' | '\n' | '\u{2028}' | '\u{2029}');
        if is_separator && separator {
            continue;
        }
        let next = if is_separator { ' ' } else { character };
        if units + next.len_utf16() > limit {
            break;
        }
        normalized.push(next);
        units += next.len_utf16();
        separator = is_separator;
        if units == limit {
            break;
        }
    }
    if units < limit {
        normalized.truncate(normalized.trim_end_matches(trim_whitespace).len());
    }
    (!normalized.is_empty()).then_some(normalized)
}

fn multiline(text: &str, limit: usize) -> String {
    let mut normalized = String::new();
    let mut newlines = 0;
    let mut previous_cr = false;
    for character in text.trim_matches(trim_whitespace).chars() {
        if character == '\n' && previous_cr {
            previous_cr = false;
            continue;
        }
        previous_cr = character == '\r';
        if matches!(character, '\r' | '\n' | '\u{2028}' | '\u{2029}') {
            if newlines < 2 {
                normalized.push('\n');
            }
            newlines += 1;
        } else {
            newlines = 0;
            normalized.push(character);
        }
        if normalized.len() >= limit * 4 {
            break;
        }
    }
    truncate(&normalized, limit)
}

fn trim_whitespace(character: char) -> bool {
    matches!(character, ' ' | '\t'..='\r' | '\u{a0}' | '\u{1680}' | '\u{2000}'..='\u{200a}'
        | '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}')
}

fn truncate(text: &str, limit: usize) -> String {
    let mut units = 0;
    text.chars()
        .take_while(|character| {
            units += character.len_utf16();
            units <= limit
        })
        .collect()
}

fn prompt(value: &Value) -> String {
    const PREFIX: &str = "You are working inside Yiru, a multi-agent IDE.";
    const ID: &str = "Your task ID is:";
    const TASK: &str = "=== TASK ===";
    let Some(text) = value.get("prompt").and_then(Value::as_str) else {
        return String::new();
    };
    let scan = truncate(text, 24_576);
    let scan = scan.trim_start_matches(trim_whitespace);
    if !scan.starts_with(PREFIX) {
        return single_line(value, "prompt", 200).unwrap_or_default();
    }
    let mut compact = PREFIX.to_owned();
    if let Some((_, rest)) = scan.split_once(ID) {
        let id = rest
            .trim_start_matches(trim_whitespace)
            .split(trim_whitespace)
            .next()
            .unwrap_or("");
        if !id.is_empty() {
            compact.push_str(&format!(" {ID} {id}"));
        }
    }
    let marker = scan
        .match_indices(TASK)
        .find(|(index, _)| {
            let before = &scan[..*index];
            let after = &scan[*index + TASK.len()..];
            (before.is_empty() || before.ends_with(['\r', '\n']))
                && (after.is_empty() || after.starts_with(['\r', '\n']))
        })
        .map(|(index, _)| index)
        .or_else(|| {
            (!scan.contains(['\r', '\n']))
                .then(|| scan.find(TASK))
                .flatten()
        });
    if let Some(index) = marker
        && let Some(body) = scan[index + TASK.len()..]
            .split('\n')
            .map(|line| {
                line.split(trim_whitespace)
                    .filter(|part| !part.is_empty())
                    .collect::<Vec<_>>()
                    .join(" ")
            })
            .find(|line| !line.is_empty())
    {
        compact.push_str(&format!(" {TASK} {body}"));
    }
    single_line(&json!({"prompt": compact}), "prompt", 200).unwrap_or_default()
}

use serde_json::{Map, Value};

const TITLE_LIMIT: usize = 96;
const PREVIEW_LIMIT: usize = 220;

pub(super) fn string(value: Option<&Value>) -> Option<String> {
    value?
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

pub(super) fn number(value: Option<&Value>) -> u64 {
    match value {
        Some(Value::Number(number)) => number
            .as_u64()
            .or_else(|| {
                number
                    .as_f64()
                    .filter(|number| number.is_finite() && *number > 0.0)
                    .map(|number| number.trunc() as u64)
            })
            .unwrap_or(0),
        Some(Value::String(value)) => value
            .trim()
            .parse::<f64>()
            .ok()
            .filter(|number| number.is_finite() && *number > 0.0)
            .map(|number| number.trunc() as u64)
            .unwrap_or(0),
        _ => 0,
    }
}

pub(super) fn title(value: &Value) -> Option<String> {
    content_text(value, TITLE_LIMIT)
}

pub(super) fn preview(value: &Value) -> Option<String> {
    content_text(value, PREVIEW_LIMIT)
}

pub(super) fn message_content(value: Option<&Value>, preview_mode: bool) -> Option<String> {
    let content = value?.as_object()?.get("content")?;
    if preview_mode {
        preview(content)
    } else {
        title(content)
    }
}

pub(super) fn parse_json_line(line: &str) -> Option<Value> {
    let line = line.trim();
    (!line.is_empty())
        .then(|| serde_json::from_str(line).ok())
        .flatten()
}

pub(super) fn first_string(record: &Map<String, Value>, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| string(record.get(*key)))
}

fn content_text(value: &Value, limit: usize) -> Option<String> {
    let mut parts = Vec::new();
    collect_text(value, &mut parts, 32);
    normalize(&parts.join(" "), limit)
}

fn collect_text(value: &Value, parts: &mut Vec<String>, remaining: usize) {
    if remaining == 0 {
        return;
    }
    match value {
        Value::String(text) => parts.push(text.clone()),
        Value::Array(values) => {
            for value in values.iter().take(remaining) {
                collect_text(value, parts, remaining.saturating_sub(1));
            }
        }
        Value::Object(record) => {
            if let Some(value) = record.get("text").or_else(|| record.get("content")) {
                collect_text(value, parts, remaining.saturating_sub(1));
            }
        }
        _ => {}
    }
}

fn normalize(value: &str, limit: usize) -> Option<String> {
    let visible = strip_hidden_blocks(value);
    let normalized = visible.split_whitespace().collect::<Vec<_>>().join(" ");
    if normalized.is_empty()
        || normalized
            .to_ascii_lowercase()
            .starts_with("# agents.md instructions")
        || normalized
            .to_ascii_lowercase()
            .starts_with("<instructions>")
    {
        return None;
    }
    let mut chars = normalized.chars();
    let prefix = chars
        .by_ref()
        .take(limit.saturating_sub(3))
        .collect::<String>();
    Some(if chars.next().is_some() {
        format!("{prefix}...")
    } else {
        normalized
    })
}

fn strip_hidden_blocks(value: &str) -> String {
    let mut result = value.to_owned();
    for tag in ["system-reminder", "codex_internal_context", "goal_context"] {
        loop {
            let lowercase = result.to_ascii_lowercase();
            let Some(start) = lowercase.find(&format!("<{tag}")) else {
                break;
            };
            let Some(open_end) = lowercase[start..]
                .find('>')
                .map(|offset| start + offset + 1)
            else {
                result.truncate(start);
                break;
            };
            let close = format!("</{tag}>");
            let Some(close_start) = lowercase[open_end..]
                .find(&close)
                .map(|offset| open_end + offset)
            else {
                result.truncate(start);
                break;
            };
            result.replace_range(start..close_start + close.len(), " ");
        }
    }
    result
}

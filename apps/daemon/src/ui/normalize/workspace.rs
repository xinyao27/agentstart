use std::collections::HashSet;

use serde_json::{Value, json};

const COLORS: &[&str] = &[
    "neutral",
    "blue",
    "sky",
    "violet",
    "amber",
    "emerald",
    "rose",
    "zinc",
    "conductor-done",
    "conductor-review",
    "conductor-progress",
];
const ICONS: &[&str] = &[
    "circle",
    "circle-dot",
    "circle-progress",
    "circle-dashed",
    "circle-ellipsis",
    "git-pull-request",
    "timer",
    "flag",
    "circle-alert",
    "circle-pause",
    "circle-play",
    "circle-check",
    "ban",
    "conductor-done",
    "conductor-review",
    "conductor-progress",
];

pub(in crate::ui) fn statuses(value: Option<&Value>) -> Value {
    let Some(values) = value.and_then(Value::as_array) else {
        return defaults();
    };
    let mut statuses = Vec::new();
    let mut used = HashSet::new();
    for value in values.iter().take(12) {
        let Some(raw) = value.as_object() else {
            continue;
        };
        let fallback = format!("Status {}", statuses.len() + 1);
        let label = label(raw.get("label"), &fallback);
        let mut id = status_id(raw.get("id"), &label);
        if used.contains(&id) {
            id = unique_id(&label, &used);
        }
        used.insert(id.clone());
        let color = color(raw.get("color"), &id, statuses.len());
        let icon = icon(raw.get("icon"), &id);
        statuses.push(json!({ "id": id, "label": label, "color": color, "icon": icon }));
    }
    if statuses.is_empty() {
        defaults()
    } else {
        Value::Array(statuses)
    }
}

fn defaults() -> Value {
    json!([
        { "id": "todo", "label": "Todo", "color": "neutral", "icon": "circle" },
        {
            "id": "in-progress",
            "label": "In progress",
            "color": "conductor-progress",
            "icon": "conductor-progress"
        },
        {
            "id": "in-review",
            "label": "In review",
            "color": "conductor-review",
            "icon": "conductor-review"
        },
        {
            "id": "completed",
            "label": "Done",
            "color": "conductor-done",
            "icon": "conductor-done"
        }
    ])
}

fn label(value: Option<&Value>, fallback: &str) -> String {
    let Some(value) = value.and_then(Value::as_str) else {
        return fallback.to_owned();
    };
    let mut normalized = String::new();
    let mut in_whitespace = false;
    for character in value.trim_matches(super::is_ecmascript_whitespace).chars() {
        if super::is_ecmascript_whitespace(character) {
            in_whitespace = true;
        } else {
            if in_whitespace && !normalized.is_empty() {
                normalized.push(' ');
            }
            in_whitespace = false;
            if normalized.encode_utf16().count() + character.len_utf16() <= 32 {
                normalized.push(character);
            } else {
                break;
            }
        }
    }
    if normalized.is_empty() {
        fallback.to_owned()
    } else {
        normalized
    }
}

fn status_id(value: Option<&Value>, fallback_label: &str) -> String {
    let source = value
        .and_then(Value::as_str)
        .map(|value| {
            value
                .trim_matches(super::is_ecmascript_whitespace)
                .to_ascii_lowercase()
        })
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| slug(fallback_label));
    let mut normalized = String::new();
    let mut replacing = false;
    for byte in source.bytes() {
        if byte.is_ascii_lowercase() || byte.is_ascii_digit() || matches!(byte, b'_' | b'-') {
            normalized.push(char::from(byte));
            replacing = false;
        } else if !replacing {
            normalized.push('-');
            replacing = true;
        }
    }
    let normalized = normalized.trim_matches('-');
    if normalized.is_empty() {
        "status".to_owned()
    } else {
        normalized.to_owned()
    }
}

fn slug(value: &str) -> String {
    let mut slug = String::new();
    let mut replacing = false;
    for byte in value.trim().to_ascii_lowercase().bytes() {
        if byte.is_ascii_lowercase() || byte.is_ascii_digit() {
            slug.push(char::from(byte));
            replacing = false;
        } else if !replacing {
            slug.push('-');
            replacing = true;
        }
    }
    let slug = slug.trim_matches('-');
    if slug.is_empty() {
        "status".to_owned()
    } else {
        slug.to_owned()
    }
}

fn unique_id(label: &str, used: &HashSet<String>) -> String {
    let base = slug(label);
    if !used.contains(&base) {
        return base;
    }
    for index in 2..100 {
        let candidate = format!("{base}-{index}");
        if !used.contains(&candidate) {
            return candidate;
        }
    }
    "status-100".to_owned()
}

fn color(value: Option<&Value>, id: &str, index: usize) -> String {
    if let Some(value) = value.and_then(Value::as_str)
        && COLORS.contains(&value)
    {
        return value.to_owned();
    }
    default_visual(id)
        .map(|(color, _)| color)
        .unwrap_or(COLORS[index % COLORS.len()])
        .to_owned()
}

fn icon(value: Option<&Value>, id: &str) -> String {
    if let Some(value) = value.and_then(Value::as_str)
        && ICONS.contains(&value)
    {
        return value.to_owned();
    }
    default_visual(id)
        .map_or("circle-dot", |(_, icon)| icon)
        .to_owned()
}

fn default_visual(id: &str) -> Option<(&'static str, &'static str)> {
    match id {
        "todo" => Some(("neutral", "circle")),
        "in-progress" => Some(("conductor-progress", "conductor-progress")),
        "in-review" => Some(("conductor-review", "conductor-review")),
        "completed" => Some(("conductor-done", "conductor-done")),
        _ => None,
    }
}

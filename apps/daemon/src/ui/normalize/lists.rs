use std::collections::HashSet;

use serde_json::{Map, Value, json};

const CARD_ORDER: &[&str] = &[
    "status",
    "unread",
    "branch",
    "comment",
    "ports",
    "inline-agents",
];
const PINNED_IDS: &[&str] = &[
    "explorer",
    "vault",
    "workspaces",
    "pr-checks",
    "source-control",
    "ports",
    "open-in",
    "commands",
];

pub(super) fn card_properties(value: Option<&Value>) -> Value {
    let default = json!(["status", "unread", "comment", "ports", "inline-agents"]);
    let source = value.and_then(Value::as_array).unwrap_or_else(|| {
        default
            .as_array()
            .expect("worktree card defaults are an array")
    });
    Value::Array(
        CARD_ORDER
            .iter()
            .filter(|property| {
                matches!(**property, "status" | "unread")
                    || source.iter().any(|value| value.as_str() == Some(property))
            })
            .map(|property| Value::String((*property).to_owned()))
            .collect(),
    )
}

pub(super) fn pinned_ids(value: Option<&Value>) -> Value {
    let default = json!(["explorer", "source-control", "vault", "open-in"]);
    let raw = value.and_then(Value::as_array);
    let source = raw.unwrap_or_else(|| {
        default
            .as_array()
            .expect("workspace titlebar defaults are an array")
    });
    let mut seen = HashSet::new();
    let mut normalized = Vec::new();
    for value in source {
        let Some(id) = value.as_str() else {
            continue;
        };
        let id = if id == "checks" { "source-control" } else { id };
        if PINNED_IDS.contains(&id) && seen.insert(id.to_owned()) {
            normalized.push(Value::String(id.to_owned()));
        }
    }
    if raw.is_some()
        && !seen.contains("open-in")
        && !source.iter().any(|value| value.as_str() == Some("open-in"))
    {
        normalized.push(Value::String("open-in".to_owned()));
    }
    Value::Array(normalized)
}

pub(super) fn show_dotfiles(value: Option<&Value>) -> Value {
    let mut normalized = Map::new();
    let Some(input) = value.and_then(Value::as_object) else {
        return Value::Object(normalized);
    };
    for (key, value) in input {
        if !key.is_empty()
            && !matches!(key.as_str(), "__proto__" | "constructor" | "prototype")
            && value.is_boolean()
        {
            normalized.insert(key.clone(), value.clone());
        }
    }
    Value::Object(normalized)
}

pub(super) fn feature_tip_ids(value: Option<&Value>) -> Value {
    unique_known(value, &["yiru-cli", "command-palette"], |id| {
        if id == "cmd-j-palette" {
            "command-palette"
        } else {
            id
        }
    })
}

pub(super) fn contextual_tour_ids(value: Option<&Value>) -> Value {
    unique_known(
        value,
        &["workspace-agent-sessions", "browser", "workspace-creation"],
        |id| id,
    )
}

pub(super) fn merge_contextual_tours(current: Option<&Value>, incoming: Option<&Value>) -> Value {
    let mut values = contextual_tour_ids(current)
        .as_array()
        .expect("normalized tours are an array")
        .clone();
    let mut seen = values
        .iter()
        .filter_map(Value::as_str)
        .map(str::to_owned)
        .collect::<HashSet<_>>();
    if let Some(incoming) = contextual_tour_ids(incoming).as_array() {
        for value in incoming {
            if let Some(id) = value.as_str()
                && seen.insert(id.to_owned())
            {
                values.push(value.clone());
            }
        }
    }
    Value::Array(values)
}

pub(super) fn visible_host_ids(value: Option<&Value>) -> Value {
    let Some(values) = value.and_then(Value::as_array) else {
        return Value::Null;
    };
    let mut seen = HashSet::new();
    let normalized = values
        .iter()
        .filter_map(Value::as_str)
        .filter_map(normalize_host_id)
        .filter(|id| seen.insert(id.clone()))
        .map(Value::String)
        .collect::<Vec<_>>();
    if normalized.is_empty() {
        Value::Null
    } else {
        Value::Array(normalized)
    }
}

pub(super) fn host_order(value: Option<&Value>) -> Value {
    match visible_host_ids(value) {
        Value::Array(values) => Value::Array(values),
        _ => Value::Array(Vec::new()),
    }
}

pub(super) fn manual_repo_order(value: Option<&Value>) -> Value {
    let Some(values) = value.and_then(Value::as_array) else {
        return Value::Array(Vec::new());
    };
    let mut seen = HashSet::new();
    let mut normalized = Vec::new();
    for value in values {
        let Some(object) = value.as_object() else {
            continue;
        };
        let Some(host_id) = object
            .get("hostId")
            .and_then(Value::as_str)
            .and_then(normalize_host_id)
        else {
            continue;
        };
        let Some(repo_id) = object.get("repoId").and_then(Value::as_str) else {
            continue;
        };
        if trim(repo_id).is_empty() || !seen.insert(format!("{host_id}\0{repo_id}")) {
            continue;
        }
        normalized.push(json!({ "hostId": host_id, "repoId": repo_id }));
    }
    Value::Array(normalized)
}

fn unique_known(
    value: Option<&Value>,
    known: &[&str],
    map: impl for<'a> Fn(&'a str) -> &'a str,
) -> Value {
    let Some(values) = value.and_then(Value::as_array) else {
        return Value::Array(Vec::new());
    };
    let mut seen = HashSet::new();
    Value::Array(
        values
            .iter()
            .filter_map(Value::as_str)
            .map(map)
            .filter(|id| known.contains(id) && seen.insert((*id).to_owned()))
            .map(|id| Value::String(id.to_owned()))
            .collect(),
    )
}

fn normalize_host_id(value: &str) -> Option<String> {
    let value = trim(value);
    if value == "local" {
        return Some(value.to_owned());
    }
    let (_, encoded) = ["runtime:", "ssh:", "wsl:"]
        .into_iter()
        .find_map(|prefix| value.strip_prefix(prefix).map(|encoded| (prefix, encoded)))?;
    (!encoded.is_empty() && percent_decodes_nonempty(encoded)).then(|| value.to_owned())
}

fn percent_decodes_nonempty(value: &str) -> bool {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            let Some((high, low)) = bytes.get(index + 1).zip(bytes.get(index + 2)) else {
                return false;
            };
            let (Some(high), Some(low)) = (hex(*high), hex(*low)) else {
                return false;
            };
            decoded.push(high * 16 + low);
            index += 3;
        } else {
            decoded.push(bytes[index]);
            index += 1;
        }
    }
    std::str::from_utf8(&decoded).is_ok_and(|decoded| !decoded.is_empty())
}

fn hex(value: u8) -> Option<u8> {
    match value {
        b'0'..=b'9' => Some(value - b'0'),
        b'a'..=b'f' => Some(value - b'a' + 10),
        b'A'..=b'F' => Some(value - b'A' + 10),
        _ => None,
    }
}

fn trim(value: &str) -> &str {
    value.trim_matches(super::is_ecmascript_whitespace)
}

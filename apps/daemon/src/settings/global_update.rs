use serde_json::{Map, Value, json};

use super::{agents, defaults, quick_commands};

pub(super) fn normalize(
    current: &Map<String, Value>,
    updates: Map<String, Value>,
) -> Map<String, Value> {
    let mut updates = defaults::normalize_updates(updates);
    normalize_agents(&mut updates);
    if let Some(value) = updates.get("terminalQuickCommands").cloned() {
        updates.insert(
            "terminalQuickCommands".to_owned(),
            Value::Array(quick_commands::normalize(Some(&value))),
        );
    }
    if let Some(value) = updates.get("prBotAuthorOverrides") {
        updates.insert(
            "prBotAuthorOverrides".to_owned(),
            json!(normalize_authors(value)),
        );
    }
    if updates.contains_key("workspaceDir") || updates.contains_key("nestWorkspaces") {
        append_workspace_history(current, &mut updates);
    }
    merge_object(current, &mut updates, "telemetry");
    merge_object(current, &mut updates, "notifications");
    if let Some(notifications) = updates
        .get_mut("notifications")
        .and_then(Value::as_object_mut)
    {
        normalize_notifications(notifications);
    }
    updates
}

fn normalize_agents(updates: &mut Map<String, Value>) {
    if let Some(value) = updates.get("disabledTuiAgents").cloned() {
        updates.insert(
            "disabledTuiAgents".to_owned(),
            json!(agents::string_list(Some(&value))),
        );
    }
    if let Some(value) = updates.get("agentDefaultArgs").cloned() {
        updates.insert(
            "agentDefaultArgs".to_owned(),
            json!(agents::string_map(Some(&value), true)),
        );
        updates.insert("agentYoloDefaultsMigrated".to_owned(), Value::Bool(true));
    }
    if let Some(value) = updates.get("agentDefaultEnv").cloned() {
        updates.insert(
            "agentDefaultEnv".to_owned(),
            Value::Object(agents::env_map(Some(&value))),
        );
        updates.insert("agentYoloDefaultsMigrated".to_owned(), Value::Bool(true));
    }
}

fn append_workspace_history(current: &Map<String, Value>, updates: &mut Map<String, Value>) {
    let current_path = current
        .get("workspaceDir")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let current_nested = current
        .get("nestWorkspaces")
        .and_then(Value::as_bool)
        .unwrap_or(true);
    let next_path = updates
        .get("workspaceDir")
        .and_then(Value::as_str)
        .unwrap_or(current_path);
    let next_nested = updates
        .get("nestWorkspaces")
        .and_then(Value::as_bool)
        .unwrap_or(current_nested);
    if normalize_path(next_path) == normalize_path(current_path) && next_nested == current_nested {
        return;
    }
    let mut history = current
        .get("workspaceDirHistory")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let exists = history.iter().any(|entry| {
        entry
            .get("path")
            .and_then(Value::as_str)
            .map(normalize_path)
            == Some(normalize_path(current_path))
            && entry.get("nestWorkspaces").and_then(Value::as_bool) == Some(current_nested)
    });
    if !exists {
        history.push(json!({ "path": current_path, "nestWorkspaces": current_nested }));
        updates.insert("workspaceDirHistory".to_owned(), Value::Array(history));
    }
}

fn merge_object(current: &Map<String, Value>, updates: &mut Map<String, Value>, key: &str) {
    let Some(incoming) = updates.get(key).and_then(Value::as_object) else {
        return;
    };
    let mut merged = current
        .get(key)
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    merged.extend(incoming.clone());
    updates.insert(key.to_owned(), Value::Object(merged));
}

fn normalize_notifications(notifications: &mut Map<String, Value>) {
    let sound = notifications
        .get("customSoundId")
        .and_then(Value::as_str)
        .unwrap_or("system");
    let sound = match sound {
        "system" | "two-tone" | "bong" | "thump" | "blip" | "sonar" | "blop" | "ding" | "clack"
        | "beep" | "custom" => sound,
        "agentstart" | "chime" => "two-tone",
        "pop" => "blop",
        _ if notifications
            .get("customSoundPath")
            .is_some_and(Value::is_string) =>
        {
            "custom"
        }
        _ => "system",
    };
    notifications.insert("customSoundId".to_owned(), Value::String(sound.to_owned()));
    let volume = notifications
        .get("customSoundVolume")
        .and_then(Value::as_f64)
        .filter(|value| value.is_finite())
        .unwrap_or(100.0)
        .clamp(0.0, 100.0);
    if let Some(number) = serde_json::Number::from_f64(volume) {
        notifications.insert("customSoundVolume".to_owned(), Value::Number(number));
    }
}

fn normalize_authors(value: &Value) -> Vec<String> {
    let mut authors = value
        .as_array()
        .into_iter()
        .flatten()
        .take(500)
        .filter_map(Value::as_str)
        .filter(|value| value.encode_utf16().count() <= 255)
        .map(|value| value.trim().to_lowercase())
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();
    authors.sort();
    authors.dedup();
    authors
}

fn normalize_path(value: &str) -> String {
    let value = value.trim_end_matches(['/', '\\']).replace('\\', "/");
    if cfg!(target_os = "windows") {
        value.to_lowercase()
    } else {
        value
    }
}

use serde_json::{Map, Value};

use super::super::sanitize_sleeping_record;

pub(super) fn repair(value: &Value) -> Option<Value> {
    let records = value.as_object()?;
    let records = records
        .iter()
        .filter(|(pane_key, _)| !unsafe_key(pane_key))
        .filter_map(|(pane_key, record)| {
            let repaired = repair_record(pane_key, record)?;
            Some((pane_key.clone(), sanitize_sleeping_record(&repaired)?))
        })
        .collect::<Map<_, _>>();
    (!records.is_empty()).then_some(Value::Object(records))
}

fn repair_record(pane_key: &str, value: &Value) -> Option<Value> {
    let mut record = value.as_object()?.clone();
    if record.get("paneKey").and_then(Value::as_str) != Some(pane_key) {
        return None;
    }
    let provider = normalize_provider(record.get("providerSession")?)?;
    record.insert("providerSession".to_owned(), provider);
    if let Some(config) = record.remove("launchConfig")
        && let Some(config) = normalize_launch_config(&config)
    {
        record.insert("launchConfig".to_owned(), config);
    }
    Some(Value::Object(record))
}

fn normalize_provider(value: &Value) -> Option<Value> {
    let provider = value.as_object()?;
    let key = provider.get("key")?.as_str()?;
    if !matches!(key, "session_id" | "conversation_id") {
        return None;
    }
    let id = provider.get("id")?.as_str()?.trim();
    if id.is_empty() || id.encode_utf16().count() > 512 || id.starts_with('-') || unsafe_chars(id) {
        return None;
    }
    let mut normalized = Map::from_iter([
        ("key".to_owned(), Value::String(key.to_owned())),
        ("id".to_owned(), Value::String(id.to_owned())),
    ]);
    if let Some(path) = provider.get("transcriptPath").and_then(Value::as_str) {
        let path = path.trim();
        if !path.is_empty() && !unsafe_chars(path) {
            normalized.insert("transcriptPath".to_owned(), Value::String(path.to_owned()));
        }
    }
    Some(Value::Object(normalized))
}

fn normalize_launch_config(value: &Value) -> Option<Value> {
    let config = value.as_object()?;
    let agent_args = config.get("agentArgs")?.as_str()?;
    let mut normalized =
        Map::from_iter([("agentArgs".to_owned(), Value::String(agent_args.to_owned()))]);
    if let Some(command) = config.get("agentCommand") {
        normalized.insert(
            "agentCommand".to_owned(),
            Value::String(command.as_str()?.to_owned()),
        );
    }
    let environment = normalize_environment(config.get("agentEnv")?)?;
    normalized.insert("agentEnv".to_owned(), environment);
    if let Some(path) = config.get("ompResumeFilePath") {
        let path = path.as_str()?;
        if path.is_empty() || path.encode_utf16().count() > 32 * 1024 || unsafe_chars(path) {
            return None;
        }
        normalized.insert(
            "ompResumeFilePath".to_owned(),
            Value::String(path.to_owned()),
        );
    }
    Some(Value::Object(normalized))
}

fn normalize_environment(value: &Value) -> Option<Value> {
    let environment = value.as_object()?;
    let mut normalized = Map::new();
    for (key, value) in environment {
        let key = key.trim();
        let value = value.as_str()?;
        if key.is_empty()
            || unsafe_key(key)
            || key.contains('=')
            || unsafe_chars(key)
            || value.contains('\0')
        {
            return None;
        }
        normalized.insert(key.to_owned(), Value::String(value.to_owned()));
    }
    Some(Value::Object(normalized))
}

fn unsafe_key(value: &str) -> bool {
    matches!(value, "__proto__" | "constructor" | "prototype")
}

fn unsafe_chars(value: &str) -> bool {
    value.chars().any(|character| {
        let code = u32::from(character);
        code <= 0x1f || code == 0x7f
    })
}

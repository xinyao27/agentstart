use serde_json::{Map, Number, Value};

pub(super) fn matches(document: &Map<String, Value>, key: &str, candidate: &Value) -> bool {
    value(document, key)
        .as_ref()
        .is_some_and(|current| equal(current, candidate))
}

fn equal(left: &Value, right: &Value) -> bool {
    match (left, right) {
        (Value::Number(left), Value::Number(right)) => left.as_f64() == right.as_f64(),
        (Value::Array(left), Value::Array(right)) => {
            left.len() == right.len()
                && left
                    .iter()
                    .zip(right)
                    .all(|(left, right)| equal(left, right))
        }
        (Value::Object(left), Value::Object(right)) => {
            left.len() == right.len()
                && left
                    .iter()
                    .all(|(key, left)| right.get(key).is_some_and(|right| equal(left, right)))
        }
        _ => left == right,
    }
}

fn value(document: &Map<String, Value>, key: &str) -> Option<Value> {
    match key {
        "terminalFontSize" => Some(font_size(document)),
        "terminalLineHeight" => Some(line_height(document)),
        "terminalCursorStyle" => Some(cursor_style(document)),
        "terminalMacOptionAsAlt" => Some(option_as_alt(document)),
        "terminalFontFamily" => Some(
            document
                .get(key)
                .cloned()
                .unwrap_or_else(|| Value::String(default_font_family().to_owned())),
        ),
        "terminalFontWeight" => Some(or_default(document, key, Value::from(500))),
        "terminalCursorBlink" => Some(or_default(document, key, Value::Bool(true))),
        "terminalDividerColorDark" => Some(or_default(document, key, Value::from("#3f3f46"))),
        "terminalDividerColorLight" => Some(or_default(document, key, Value::from("#d4d4d8"))),
        "terminalInactivePaneOpacity" => Some(or_default(document, key, decimal(0.8))),
        "terminalMouseHideWhileTyping" | "terminalFocusFollowsMouse" => {
            Some(or_default(document, key, Value::Bool(false)))
        }
        _ => document.get(key).cloned(),
    }
}

fn font_size(document: &Map<String, Value>) -> Value {
    let current = document.get("terminalFontSize");
    let migrated = document
        .get("systemTypographyDefaultsMigrated")
        .and_then(Value::as_bool)
        == Some(true);
    if migrated {
        return current.cloned().unwrap_or_else(|| Value::from(13));
    }
    match current {
        None => Value::from(13),
        Some(value) if value.as_f64() == Some(14.0) => Value::from(13),
        Some(value) => value.clone(),
    }
}

fn line_height(document: &Map<String, Value>) -> Value {
    let value = document
        .get("terminalLineHeight")
        .and_then(Value::as_f64)
        .filter(|value| value.is_finite())
        .unwrap_or(1.0)
        .clamp(1.0, 3.0);
    decimal(value)
}

fn cursor_style(document: &Map<String, Value>) -> Value {
    let migrated = document
        .get("terminalCursorStyleDefaultedToBlock")
        .and_then(Value::as_bool)
        == Some(true);
    if migrated {
        document
            .get("terminalCursorStyle")
            .cloned()
            .unwrap_or_else(|| Value::from("block"))
    } else {
        Value::from("block")
    }
}

fn option_as_alt(document: &Map<String, Value>) -> Value {
    let current = document.get("terminalMacOptionAsAlt");
    let migrated = document
        .get("terminalMacOptionAsAltMigrated")
        .and_then(Value::as_bool)
        == Some(true);
    if migrated {
        return current.cloned().unwrap_or_else(|| Value::from("auto"));
    }
    match current {
        None => Value::from("auto"),
        Some(value) if value.as_str() == Some("true") => Value::from("auto"),
        Some(value) => value.clone(),
    }
}

fn or_default(document: &Map<String, Value>, key: &str, default: Value) -> Value {
    document.get(key).cloned().unwrap_or(default)
}

fn decimal(value: f64) -> Value {
    Number::from_f64(value).map_or(Value::Null, Value::Number)
}

fn default_font_family() -> &'static str {
    if cfg!(target_os = "windows") {
        "Cascadia Mono"
    } else if cfg!(target_os = "linux") {
        "DejaVu Sans Mono"
    } else {
        "SF Mono"
    }
}

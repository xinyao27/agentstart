use serde_json::{Map, Number, Value};

pub(super) fn map(values: &Map<String, Value>) -> (Map<String, Value>, Vec<String>) {
    let mut diff = Map::new();
    let mut colors = Map::new();
    let mut unsupported = Vec::new();
    for (key, raw) in values {
        let value = last(raw);
        let mapped = match key.as_str() {
            "background" => color(&mut colors, "background", value),
            "foreground" => color(&mut colors, "foreground", value),
            "cursor-color" => color(&mut colors, "cursor", value),
            "cursor-text" => color(&mut colors, "cursorAccent", value),
            "selection-background" => color(&mut colors, "selectionBackground", value),
            "selection-foreground" => color(&mut colors, "selectionForeground", value),
            "bold-color" => color(&mut colors, "bold", value),
            "palette" => palette(&mut colors, raw),
            "split-divider-color" => hex(value).is_some_and(|color| {
                diff.insert("terminalDividerColorDark".to_owned(), color.clone());
                diff.insert("terminalDividerColorLight".to_owned(), color);
                true
            }),
            "background-opacity" => number(&mut diff, "terminalBackgroundOpacity", value, 0.0, 1.0),
            "unfocused-split-opacity" => {
                number(&mut diff, "terminalInactivePaneOpacity", value, 0.0, 1.0)
            }
            "cursor-opacity" => number(&mut diff, "terminalCursorOpacity", value, 0.0, 1.0),
            "font-size" => number(
                &mut diff,
                "terminalFontSize",
                value,
                f64::MIN_POSITIVE,
                f64::MAX,
            ),
            "font-weight" => number(&mut diff, "terminalFontWeight", value, 100.0, 900.0),
            "window-padding-x" => padding(value)
                .is_some_and(|value| insert_number(&mut diff, "terminalPaddingX", value)),
            "window-padding-y" => padding(value)
                .is_some_and(|value| insert_number(&mut diff, "terminalPaddingY", value)),
            "adjust-cell-height" => line_height(value)
                .is_some_and(|value| insert_number(&mut diff, "terminalLineHeight", value)),
            "mouse-hide-while-typing" => boolean(&mut diff, "terminalMouseHideWhileTyping", value),
            "cursor-style-blink" => boolean(&mut diff, "terminalCursorBlink", value),
            "focus-follows-mouse" => boolean(&mut diff, "terminalFocusFollowsMouse", value),
            "font-family" => nonempty(&mut diff, "terminalFontFamily", value),
            "cursor-style" if matches!(value, "bar" | "block" | "underline") => {
                diff.insert(
                    "terminalCursorStyle".to_owned(),
                    Value::String(value.to_owned()),
                );
                true
            }
            "macos-option-as-alt" if cfg!(target_os = "macos") => {
                let value = match value {
                    "true" | "on" => Some("true"),
                    "false" | "off" => Some("false"),
                    "left" => Some("left"),
                    "right" => Some("right"),
                    _ => None,
                };
                value.is_some_and(|value| {
                    diff.insert(
                        "terminalMacOptionAsAlt".to_owned(),
                        Value::String(value.to_owned()),
                    );
                    true
                })
            }
            _ => false,
        };
        if !mapped {
            unsupported.push(key.clone());
        }
    }
    if !colors.is_empty() {
        diff.insert("terminalColorOverrides".to_owned(), Value::Object(colors));
    }
    (diff, unsupported)
}

fn last(value: &Value) -> &str {
    value
        .as_array()
        .and_then(|values| values.last())
        .unwrap_or(value)
        .as_str()
        .unwrap_or("")
}

fn hex(value: &str) -> Option<Value> {
    let value = value.strip_prefix('#').unwrap_or(value);
    ((value.len() == 3 || value.len() == 6) && value.bytes().all(|byte| byte.is_ascii_hexdigit()))
        .then(|| Value::String(format!("#{value}")))
}

fn color(colors: &mut Map<String, Value>, key: &str, value: &str) -> bool {
    hex(value).is_some_and(|value| {
        colors.insert(key.to_owned(), value);
        true
    })
}

fn palette(colors: &mut Map<String, Value>, raw: &Value) -> bool {
    const KEYS: &[&str] = &[
        "black",
        "red",
        "green",
        "yellow",
        "blue",
        "magenta",
        "cyan",
        "white",
        "brightBlack",
        "brightRed",
        "brightGreen",
        "brightYellow",
        "brightBlue",
        "brightMagenta",
        "brightCyan",
        "brightWhite",
    ];
    let entries = raw
        .as_array()
        .map_or_else(|| vec![raw], |values| values.iter().collect());
    let mut mapped = false;
    for entry in entries {
        let Some((index, value)) = entry.as_str().and_then(|value| value.split_once('=')) else {
            continue;
        };
        let Some(key) = index
            .trim()
            .parse::<usize>()
            .ok()
            .and_then(|index| KEYS.get(index))
        else {
            continue;
        };
        if let Some(value) = hex(value.trim()) {
            colors.insert((*key).to_owned(), value);
            mapped = true;
        }
    }
    mapped
}

fn number(diff: &mut Map<String, Value>, key: &str, value: &str, min: f64, max: f64) -> bool {
    value
        .parse::<f64>()
        .ok()
        .filter(|value| value.is_finite() && *value >= min && *value <= max)
        .is_some_and(|value| insert_number(diff, key, value))
}

fn insert_number(diff: &mut Map<String, Value>, key: &str, value: f64) -> bool {
    let Some(value) = Number::from_f64(value) else {
        return false;
    };
    diff.insert(key.to_owned(), Value::Number(value));
    true
}

fn boolean(diff: &mut Map<String, Value>, key: &str, value: &str) -> bool {
    let value = match value {
        "true" => Some(true),
        "false" => Some(false),
        _ => None,
    };
    value.is_some_and(|value| {
        diff.insert(key.to_owned(), Value::Bool(value));
        true
    })
}

fn nonempty(diff: &mut Map<String, Value>, key: &str, value: &str) -> bool {
    (!value.trim().is_empty())
        .then(|| {
            diff.insert(key.to_owned(), Value::String(value.to_owned()));
        })
        .is_some()
}

fn padding(value: &str) -> Option<f64> {
    let parts = value.split(',').collect::<Vec<_>>();
    if parts.is_empty() || parts.len() > 2 {
        return None;
    }
    let values = parts
        .iter()
        .map(|value| {
            let value = value.trim();
            if value.is_empty() || value.bytes().any(|byte| !byte.is_ascii_digit()) {
                return None;
            }
            value.parse::<f64>().ok().filter(|value| *value <= 512.0)
        })
        .collect::<Option<Vec<_>>>()?;
    Some(values.iter().sum::<f64>() / values.len() as f64)
}

fn line_height(value: &str) -> Option<f64> {
    let value = value.strip_prefix('+').unwrap_or(value).strip_suffix('%')?;
    let mut parts = value.split('.');
    let integer = parts.next()?;
    let fraction = parts.next();
    if integer.is_empty()
        || !integer.bytes().all(|byte| byte.is_ascii_digit())
        || fraction.is_some_and(|digits| {
            digits.is_empty() || !digits.bytes().all(|byte| byte.is_ascii_digit())
        })
        || parts.next().is_some()
    {
        return None;
    }
    let percent = value.parse::<f64>().ok()?;
    if 1.0 + percent / 100.0 > 3.0 {
        return None;
    }
    let result = (100.0 + percent).round() / 100.0;
    Some(result)
}

use serde_json::{Map, Value, json};
use std::path::Path;

const NAMES: &[(&str, &str, &str)] = &[
    ("black", "black", "brightBlack"),
    ("red", "red", "brightRed"),
    ("green", "green", "brightGreen"),
    ("yellow", "yellow", "brightYellow"),
    ("blue", "blue", "brightBlue"),
    ("magenta", "magenta", "brightMagenta"),
    ("cyan", "cyan", "brightCyan"),
    ("white", "white", "brightWhite"),
];

pub(super) fn parse(
    content: &str,
    label: &str,
    id_discriminator: &str,
    id_suffix: Option<&str>,
    source_label: &str,
    imported_at: &str,
) -> Result<Value, String> {
    if content.len() > 1_000_000 {
        return Err(format!(
            "File is too large to import ({} bytes, limit 1000000).",
            content.len()
        ));
    }
    let options = serde_saphyr::options! {
        budget: serde_saphyr::budget! {
            max_reader_input_bytes: Some(1_000_000),
            max_events: 100_000,
            max_nodes: 50_000,
            max_depth: 128,
        },
        alias_limits: serde_saphyr::alias_limits! {
            max_alias_expansions_per_anchor: 20,
        },
        emit_comments: false,
    };
    let value = serde_saphyr::from_str_with_options::<Value>(content, options)
        .map_err(|error| error.to_string())?;
    let input = value
        .as_object()
        .ok_or_else(|| "Theme file must contain a YAML object.".to_owned())?;
    let fallback = Path::new(label)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or(label);
    let name = theme_name(
        input
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or(fallback),
        fallback,
    );
    let mut terminal = Map::new();
    let background = read_color(input.get("background"));
    let foreground = read_color(input.get("foreground"));
    let cursor = read_color(input.get("cursor")).or_else(|| read_color(input.get("accent")));
    insert(&mut terminal, "background", background.as_deref());
    insert(&mut terminal, "foreground", foreground.as_deref());
    insert(&mut terminal, "cursor", cursor.as_deref());
    let colors = input.get("terminal_colors").and_then(Value::as_object);
    add_palette(
        &mut terminal,
        colors.and_then(|value| value.get("normal")),
        false,
    );
    add_palette(
        &mut terminal,
        colors.and_then(|value| value.get("bright")),
        true,
    );
    if background.is_none()
        || foreground.is_none()
        || !NAMES.iter().any(|(_, normal, bright)| {
            terminal.contains_key(*normal) || terminal.contains_key(*bright)
        })
    {
        return Err(
            "Theme must include background, foreground, and at least one ANSI color.".to_owned(),
        );
    }
    let safe_discriminator = theme_id(id_discriminator);
    let id_base = if safe_discriminator.is_empty() {
        theme_id(&format!("warp:{name}"))
    } else {
        theme_id(&format!("warp:{name}:{safe_discriminator}"))
    };
    let id = id_suffix
        .filter(|suffix| !suffix.is_empty())
        .map_or(id_base.clone(), |suffix| format!("{id_base}-{suffix}"));
    let mode = background
        .as_deref()
        .map(|color| {
            if luminance(color) >= 0.55 {
                "light"
            } else {
                "dark"
            }
        })
        .unwrap_or_else(|| match input.get("details").and_then(Value::as_str) {
            Some("lighter") => "light",
            Some("darker") => "dark",
            _ => "unknown",
        });
    let mut unsupported = Vec::new();
    if input.contains_key("background_image") {
        unsupported.push("background image not supported");
    }
    if input.get("background").is_some_and(Value::is_object) {
        unsupported.push("background gradient not supported");
    }
    if input.get("accent").is_some_and(Value::is_object) {
        unsupported.push("accent gradient not supported");
    }
    if ["background_gradient", "gradient", "gradients"]
        .iter()
        .any(|key| input.contains_key(*key))
    {
        unsupported.push("gradient not supported");
    }
    let mut theme = Map::from_iter([
        ("id".to_owned(), Value::String(id.clone())),
        ("name".to_owned(), Value::String(name)),
        ("source".to_owned(), Value::String("warp".to_owned())),
        ("mode".to_owned(), Value::String(mode.to_owned())),
        ("terminal".to_owned(), Value::Object(terminal)),
        (
            "importedAt".to_owned(),
            Value::String(imported_at.to_owned()),
        ),
        (
            "sourceLabel".to_owned(),
            Value::String(source_label.to_owned()),
        ),
        (
            "selectionValue".to_owned(),
            Value::String(format!("custom:{id}")),
        ),
    ]);
    if !unsupported.is_empty() {
        theme.insert("unsupportedFeatures".to_owned(), json!(unsupported));
    }
    Ok(Value::Object(theme))
}

fn read_color(value: Option<&Value>) -> Option<String> {
    if let Some(value) = value.and_then(Value::as_str).and_then(hex) {
        return Some(value);
    }
    let value = value.and_then(Value::as_object)?;
    ["top", "bottom", "left", "right"]
        .iter()
        .find_map(|key| value.get(*key).and_then(Value::as_str).and_then(hex))
}

fn hex(value: &str) -> Option<String> {
    let value = value.trim().strip_prefix('#').unwrap_or(value.trim());
    if !matches!(value.len(), 3 | 6) || !value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return None;
    }
    let expanded = if value.len() == 3 {
        value
            .chars()
            .flat_map(|character| [character, character])
            .collect()
    } else {
        value.to_owned()
    };
    Some(format!("#{}", expanded.to_ascii_lowercase()))
}

fn add_palette(terminal: &mut Map<String, Value>, value: Option<&Value>, bright: bool) {
    let Some(value) = value.and_then(Value::as_object) else {
        return;
    };
    for (source, normal, bright_name) in NAMES {
        insert(
            terminal,
            if bright { bright_name } else { normal },
            value
                .get(*source)
                .and_then(Value::as_str)
                .and_then(hex)
                .as_deref(),
        );
    }
}

fn insert(target: &mut Map<String, Value>, key: &str, value: Option<&str>) {
    if let Some(value) = value {
        target.insert(key.to_owned(), Value::String(value.to_owned()));
    }
}

fn theme_name(value: &str, fallback: &str) -> String {
    let value = value
        .chars()
        .filter(|character| !character.is_control())
        .map(|character| {
            if matches!(character, '/' | '\\') {
                ' '
            } else {
                character
            }
        })
        .collect::<String>();
    let value = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if value.is_empty() {
        fallback.to_owned()
    } else {
        value
    }
}

fn theme_id(value: &str) -> String {
    let mut output = String::new();
    let mut dash = false;
    for character in value.to_ascii_lowercase().chars() {
        if matches!(character, '\'' | '"') || character <= '\u{1f}' || character == '\u{7f}' {
            continue;
        }
        if character.is_ascii_alphanumeric() || matches!(character, ':' | '_') {
            output.push(character);
            dash = false;
        } else if !dash && !output.is_empty() {
            output.push('-');
            dash = true;
        }
    }
    output.trim_matches('-').to_owned()
}

fn luminance(color: &str) -> f64 {
    let component = |range| u8::from_str_radix(&color[range], 16).unwrap_or(0) as f64 / 255.0;
    0.2126 * component(1..3) + 0.7152 * component(3..5) + 0.0722 * component(5..7)
}

use std::path::Path;

use serde_json::{Map, Value};

use crate::protocol::KeybindingDescriptor;

use super::conflicts;
use super::document;
use super::model::{
    DiagnosticSeverity, KeybindingFileDiagnostic, KeybindingFileSnapshot, KeybindingOverrides,
    KeybindingPlatform, PlatformOverrides, definition, normalize_action_id,
};
use super::syntax::{normalize_array, normalize_list};

const PLATFORMS: &[KeybindingPlatform] = &[
    KeybindingPlatform::Darwin,
    KeybindingPlatform::Linux,
    KeybindingPlatform::Win32,
];
const ROOT_KEYS: &[&str] = &["$schema", "version", "keybindings", "platforms"];

pub(super) fn read(
    path: &Path,
    platform: KeybindingPlatform,
    definitions: &[KeybindingDescriptor],
) -> KeybindingFileSnapshot {
    let read = document::read(path);
    let Some(document) = read.document else {
        return unreadable_snapshot(path, platform, read.exists, read.error.as_deref());
    };
    let mut diagnostics = Vec::new();
    let common_overrides = match document.get("keybindings") {
        None => parse_section(
            Some(&Value::Object(document.clone())),
            "root",
            definitions,
            &mut diagnostics,
            true,
        ),
        value => parse_section(value, "keybindings", definitions, &mut diagnostics, false),
    };
    let platform_overrides = parse_platforms(&document, definitions, &mut diagnostics);
    let mut merged = common_overrides.clone();
    if let Some(active) = platform_overrides.get(platform) {
        for (action_id, bindings) in active.iter() {
            merged.insert(action_id.to_owned(), bindings.to_vec());
        }
    }
    let overrides = remove_conflicts(definitions, platform, merged, &mut diagnostics);
    KeybindingFileSnapshot {
        path: path.to_string_lossy().into_owned(),
        platform,
        exists: read.exists,
        overrides,
        common_overrides,
        platform_overrides,
        diagnostics,
    }
}

fn unreadable_snapshot(
    path: &Path,
    platform: KeybindingPlatform,
    exists: bool,
    error: Option<&str>,
) -> KeybindingFileSnapshot {
    KeybindingFileSnapshot {
        path: path.to_string_lossy().into_owned(),
        platform,
        exists,
        overrides: KeybindingOverrides::default(),
        common_overrides: KeybindingOverrides::default(),
        platform_overrides: PlatformOverrides::default(),
        diagnostics: vec![diagnostic(
            DiagnosticSeverity::Error,
            format!(
                "Could not read keybindings file: {}",
                error.unwrap_or("unknown error")
            ),
            None,
            None,
        )],
    }
}

fn parse_platforms(
    root: &Map<String, Value>,
    definitions: &[KeybindingDescriptor],
    diagnostics: &mut Vec<KeybindingFileDiagnostic>,
) -> PlatformOverrides {
    let Some(value) = root.get("platforms") else {
        return PlatformOverrides::default();
    };
    let Some(platforms) = value.as_object() else {
        diagnostics.push(diagnostic(
            DiagnosticSeverity::Error,
            "platforms must be an object with darwin, linux, or win32 sections.".to_owned(),
            None,
            Some("platforms".to_owned()),
        ));
        return PlatformOverrides::default();
    };
    let mut output = PlatformOverrides::default();
    for (name, value) in platforms {
        let Some(platform) = platform_from_name(name) else {
            diagnostics.push(diagnostic(
                DiagnosticSeverity::Warning,
                format!("Unknown platform \"{name}\" was ignored."),
                None,
                Some(format!("platforms.{name}")),
            ));
            continue;
        };
        let section = format!("platforms.{name}");
        output.insert(
            platform,
            parse_section(Some(value), &section, definitions, diagnostics, false),
        );
    }
    output
}

fn parse_section(
    value: Option<&Value>,
    section: &str,
    definitions: &[KeybindingDescriptor],
    diagnostics: &mut Vec<KeybindingFileDiagnostic>,
    skip_root_keys: bool,
) -> KeybindingOverrides {
    let Some(value) = value else {
        return KeybindingOverrides::default();
    };
    let Some(object) = value.as_object() else {
        diagnostics.push(diagnostic(
            DiagnosticSeverity::Error,
            format!("{section} must be an object."),
            None,
            Some(section.to_owned()),
        ));
        return KeybindingOverrides::default();
    };
    let mut output = KeybindingOverrides::default();
    for (stored_action_id, value) in object {
        if skip_root_keys && ROOT_KEYS.contains(&stored_action_id.as_str()) {
            continue;
        }
        let Some(action_id) = normalize_action_id(definitions, stored_action_id) else {
            diagnostics.push(diagnostic(
                DiagnosticSeverity::Warning,
                format!("Unknown keybinding action \"{stored_action_id}\" was ignored."),
                Some(stored_action_id.clone()),
                Some(section.to_owned()),
            ));
            continue;
        };
        match normalize_value(definitions, action_id, value) {
            Ok(bindings) => output.insert(action_id.to_owned(), bindings),
            Err(error) => diagnostics.push(diagnostic(
                DiagnosticSeverity::Error,
                format!("Shortcut for \"{action_id}\" was ignored: {error}"),
                Some(action_id.to_owned()),
                Some(section.to_owned()),
            )),
        }
    }
    output
}

fn normalize_value(
    definitions: &[KeybindingDescriptor],
    action_id: &str,
    value: &Value,
) -> Result<Vec<String>, String> {
    match value {
        Value::Null | Value::Bool(false) => Ok(Vec::new()),
        Value::String(value) => normalize_list(definitions, action_id, value),
        Value::Array(values) if values.iter().all(Value::is_string) => normalize_array(
            definitions,
            action_id,
            &values
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_owned)
                .collect::<Vec<_>>(),
        ),
        _ => Err("Use a string, string array, null, or false.".to_owned()),
    }
}

fn remove_conflicts(
    definitions: &[KeybindingDescriptor],
    platform: KeybindingPlatform,
    overrides: KeybindingOverrides,
    diagnostics: &mut Vec<KeybindingFileDiagnostic>,
) -> KeybindingOverrides {
    let mut next = overrides;
    for _ in 0..20 {
        let mut conflicting = Vec::<String>::new();
        for conflict in conflicts::find(definitions, platform, &next) {
            for action_id in conflict.action_ids {
                if next.contains(&action_id) && !conflicting.contains(&action_id) {
                    conflicting.push(action_id);
                }
            }
        }
        if conflicting.is_empty() {
            return next;
        }
        for action_id in &conflicting {
            next.remove(action_id);
        }
        let titles = conflicting
            .iter()
            .map(|action_id| {
                definition(definitions, action_id)
                    .map(|definition| definition.title.as_str())
                    .unwrap_or(action_id)
            })
            .collect::<Vec<_>>()
            .join(", ");
        diagnostics.push(diagnostic(
            DiagnosticSeverity::Error,
            format!("Conflicting custom shortcuts were ignored: {titles}."),
            None,
            None,
        ));
    }
    next
}

fn platform_from_name(name: &str) -> Option<KeybindingPlatform> {
    PLATFORMS
        .iter()
        .copied()
        .find(|platform| platform.name() == name)
}

fn diagnostic(
    severity: DiagnosticSeverity,
    message: String,
    action_id: Option<String>,
    section: Option<String>,
) -> KeybindingFileDiagnostic {
    KeybindingFileDiagnostic {
        severity,
        message,
        action_id,
        section,
    }
}

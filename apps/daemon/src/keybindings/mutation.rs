use std::path::Path;

use serde_json::{Map, Value};

use crate::protocol::KeybindingDescriptor;

use super::KeybindingsError;
use super::conflicts;
use super::document;
use super::model::{KeybindingFileSnapshot, KeybindingOverrides, KeybindingPlatform, definition};
use super::snapshot;
use super::syntax::normalize_array;

const PLATFORMS: &[KeybindingPlatform] = &[
    KeybindingPlatform::Darwin,
    KeybindingPlatform::Linux,
    KeybindingPlatform::Win32,
];

pub(super) fn write_override(
    path: &Path,
    platform: KeybindingPlatform,
    definitions: &[KeybindingDescriptor],
    action_id: &str,
    bindings: Option<&[String]>,
) -> Result<KeybindingFileSnapshot, KeybindingsError> {
    if definition(definitions, action_id).is_none() {
        return Err(KeybindingsError::Operation(format!(
            "Unknown keybinding action \"{action_id}\"."
        )));
    }
    let normalized = bindings
        .map(|bindings| normalize_array(definitions, action_id, bindings))
        .transpose()
        .map_err(KeybindingsError::Operation)?;
    let current = snapshot::read(path, platform, definitions);
    reject_conflict(
        definitions,
        platform,
        action_id,
        normalized.as_deref(),
        &current.overrides,
    )?;
    let read_result = document::read(path);
    let mut root = read_result.document.ok_or_else(|| {
        KeybindingsError::Operation(
            read_result
                .error
                .unwrap_or_else(|| "Could not read keybindings file.".to_owned()),
        )
    })?;
    let common = root
        .get("keybindings")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_else(|| overrides_value(&current.common_overrides));
    root.retain(|key, _| definition(definitions, key).is_none());
    let mut platforms = root
        .get("platforms")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    let mut active = platforms
        .get(platform.name())
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    match normalized {
        Some(bindings) => {
            active.insert(
                action_id.to_owned(),
                Value::Array(bindings.into_iter().map(Value::String).collect()),
            );
        }
        None => {
            active.remove(action_id);
        }
    }
    for known in PLATFORMS {
        if !platforms.get(known.name()).is_some_and(Value::is_object) {
            platforms.insert(known.name().to_owned(), Value::Object(Map::new()));
        }
    }
    platforms.insert(platform.name().to_owned(), Value::Object(active));
    root.insert("version".to_owned(), Value::from(1));
    root.insert("keybindings".to_owned(), Value::Object(common));
    root.insert("platforms".to_owned(), Value::Object(platforms));
    document::write(path, &root)?;
    Ok(snapshot::read(path, platform, definitions))
}

fn reject_conflict(
    definitions: &[KeybindingDescriptor],
    platform: KeybindingPlatform,
    action_id: &str,
    bindings: Option<&[String]>,
    current: &KeybindingOverrides,
) -> Result<(), KeybindingsError> {
    let mut candidate = current.clone();
    match bindings {
        Some(bindings) => candidate.insert(action_id.to_owned(), bindings.to_vec()),
        None => candidate.remove(action_id),
    }
    let conflict = conflicts::find(definitions, platform, &candidate)
        .into_iter()
        .find(|conflict| {
            conflict
                .action_ids
                .iter()
                .any(|candidate| candidate == action_id)
        });
    match conflict {
        Some(conflict) => Err(KeybindingsError::Operation(format!(
            "{} conflicts with another shortcut.",
            conflicts::format_binding(&conflict.binding, platform)
        ))),
        None => Ok(()),
    }
}

fn overrides_value(overrides: &KeybindingOverrides) -> Map<String, Value> {
    overrides
        .iter()
        .map(|(action_id, bindings)| {
            (
                action_id.to_owned(),
                Value::Array(bindings.iter().cloned().map(Value::String).collect()),
            )
        })
        .collect()
}

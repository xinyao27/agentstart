use std::fs;
use std::io::ErrorKind;
use std::path::Path;

use serde_json::Value;

use super::WorkbenchWorktreeMetadata;

const FOLDER_INSTANCE_SEPARATOR: &str = "::workspace:";

pub(super) enum LegacyMetadata {
    Authoritative(Vec<WorkbenchWorktreeMetadata>),
    Unavailable,
}

pub(super) fn read(user_data_path: &Path) -> LegacyMetadata {
    let document = read_document(user_data_path).or_else(|| {
        let legacy_path = user_data_path.join("yiru-data.json");
        parse_file(&legacy_path)
    });
    let Some(metadata) = document
        .as_ref()
        .and_then(Value::as_object)
        .and_then(|document| document.get("worktreeMeta"))
        .and_then(Value::as_object)
    else {
        return LegacyMetadata::Unavailable;
    };
    let entries = metadata
        .iter()
        .map(|(id, value)| {
            decode_entry(id, value).or_else(|| {
                eprintln!("[daemon] Legacy worktree metadata entry is invalid: {id}");
                None
            })
        })
        .collect::<Option<Vec<_>>>();
    match entries {
        Some(entries) => LegacyMetadata::Authoritative(entries),
        None => LegacyMetadata::Unavailable,
    }
}

fn read_document(user_data_path: &Path) -> Option<Value> {
    parse_file(&user_data_path.join("yiru-data-worktrees.json"))
}

fn parse_file(path: &Path) -> Option<Value> {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == ErrorKind::NotFound => return None,
        Err(error) => {
            eprintln!(
                "[daemon] Legacy worktree metadata read failed at {}: {error}",
                path.display()
            );
            return None;
        }
    };
    match serde_json::from_slice(&bytes) {
        Ok(document) => Some(document),
        Err(error) => {
            eprintln!(
                "[daemon] Legacy worktree metadata is invalid at {}: {error}",
                path.display()
            );
            None
        }
    }
}

fn decode_entry(id: &str, value: &Value) -> Option<WorkbenchWorktreeMetadata> {
    let separator = id.find("::")?;
    let project_id = id[..separator].to_owned();
    let encoded_path = &id[separator + 2..];
    let path = strip_folder_instance(encoded_path).to_owned();
    if project_id.is_empty() || path.is_empty() {
        return None;
    }
    let object = value.as_object()?;
    let display_name = object
        .get("displayName")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned();
    let host_id = object
        .get("hostId")
        .and_then(Value::as_str)
        .filter(|host_id| !host_id.is_empty())
        .map(str::to_owned);
    let updated_at = ["lastActivityAt", "createdAt"]
        .into_iter()
        .filter_map(|field| object.get(field).and_then(Value::as_i64))
        .max()
        .unwrap_or(0);
    Some(WorkbenchWorktreeMetadata {
        display_name,
        host_id,
        id: id.to_owned(),
        metadata: object.clone(),
        path,
        project_id,
        updated_at,
    })
}

fn strip_folder_instance(value: &str) -> &str {
    let Some(separator) = value.rfind(FOLDER_INSTANCE_SEPARATOR) else {
        return value;
    };
    let suffix = &value[separator + FOLDER_INSTANCE_SEPARATOR.len()..];
    if is_uuid_shape(suffix) {
        &value[..separator]
    } else {
        value
    }
}

fn is_uuid_shape(value: &str) -> bool {
    value.len() == 36
        && value
            .bytes()
            .enumerate()
            .all(|(index, byte)| [8, 13, 18, 23].contains(&index) == (byte == b'-'))
        && value
            .bytes()
            .enumerate()
            .all(|(index, byte)| [8, 13, 18, 23].contains(&index) || byte.is_ascii_hexdigit())
}

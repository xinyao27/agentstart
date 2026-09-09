use std::fs;
use std::path::{Path, PathBuf};

use serde_json::{Map, Value};

use crate::atomic_file_replace;

use super::KeybindingsError;
use super::model::KeybindingPlatform;

pub(super) struct ReadDocument {
    pub(super) exists: bool,
    pub(super) document: Option<Map<String, Value>>,
    pub(super) error: Option<String>,
}

pub(super) fn empty() -> Map<String, Value> {
    let platforms = Map::from_iter([
        ("darwin".to_owned(), Value::Object(Map::new())),
        ("linux".to_owned(), Value::Object(Map::new())),
        ("win32".to_owned(), Value::Object(Map::new())),
    ]);
    Map::from_iter([
        ("version".to_owned(), Value::from(1)),
        ("keybindings".to_owned(), Value::Object(Map::new())),
        ("platforms".to_owned(), Value::Object(platforms)),
    ])
}

pub(super) fn ensure(path: &Path) -> Result<(), KeybindingsError> {
    if !path.exists() {
        write(path, &empty())?;
    }
    Ok(())
}

pub(super) fn migrate_legacy(
    path: &Path,
    platform: KeybindingPlatform,
    legacy: Option<Value>,
) -> Result<(), KeybindingsError> {
    if path.exists() {
        return Ok(());
    }
    let Some(Value::Object(legacy)) = legacy else {
        return Ok(());
    };
    if legacy.is_empty() {
        return Ok(());
    }
    let mut document = empty();
    let mut platforms = document
        .remove("platforms")
        .and_then(|value| value.as_object().cloned())
        .unwrap_or_default();
    platforms.insert(platform.name().to_owned(), Value::Object(legacy));
    document.insert("platforms".to_owned(), Value::Object(platforms));
    write(path, &document)
}

pub(super) fn read(path: &Path) -> ReadDocument {
    if !path.exists() {
        return ReadDocument {
            exists: false,
            document: Some(empty()),
            error: None,
        };
    }
    let contents = match fs::read(path) {
        Ok(contents) => contents,
        Err(error) => {
            return ReadDocument {
                exists: true,
                document: None,
                error: Some(error.to_string()),
            };
        }
    };
    match serde_json::from_slice::<Value>(&contents) {
        Ok(Value::Object(document)) => ReadDocument {
            exists: true,
            document: Some(document),
            error: None,
        },
        Ok(_) => ReadDocument {
            exists: true,
            document: None,
            error: Some("Keybindings file must contain a JSON object.".to_owned()),
        },
        Err(error) => ReadDocument {
            exists: true,
            document: None,
            error: Some(error.to_string()),
        },
    }
}

pub(super) fn write(path: &Path, document: &Map<String, Value>) -> Result<(), KeybindingsError> {
    let directory = path.parent().ok_or(KeybindingsError::StoragePath)?;
    fs::create_dir_all(directory)?;
    let temporary = temporary_path(path);
    let result = (|| {
        let mut payload = serde_json::to_vec_pretty(document)?;
        payload.push(b'\n');
        fs::write(&temporary, payload)?;
        atomic_file_replace::replace(&temporary, path)?;
        Ok::<_, KeybindingsError>(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

fn temporary_path(path: &Path) -> PathBuf {
    let mut value = path.as_os_str().to_owned();
    value.push(".tmp");
    value.into()
}

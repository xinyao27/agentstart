use std::fs;
use std::path::Path;

use serde_json::{Map, Value};

use super::{BACKUP_COUNT, backup_path, temporary_path};
use crate::atomic_file_replace;
use crate::workspace_session::{WorkspaceSessionError, wire};

pub(super) fn read_recoverable(
    path: &Path,
) -> Result<Option<Map<String, Value>>, WorkspaceSessionError> {
    match read_document(path) {
        Ok(Some(document)) => Ok(Some(document)),
        Ok(None) if !has_backup(path) => Ok(None),
        Ok(None) if has_backup(path) => recover_backup(path),
        Err(error) if has_backup(path) => {
            recover_backup(path)?.map_or(Err(error), |value| Ok(Some(value)))
        }
        Err(error) => Err(error),
        Ok(None) => Ok(None),
    }
}

fn recover_backup(path: &Path) -> Result<Option<Map<String, Value>>, WorkspaceSessionError> {
    for index in 0..BACKUP_COUNT {
        let backup = backup_path(path, index);
        let Ok(Some(document)) = read_document(&backup) else {
            continue;
        };
        if let Err(error) = restore_backup(&backup, path) {
            eprintln!("[persistence] Failed to restore session backup in place: {error}");
        }
        return Ok(Some(document));
    }
    Err(WorkspaceSessionError::InvalidDocument)
}

fn restore_backup(backup: &Path, path: &Path) -> Result<(), WorkspaceSessionError> {
    let temporary = temporary_path(path, 0);
    let result = fs::copy(backup, &temporary)
        .map(|_| ())
        .and_then(|()| atomic_file_replace::replace(&temporary, path));
    if result.is_err() {
        let _ = fs::remove_file(temporary);
    }
    result.map_err(Into::into)
}

fn read_document(path: &Path) -> Result<Option<Map<String, Value>>, WorkspaceSessionError> {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.into()),
    };
    let document = serde_json::from_slice::<Value>(&bytes)?;
    let Some(document) = document.as_object().cloned() else {
        return Err(WorkspaceSessionError::InvalidDocument);
    };
    super::super::version::SessionVersion::load(&document)?;
    Ok(Some(wire::sanitize_document(document)))
}

fn has_backup(path: &Path) -> bool {
    (0..BACKUP_COUNT).any(|index| backup_path(path, index).exists())
}

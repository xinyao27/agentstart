use std::ffi::OsString;
use std::path::{Path, PathBuf};

use serde_json::Value;

use super::index::{self, ProfileError};

pub(super) fn ensure_active(root: &Path) -> Result<PathBuf, ProfileError> {
    crate::transport::secure_file::ensure_secure_directory(root)?;
    let index = index::load(root)?;
    super::legacy::migrate(root)?;
    index::ensure_profile_directories(root, &index)?;
    index::ensure_profile_directory(root, &index.active_profile_id)
}

pub(super) fn clear_active_runtime_environments(
    root: &Path,
    environment_ids: &[String],
) -> Result<(), ProfileError> {
    let profile_index = index::load(root)?;
    for directory in index::profile_directories(root, &profile_index)? {
        for file_name in ["yiru-data-settings.json", "yiru-data.json"] {
            let primary = directory.join(file_name);
            clear_settings_file(&primary, environment_ids)?;
            for index in 0..5 {
                let mut backup = OsString::from(primary.as_os_str());
                backup.push(format!(".bak.{index}"));
                clear_settings_file(Path::new(&backup), environment_ids)?;
            }
        }
    }
    Ok(())
}

fn clear_settings_file(path: &Path, environment_ids: &[String]) -> Result<(), ProfileError> {
    let Some(bytes) = super::leaf_file::read(path, 16 * 1024 * 1024)? else {
        return Ok(());
    };
    let mut document = serde_json::from_slice::<Value>(&bytes)?;
    let Some(settings) = document.get_mut("settings").and_then(Value::as_object_mut) else {
        return Err(ProfileError::MigrationConflict(path.to_owned()));
    };
    let should_clear = settings
        .get("activeRuntimeEnvironmentId")
        .and_then(Value::as_str)
        .is_some_and(|active| environment_ids.iter().any(|id| id == active));
    if should_clear {
        settings.insert("activeRuntimeEnvironmentId".to_owned(), Value::Null);
        write_settings(path, &document)?;
    }
    Ok(())
}

fn write_settings(path: &Path, document: &Value) -> Result<(), ProfileError> {
    let payload = serde_json::to_vec(document)?;
    super::leaf_file::write(path, &payload)
}

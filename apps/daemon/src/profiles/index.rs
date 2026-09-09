use std::path::{Path, PathBuf};
use std::time::{SystemTime, SystemTimeError, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;

const INDEX_FILE: &str = "yiru-profile-index.json";
const DEFAULT_ID: &str = "local-default";
const DEFAULT_NAME: &str = "Personal";
const MAX_INDEX_BYTES: u64 = 1024 * 1024;
const MAX_PROFILES: usize = 100;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProfileSummary {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) avatar: ProfileAvatar,
    pub(crate) kind: String,
    pub(crate) created_at: i64,
    pub(crate) updated_at: i64,
    pub(crate) last_opened_at: i64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub(crate) struct ProfileAvatar {
    kind: String,
    initials: String,
    color: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProfileIndex {
    schema_version: i64,
    pub(crate) active_profile_id: String,
    pub(crate) profiles: Vec<ProfileSummary>,
}

#[derive(Debug, Error)]
pub(crate) enum ProfileError {
    #[error("invalid_yiru_profile_id")]
    InvalidId,
    #[error("unknown_yiru_profile")]
    Unknown,
    #[error("profile clock failed: {0}")]
    Clock(#[from] SystemTimeError),
    #[error("profile random identifier failed: {0}")]
    Random(#[from] getrandom::Error),
    #[error("profile I/O failed: {0}")]
    Io(#[from] std::io::Error),
    #[error("profile JSON failed: {0}")]
    Json(#[from] serde_json::Error),
    #[error("profile SQLite migration failed: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("legacy profile migration conflict at {0}")]
    MigrationConflict(PathBuf),
    #[error("legacy profile migration capacity exceeded")]
    MigrationCapacity,
    #[error("legacy profile migration secure journal failed: {0}")]
    SecureFile(#[from] crate::transport::secure_file::SecureFileError),
}

pub(crate) fn load(root: &Path) -> Result<ProfileIndex, ProfileError> {
    let path = root.join(INDEX_FILE);
    let primary = read(&path)?;
    let backup = read(&backup_path(&path))?;
    if let Some(result) = primary.as_ref().or(backup.as_ref()) {
        if result.migrated_cloud {
            write(root, &result.index)?;
        }
        purge_cloud_credentials(root, &result.index)?;
        return Ok(result.index.clone());
    }
    let index = ProfileIndex::new(now_millis()?);
    write(root, &index)?;
    Ok(index)
}

pub(crate) fn list_value(index: &ProfileIndex) -> Value {
    serde_json::json!({
        "activeProfileId": index.active_profile_id,
        "profiles": index.profiles,
        "multiProfileUi": std::env::var("YIRU_MULTI_PROFILE_UI").as_deref() == Ok("1")
    })
}

pub(crate) fn create(root: &Path, name: Option<&str>) -> Result<Value, ProfileError> {
    let mut index = load(root)?;
    if index.profiles.len() >= MAX_PROFILES {
        return Err(ProfileError::InvalidId);
    }
    let now = now_millis()?;
    let name = sanitize_name(name);
    let profile = ProfileSummary {
        id: format!("local-{}", random_uuid()?),
        name: name.clone(),
        avatar: ProfileAvatar {
            kind: "initials".to_owned(),
            initials: initial(&name),
            color: "neutral".to_owned(),
        },
        kind: "local".to_owned(),
        created_at: now,
        updated_at: now,
        last_opened_at: now,
    };
    ensure_profile_directory(root, &profile.id)?;
    index.profiles.push(profile.clone());
    write(root, &index)?;
    Ok(serde_json::json!({
        "activeProfileId": index.active_profile_id,
        "profiles": index.profiles,
        "profile": profile
    }))
}

pub(crate) fn activate(root: &Path, profile_id: &str) -> Result<bool, ProfileError> {
    validate_id(profile_id)?;
    let mut index = load(root)?;
    let profile_position = index
        .profiles
        .iter()
        .position(|profile| profile.id == profile_id)
        .ok_or(ProfileError::Unknown)?;
    ensure_profile_directory(root, profile_id)?;
    if index.active_profile_id == profile_id {
        return Ok(false);
    }
    let now = now_millis()?;
    let profile = &mut index.profiles[profile_position];
    profile.updated_at = now;
    profile.last_opened_at = now;
    index.active_profile_id = profile_id.to_owned();
    write(root, &index)?;
    Ok(true)
}

pub(crate) fn profile_directory(root: &Path, profile_id: &str) -> PathBuf {
    root.join("profiles").join(profile_id)
}

pub(super) fn ensure_profile_directory(
    root: &Path,
    profile_id: &str,
) -> Result<PathBuf, ProfileError> {
    validate_id(profile_id)?;
    crate::transport::secure_file::ensure_secure_directory(&root.join("profiles"))?;
    let directory = profile_directory(root, profile_id);
    crate::transport::secure_file::ensure_secure_directory(&directory)?;
    Ok(directory)
}

pub(super) fn ensure_profile_directories(
    root: &Path,
    index: &ProfileIndex,
) -> Result<(), ProfileError> {
    for directory in profile_directories(root, index)? {
        let profile_id = directory
            .file_name()
            .and_then(std::ffi::OsStr::to_str)
            .ok_or(ProfileError::InvalidId)?;
        ensure_profile_directory(root, profile_id)?;
    }
    Ok(())
}

pub(crate) fn active_profile_id(root: &Path) -> Result<String, ProfileError> {
    Ok(load(root)?.active_profile_id)
}

pub(crate) fn validate_known(root: &Path, profile_id: &str) -> Result<(), ProfileError> {
    validate_id(profile_id)?;
    if load(root)?
        .profiles
        .iter()
        .any(|profile| profile.id == profile_id)
    {
        Ok(())
    } else {
        Err(ProfileError::Unknown)
    }
}

#[derive(Clone)]
struct IndexReadResult {
    index: ProfileIndex,
    migrated_cloud: bool,
}

fn read(path: &Path) -> Result<Option<IndexReadResult>, ProfileError> {
    let Some(bytes) = super::leaf_file::read(path, MAX_INDEX_BYTES)? else {
        return Ok(None);
    };
    Ok(serde_json::from_slice::<Value>(&bytes)
        .ok()
        .and_then(normalize))
}

fn normalize(value: Value) -> Option<IndexReadResult> {
    let object = value.as_object()?;
    let raw_profiles = object.get("profiles")?.as_array()?;
    let mut profiles = Vec::new();
    let mut migrated_cloud = false;
    for raw in raw_profiles.iter().take(MAX_PROFILES) {
        let had_cloud = raw.get("kind").and_then(Value::as_str) == Some("cloud-linked")
            || raw.get("cloud").is_some();
        let Ok(mut profile) = serde_json::from_value::<ProfileSummary>(raw.clone()) else {
            continue;
        };
        if validate_id(&profile.id).is_err()
            || profile.name.is_empty()
            || !matches!(profile.kind.as_str(), "local" | "cloud-linked")
            || profile.avatar.kind != "initials"
            || profile.avatar.initials.is_empty()
            || profile.avatar.color != "neutral"
        {
            continue;
        }
        profile.kind = "local".to_owned();
        migrated_cloud |= had_cloud;
        profiles.push(profile);
    }
    let requested = object.get("activeProfileId").and_then(Value::as_str);
    let active = requested
        .and_then(|id| profiles.iter().find(|profile| profile.id == id))
        .or_else(|| profiles.first())?;
    Some(IndexReadResult {
        index: ProfileIndex {
            schema_version: 1,
            active_profile_id: active.id.clone(),
            profiles,
        },
        migrated_cloud,
    })
}

fn write(root: &Path, index: &ProfileIndex) -> Result<(), ProfileError> {
    crate::transport::secure_file::ensure_secure_directory(root)?;
    let path = root.join(INDEX_FILE);
    let backup = backup_path(&path);
    if let Some(previous) = super::leaf_file::read(&path, MAX_INDEX_BYTES)?
        && serde_json::from_slice::<Value>(&previous)
            .ok()
            .and_then(normalize)
            .is_some()
    {
        super::leaf_file::write(&backup, &previous)?;
    }
    let payload = serde_json::to_vec_pretty(index)?;
    super::leaf_file::write(&path, &payload)
}

fn purge_cloud_credentials(root: &Path, index: &ProfileIndex) -> Result<(), ProfileError> {
    for directory in profile_directories(root, index)? {
        for file_name in ["account-session.json.enc", "account-session-mutation.json"] {
            let path = directory.join(file_name);
            match std::fs::remove_file(path) {
                Ok(()) => {}
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => return Err(error.into()),
            }
        }
    }
    Ok(())
}

pub(super) fn profile_directories(
    root: &Path,
    index: &ProfileIndex,
) -> Result<Vec<PathBuf>, ProfileError> {
    let mut profile_ids = index
        .profiles
        .iter()
        .map(|profile| profile.id.clone())
        .collect::<Vec<_>>();
    let profiles_root = root.join("profiles");
    match std::fs::symlink_metadata(&profiles_root) {
        Ok(metadata) if metadata.file_type().is_dir() => {
            let entries = std::fs::read_dir(&profiles_root)?;
            for (entry_index, entry) in entries.enumerate() {
                let entry = entry?;
                if entry_index >= MAX_PROFILES {
                    return Err(ProfileError::MigrationCapacity);
                }
                if entry.file_type()?.is_dir() {
                    let name = entry.file_name().to_string_lossy().into_owned();
                    if validate_id(&name).is_ok() && !profile_ids.contains(&name) {
                        if profile_ids.len() >= MAX_PROFILES {
                            return Err(ProfileError::MigrationCapacity);
                        }
                        profile_ids.push(name);
                    }
                }
            }
        }
        Ok(_) => return Err(ProfileError::MigrationConflict(profiles_root)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(error.into()),
    }
    profile_ids.sort();
    let directories = profile_ids
        .into_iter()
        .map(|profile_id| profile_directory(root, &profile_id))
        .collect::<Vec<_>>();
    for directory in &directories {
        match std::fs::symlink_metadata(directory) {
            Ok(metadata) if metadata.file_type().is_dir() => {}
            Ok(_) => return Err(ProfileError::MigrationConflict(directory.clone())),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.into()),
        }
    }
    Ok(directories)
}

fn backup_path(path: &Path) -> PathBuf {
    path.with_extension("json.bak")
}

fn validate_id(value: &str) -> Result<(), ProfileError> {
    let valid = !value.is_empty()
        && value.len() <= 128
        && value.bytes().enumerate().all(|(index, byte)| {
            byte.is_ascii_alphanumeric() || (index > 0 && matches!(byte, b'_' | b'-'))
        });
    valid.then_some(()).ok_or(ProfileError::InvalidId)
}

fn sanitize_name(value: Option<&str>) -> String {
    let value = value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("New Profile");
    value.chars().take(80).collect()
}

fn initial(name: &str) -> String {
    name.chars()
        .find(|character| character.is_ascii_alphanumeric())
        .unwrap_or_else(|| DEFAULT_NAME.chars().next().unwrap_or('P'))
        .to_ascii_uppercase()
        .to_string()
}

fn now_millis() -> Result<i64, ProfileError> {
    let value = SystemTime::now().duration_since(UNIX_EPOCH)?.as_millis();
    i64::try_from(value).map_err(|_| ProfileError::InvalidId)
}

fn random_uuid() -> Result<String, ProfileError> {
    let mut bytes = [0_u8; 16];
    getrandom::fill(&mut bytes)?;
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    Ok(format!(
        "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        bytes[0],
        bytes[1],
        bytes[2],
        bytes[3],
        bytes[4],
        bytes[5],
        bytes[6],
        bytes[7],
        bytes[8],
        bytes[9],
        bytes[10],
        bytes[11],
        bytes[12],
        bytes[13],
        bytes[14],
        bytes[15]
    ))
}

impl ProfileIndex {
    fn new(now: i64) -> Self {
        Self {
            schema_version: 1,
            active_profile_id: DEFAULT_ID.to_owned(),
            profiles: vec![ProfileSummary {
                id: DEFAULT_ID.to_owned(),
                name: DEFAULT_NAME.to_owned(),
                avatar: ProfileAvatar {
                    kind: "initials".to_owned(),
                    initials: "P".to_owned(),
                    color: "neutral".to_owned(),
                },
                kind: "local".to_owned(),
                created_at: now,
                updated_at: now,
                last_opened_at: now,
            }],
        }
    }
}

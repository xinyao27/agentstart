use std::error::Error;
use std::fs;
use std::io;
use std::path::Path;

use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as BASE64;
use serde::Serialize;
use serde_json::Value;
use thiserror::Error;
use x25519_dalek::{X25519_BASEPOINT_BYTES, x25519};

use crate::transport::secure_file;

const KEYPAIR_FILE_NAME: &str = "mobile-e2ee-keypair.json";
const KEYPAIR_VERSION: u64 = 1;
const MAX_KEYPAIR_FILE_BYTES: u64 = 8 * 1_024;
const MAX_PROFILE_SOURCES: usize = 100;

#[derive(Clone)]
pub struct MobileKeypair {
    pub public_key_b64: String,
    pub(crate) secret_key: [u8; 32],
}

#[derive(Debug, Error)]
pub enum MobileKeypairError {
    #[error("mobile keypair I/O failed: {0}")]
    Io(#[from] io::Error),
    #[error("mobile keypair file is invalid")]
    Invalid,
    #[error("mobile keypair installation migration found conflicting profile identities")]
    InstallationConflict,
    #[error("mobile keypair installation migration source capacity exceeded")]
    MigrationCapacity,
    #[error("mobile keypair random identifier generation failed: {0}")]
    Random(#[from] getrandom::Error),
    #[error("mobile keypair secure file operation failed")]
    SecureFile(#[source] Box<dyn Error + Send + Sync>),
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct KeypairFile<'a> {
    public_key_b64: &'a str,
    secret_key_b64: &'a str,
    version: u64,
}

pub fn load_or_create_keypair(user_data_path: &Path) -> Result<MobileKeypair, MobileKeypairError> {
    let path = user_data_path.join(KEYPAIR_FILE_NAME);
    if let Some(keypair) = read_keypair(&path)? {
        return Ok(keypair);
    }
    let mut secret_key = [0_u8; 32];
    loop {
        getrandom::fill(&mut secret_key)?;
        if secret_key.iter().any(|byte| *byte != 0) {
            break;
        }
    }
    let public_key = x25519(secret_key, X25519_BASEPOINT_BYTES);
    let public_key_b64 = BASE64.encode(public_key);
    let secret_key_b64 = BASE64.encode(secret_key);
    write_keypair(&path, &public_key_b64, &secret_key_b64)?;
    Ok(MobileKeypair {
        public_key_b64,
        secret_key,
    })
}

pub(crate) fn migrate_keypair_to_installation(
    installation_root: &Path,
) -> Result<(), MobileKeypairError> {
    let target = installation_root.join(KEYPAIR_FILE_NAME);
    let mut canonical = read_keypair(&target)?;
    let profiles_root = installation_root.join("profiles");
    match fs::symlink_metadata(&profiles_root) {
        Ok(metadata) if metadata.file_type().is_dir() => {}
        Ok(_) => return Err(MobileKeypairError::InstallationConflict),
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error.into()),
    }
    let entries = fs::read_dir(&profiles_root)?;
    let mut sources = Vec::new();
    for (entry_index, entry) in entries.enumerate() {
        let entry = entry?;
        if entry_index >= MAX_PROFILE_SOURCES {
            return Err(MobileKeypairError::MigrationCapacity);
        }
        if !entry.file_type()?.is_dir() {
            continue;
        }
        let source = entry.path().join(KEYPAIR_FILE_NAME);
        let Some(candidate) = read_keypair(&source)? else {
            continue;
        };
        if canonical
            .as_ref()
            .is_some_and(|existing| !same_keypair(existing, &candidate))
        {
            return Err(MobileKeypairError::InstallationConflict);
        }
        canonical = Some(candidate);
        sources.push(source);
    }
    let Some(canonical) = canonical else {
        return Ok(());
    };
    match read_keypair(&target)? {
        Some(existing) if same_keypair(&existing, &canonical) => {}
        Some(_) => return Err(MobileKeypairError::InstallationConflict),
        None => {
            write_keypair(
                &target,
                &canonical.public_key_b64,
                &BASE64.encode(canonical.secret_key),
            )?;
        }
    }
    for source in sources {
        match fs::remove_file(source) {
            Ok(()) => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.into()),
        }
    }
    Ok(())
}

fn write_keypair(
    path: &Path,
    public_key_b64: &str,
    secret_key_b64: &str,
) -> Result<(), MobileKeypairError> {
    secure_file::write_json(
        path,
        &KeypairFile {
            public_key_b64,
            secret_key_b64,
            version: KEYPAIR_VERSION,
        },
    )
    .map_err(MobileKeypairError::secure_file)
}

fn same_keypair(left: &MobileKeypair, right: &MobileKeypair) -> bool {
    left.public_key_b64 == right.public_key_b64 && left.secret_key == right.secret_key
}

impl MobileKeypairError {
    fn secure_file(source: impl Error + Send + Sync + 'static) -> Self {
        Self::SecureFile(Box::new(source))
    }
}

fn read_keypair(path: &Path) -> Result<Option<MobileKeypair>, MobileKeypairError> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.into()),
    };
    if !metadata.file_type().is_file() || metadata.len() > MAX_KEYPAIR_FILE_BYTES {
        return Err(MobileKeypairError::Invalid);
    }
    let contents = fs::read_to_string(path)?;
    let value =
        serde_json::from_str::<Value>(&contents).map_err(|_| MobileKeypairError::Invalid)?;
    let Some(object) = value.as_object() else {
        return Err(MobileKeypairError::Invalid);
    };
    if object.get("version").and_then(Value::as_u64) != Some(KEYPAIR_VERSION) {
        return Err(MobileKeypairError::Invalid);
    }
    let Some(public_key_b64) = object.get("publicKeyB64").and_then(Value::as_str) else {
        return Err(MobileKeypairError::Invalid);
    };
    let Some(secret_key_b64) = object.get("secretKeyB64").and_then(Value::as_str) else {
        return Err(MobileKeypairError::Invalid);
    };
    let public_key = BASE64
        .decode(public_key_b64)
        .map_err(|_| MobileKeypairError::Invalid)?;
    let secret_key = BASE64
        .decode(secret_key_b64)
        .map_err(|_| MobileKeypairError::Invalid)?;
    let Ok(public_key) = <[u8; 32]>::try_from(public_key) else {
        return Err(MobileKeypairError::Invalid);
    };
    let Ok(secret_key) = <[u8; 32]>::try_from(secret_key) else {
        return Err(MobileKeypairError::Invalid);
    };
    if public_key != x25519(secret_key, X25519_BASEPOINT_BYTES) {
        return Err(MobileKeypairError::Invalid);
    }
    secure_file::harden_existing_file(path).map_err(MobileKeypairError::secure_file)?;
    Ok(Some(MobileKeypair {
        public_key_b64: public_key_b64.to_owned(),
        secret_key,
    }))
}

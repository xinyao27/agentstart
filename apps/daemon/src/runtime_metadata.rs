use std::fs;
use std::io;
use std::path::Path;

use serde::Serialize;
use serde_json::Value;
use thiserror::Error;

use crate::process_liveness::is_process_running;
use crate::transport::secure_file::{self, SecureFileError};

const RUNTIME_METADATA_FILE_NAME: &str = "yiru-runtime.json";

pub(crate) struct RuntimeMetadata {
    pub pid: u32,
    runtime_id: String,
}

impl RuntimeMetadata {
    pub(crate) fn runtime_id(&self) -> &str {
        &self.runtime_id
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PublishedRuntimeMetadata<'a> {
    pub auth_token: Option<&'a str>,
    pub pid: u32,
    pub runtime_id: &'a str,
    pub started_at: i64,
    pub transports: Vec<PublishedRuntimeTransport<'a>>,
}

#[derive(Serialize)]
pub(crate) struct PublishedRuntimeTransport<'a> {
    pub endpoint: &'a str,
    pub kind: &'static str,
}

#[derive(Debug, Error)]
pub(crate) enum RuntimeMetadataError {
    #[error(transparent)]
    SecureFile(#[from] SecureFileError),
    #[error("runtime metadata cleanup failed: {0}")]
    Cleanup(#[from] io::Error),
}

pub(crate) fn read(user_data_path: &Path) -> Option<RuntimeMetadata> {
    let contents = fs::read_to_string(user_data_path.join(RUNTIME_METADATA_FILE_NAME)).ok()?;
    let value = serde_json::from_str::<Value>(&contents).ok()?;
    parse(value)
}

pub(crate) fn read_live(user_data_path: &Path) -> Option<RuntimeMetadata> {
    let metadata = read(user_data_path)?;
    is_process_running(metadata.pid).then_some(metadata)
}

pub(crate) fn write(
    user_data_path: &Path,
    metadata: &PublishedRuntimeMetadata<'_>,
) -> Result<(), RuntimeMetadataError> {
    secure_file::write_json(&runtime_metadata_path(user_data_path), metadata)?;
    Ok(())
}

pub(crate) fn clear_if_owned(
    user_data_path: &Path,
    owned_pid: u32,
    owned_runtime_id: &str,
) -> Result<(), RuntimeMetadataError> {
    let Some(current) = read(user_data_path) else {
        return Ok(());
    };
    if current.pid != owned_pid || current.runtime_id != owned_runtime_id {
        return Ok(());
    }
    match fs::remove_file(runtime_metadata_path(user_data_path)) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.into()),
    }
}

fn parse(value: Value) -> Option<RuntimeMetadata> {
    let object = value.as_object()?;
    let runtime_id = object.get("runtimeId")?.as_str()?.to_owned();
    let pid = integer_u32(object.get("pid")?)?;
    object.get("startedAt")?.as_f64()?;
    match object.get("authToken")? {
        Value::Null => None,
        value => Some(value.as_str()?.to_owned()),
    };
    let transport_value = object
        .get("transports")
        .or_else(|| object.get("transport"))?;
    let has_transport = transport_value
        .as_array()
        .map(|items| items.iter().any(is_transport))
        .unwrap_or_else(|| is_transport(transport_value));
    if !has_transport {
        return None;
    }
    Some(RuntimeMetadata { pid, runtime_id })
}

fn is_transport(value: &Value) -> bool {
    let Some(object) = value.as_object() else {
        return false;
    };
    if object.get("endpoint").and_then(Value::as_str).is_none() {
        return false;
    }
    matches!(
        object.get("kind").and_then(Value::as_str),
        Some("named-pipe" | "unix" | "websocket")
    )
}

fn integer_u32(value: &Value) -> Option<u32> {
    let value = value.as_f64()?;
    if !value.is_finite() || value.fract() != 0.0 || !(0.0..=f64::from(u32::MAX)).contains(&value) {
        return None;
    }
    Some(value as u32)
}

fn runtime_metadata_path(user_data_path: &Path) -> std::path::PathBuf {
    user_data_path.join(RUNTIME_METADATA_FILE_NAME)
}

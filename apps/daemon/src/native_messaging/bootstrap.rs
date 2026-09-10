use std::fs;
use std::io;
use std::path::Path;
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::Number;
use thiserror::Error;

use crate::runtime_metadata::{self, RuntimeMetadata};
use crate::transport::secure_file::{self, SecureFileError};

use super::install::EXTENSION_ORIGIN;

const EXTENSION_BOOTSTRAP_FILE_NAME: &str = "extension-bootstrap.json";
const DEV_SUPERVISOR_DIRECTORY_NAME: &str = "dev-daemon-supervisor";
const DEV_SUPERVISOR_LEASE_FILE_NAME: &str = "lease.json";
pub(crate) const RPC_PROTOCOL: &str = "agentstart-protobuf-v2";
const DAEMON_START_TIMEOUT: Duration = Duration::from_secs(10);
const DAEMON_FAST_POLL_DURATION: Duration = Duration::from_secs(1);
const DAEMON_FAST_POLL_INTERVAL: Duration = Duration::from_millis(10);
const DAEMON_START_POLL_INTERVAL: Duration = Duration::from_millis(50);
const DEV_SUPERVISOR_HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Debug)]
pub(super) struct ExtensionBootstrap {
    pub auth_token: String,
    pub endpoint: String,
    pub protocol_version: Number,
    pub rpc_protocol: String,
    pub runtime_id: String,
}

pub(super) struct LiveBootstrap {
    pub bootstrap: ExtensionBootstrap,
    pub daemon_started: bool,
}

pub(crate) struct BootstrapConnection {
    pub(crate) auth_token: String,
    pub(crate) endpoint: String,
    pub(crate) protocol_version: Number,
    pub(crate) runtime_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PublishedExtensionBootstrap<'a> {
    pub auth_token: &'a str,
    pub endpoint: &'a str,
    pub protocol_version: u32,
    pub rpc_protocol: &'static str,
    pub runtime_id: &'a str,
}

#[derive(Debug, Error)]
pub(crate) enum BootstrapError {
    #[error("{0}")]
    Path(#[from] crate::paths::PathResolutionError),
    #[error("extension_bootstrap_invalid")]
    Invalid,
    #[error("extension bootstrap I/O failed: {0}")]
    Io(#[from] io::Error),
    #[error("extension bootstrap JSON failed: {0}")]
    Json(#[from] serde_json::Error),
    #[error(transparent)]
    SecureFile(#[from] SecureFileError),
    #[error("daemon_start_timeout")]
    DaemonStartTimeout,
    #[cfg(target_os = "macos")]
    #[error(
        "bundled_daemon_custom_data_requires_app_start: start AgentStart with the same data directory first"
    )]
    CustomDataRequiresAppStart,
}

pub(crate) fn write(
    user_data_path: &Path,
    pid: u32,
    bootstrap: &PublishedExtensionBootstrap<'_>,
) -> Result<(), BootstrapError> {
    if bootstrap.rpc_protocol != RPC_PROTOCOL {
        return Err(BootstrapError::Invalid);
    }
    secure_file::write_json(&extension_bootstrap_path(user_data_path, pid), bootstrap)?;
    Ok(())
}

pub(crate) fn clear_if_owned(
    user_data_path: &Path,
    pid: u32,
    owned_runtime_id: &str,
) -> Result<(), BootstrapError> {
    let path = extension_bootstrap_path(user_data_path, pid);
    let Ok(bootstrap) = read_extension_bootstrap_path(&path) else {
        return Ok(());
    };
    if bootstrap.runtime_id != owned_runtime_id {
        return Ok(());
    }
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.into()),
    }
}

pub(crate) fn read_connection(
    user_data_path: &Path,
    pid: u32,
) -> Result<BootstrapConnection, BootstrapError> {
    let bootstrap = read_extension_bootstrap_path(&extension_bootstrap_path(user_data_path, pid))?;
    Ok(BootstrapConnection {
        auth_token: bootstrap.auth_token,
        endpoint: bootstrap.endpoint,
        protocol_version: bootstrap.protocol_version,
        runtime_id: bootstrap.runtime_id,
    })
}

pub(crate) fn read_connection_if_exists(
    user_data_path: &Path,
    pid: u32,
) -> Result<Option<BootstrapConnection>, BootstrapError> {
    match read_connection(user_data_path, pid) {
        Ok(bootstrap) => Ok(Some(bootstrap)),
        Err(BootstrapError::Io(error)) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error),
    }
}

pub(super) fn read_or_start() -> Result<LiveBootstrap, BootstrapError> {
    let user_data_path = crate::paths::resolve_default_user_data_path()?;
    let (metadata, daemon_started) = match runtime_metadata::read_live(&user_data_path) {
        Some(metadata) => (metadata, false),
        None if dev_supervisor_is_live(&user_data_path) => {
            (wait_for_daemon(&user_data_path)?, false)
        }
        None => (start_daemon_and_wait(&user_data_path)?, true),
    };
    let bootstrap = read_extension_bootstrap(&user_data_path, &metadata)?;
    Ok(LiveBootstrap {
        bootstrap,
        daemon_started,
    })
}

fn start_daemon_and_wait(user_data_path: &Path) -> Result<RuntimeMetadata, BootstrapError> {
    let executable = std::env::current_exe()?;
    let mut command = Command::new(&executable);
    command
        .args(["daemon", "--user-data-path"])
        .arg(user_data_path)
        .env_remove(crate::entry::RESTART_PARENT_ENV)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(target_os = "macos")]
    if let Some(bundle) = crate::paths::containing_app(&executable) {
        // Why: Launch Services does not inherit this native host's profile environment.
        if ["AGENTSTART_APP_USER_DATA_PATH", "AGENTSTART_USER_DATA_PATH"]
            .iter()
            .any(|name| std::env::var(name).is_ok_and(|value| !value.trim().is_empty()))
        {
            return Err(BootstrapError::CustomDataRequiresAppStart);
        }
        // Why: bundled native hosts wake the app so it remains the runtime lifecycle owner.
        command = Command::new("/usr/bin/open");
        command
            .arg("-g")
            .arg(bundle)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
    }
    let _child = spawn_detached(command)?;

    wait_for_daemon(user_data_path)
}

fn wait_for_daemon(user_data_path: &Path) -> Result<RuntimeMetadata, BootstrapError> {
    let started_at = Instant::now();
    let deadline = started_at + DAEMON_START_TIMEOUT;
    loop {
        if let Some(metadata) = runtime_metadata::read_live(user_data_path) {
            return Ok(metadata);
        }
        let now = Instant::now();
        if now >= deadline {
            return Err(BootstrapError::DaemonStartTimeout);
        }
        let poll_interval = if now.duration_since(started_at) < DAEMON_FAST_POLL_DURATION {
            DAEMON_FAST_POLL_INTERVAL
        } else {
            DAEMON_START_POLL_INTERVAL
        };
        thread::sleep(poll_interval.min(deadline.duration_since(now)));
    }
}

fn dev_supervisor_is_live(user_data_path: &Path) -> bool {
    let Ok(contents) = fs::read_to_string(
        user_data_path
            .join(DEV_SUPERVISOR_DIRECTORY_NAME)
            .join(DEV_SUPERVISOR_LEASE_FILE_NAME),
    ) else {
        return false;
    };
    let Ok(value) = serde_json::from_str::<serde_json::Value>(&contents) else {
        return false;
    };
    if value
        .get("schemaVersion")
        .and_then(serde_json::Value::as_u64)
        != Some(1)
    {
        return false;
    }
    let Some(lease_id) = value.get("leaseId").and_then(serde_json::Value::as_str) else {
        return false;
    };
    if let Some(guardian) = value.get("guardian").filter(|value| !value.is_null()) {
        return supervisor_owner_is_live(guardian, Some(lease_id));
    }
    let Some(created_at_ms) = value.get("createdAtMs").and_then(serde_json::Value::as_u64) else {
        return false;
    };
    let Ok(now) = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH) else {
        return false;
    };
    let Some(age_ms) = now.as_millis().checked_sub(u128::from(created_at_ms)) else {
        return false;
    };
    if age_ms > DEV_SUPERVISOR_HANDSHAKE_TIMEOUT.as_millis() {
        return false;
    }
    value
        .get("parent")
        .and_then(supervisor_owner_fields)
        .is_some_and(|(pid, _, token)| token.is_some() && crate::hosts::is_process_running(pid))
}

fn supervisor_owner_is_live(owner: &serde_json::Value, required_token: Option<&str>) -> bool {
    let Some((pid, birth_identity, ownership_token)) = supervisor_owner_fields(owner) else {
        return false;
    };
    if required_token.is_some_and(|required| ownership_token != Some(required)) {
        return false;
    }
    crate::hosts::matches_dev_supervisor(pid, birth_identity, ownership_token)
}

fn supervisor_owner_fields(owner: &serde_json::Value) -> Option<(u32, &str, Option<&str>)> {
    let pid = owner
        .get("pid")
        .and_then(serde_json::Value::as_u64)
        .and_then(|pid| u32::try_from(pid).ok())
        .filter(|pid| *pid > 0)?;
    let birth_identity = owner
        .get("birthIdentity")
        .and_then(serde_json::Value::as_str)
        .filter(|value| !value.is_empty())?;
    let ownership_token = match owner.get("ownershipToken") {
        Some(serde_json::Value::String(value)) if !value.is_empty() => Some(value.as_str()),
        Some(serde_json::Value::Null) => None,
        _ => return None,
    };
    Some((pid, birth_identity, ownership_token))
}

#[cfg(unix)]
fn spawn_detached(command: Command) -> Result<Box<dyn process_wrap::std::ChildWrapper>, io::Error> {
    use process_wrap::std::{CommandWrap, ProcessSession};

    let mut command = CommandWrap::from(command);
    command.wrap(ProcessSession);
    command.spawn()
}

#[cfg(windows)]
fn spawn_detached(mut command: Command) -> Result<std::process::Child, io::Error> {
    use std::os::windows::process::CommandExt;
    use windows_sys::Win32::System::Threading::{CREATE_NEW_PROCESS_GROUP, DETACHED_PROCESS};

    command.creation_flags(DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP);
    command.spawn()
}

pub(crate) fn extension_origin() -> &'static str {
    EXTENSION_ORIGIN
}

fn read_extension_bootstrap(
    user_data_path: &Path,
    metadata: &RuntimeMetadata,
) -> Result<ExtensionBootstrap, BootstrapError> {
    read_extension_bootstrap_path(&extension_bootstrap_path(user_data_path, metadata.pid))
}

fn read_extension_bootstrap_path(path: &Path) -> Result<ExtensionBootstrap, BootstrapError> {
    let contents = fs::read_to_string(path)?;
    let value = serde_json::from_str::<serde_json::Value>(&contents)?;
    let object = value.as_object().ok_or(BootstrapError::Invalid)?;
    let protocol_version = object
        .get("protocolVersion")
        .and_then(serde_json::Value::as_number)
        .cloned()
        .ok_or(BootstrapError::Invalid)?;
    let rpc_protocol = string_field(object, "rpcProtocol")?;
    if rpc_protocol != RPC_PROTOCOL {
        return Err(BootstrapError::Invalid);
    }
    Ok(ExtensionBootstrap {
        auth_token: string_field(object, "authToken")?,
        endpoint: string_field(object, "endpoint")?,
        protocol_version,
        rpc_protocol,
        runtime_id: string_field(object, "runtimeId")?,
    })
}

fn extension_bootstrap_path(user_data_path: &Path, pid: u32) -> std::path::PathBuf {
    user_data_path
        .join("rh")
        .join(pid.to_string())
        .join(EXTENSION_BOOTSTRAP_FILE_NAME)
}

fn string_field(
    object: &serde_json::Map<String, serde_json::Value>,
    field: &str,
) -> Result<String, BootstrapError> {
    object
        .get(field)
        .and_then(serde_json::Value::as_str)
        .map(str::to_owned)
        .ok_or(BootstrapError::Invalid)
}

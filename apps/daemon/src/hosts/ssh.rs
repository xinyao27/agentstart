#[cfg(unix)]
use std::fs;
#[cfg(unix)]
use std::io::{self, Read as _, Write as _};
use std::path::Path;

use async_trait::async_trait;
#[cfg(unix)]
use base64::Engine as _;
#[cfg(unix)]
use sha2::{Digest as _, Sha256};
use thiserror::Error;

use super::command;
use super::model::{
    ExecutionHost, HostCommand, HostCommandError, HostCommandOutput, HostKind, HostPlatform,
    failed_command,
};
use super::posix::{build, encoded_host_id};

#[cfg(unix)]
const CONTROL_DIRECTORY_CREATE_ATTEMPTS: usize = 8;
#[cfg(unix)]
const CONTROL_INSTALLATION_ID_LENGTH: usize = 6;
#[cfg(unix)]
const CONTROL_INSTANCE_ID_LENGTH: usize = 6;
#[cfg(unix)]
const CONTROL_MARKER_MAX_BYTES: u64 = 96;
#[cfg(unix)]
const CONTROL_PATH_MAX_BYTES: usize = 82;
#[cfg(unix)]
const CONTROL_TARGET_ID_LENGTH: usize = 16;

pub struct SshHost {
    #[cfg(unix)]
    control_path: Option<String>,
    executable: String,
    id: String,
    label: String,
    target: String,
}

pub(crate) struct SshControlDirectory {
    #[cfg(unix)]
    owned: Option<OwnedControlDirectory>,
}

#[cfg(unix)]
struct OwnedControlDirectory {
    owner_marker: String,
    path: std::path::PathBuf,
    user_id: u32,
}

#[derive(Debug, Error)]
pub enum SshHostError {
    #[error("ssh_target_invalid")]
    InvalidTarget,
}

impl SshHost {
    pub(crate) fn new(
        label: impl Into<String>,
        target: impl Into<String>,
        control_directory: &SshControlDirectory,
    ) -> Result<Self, SshHostError> {
        let target = target.into();
        #[cfg(unix)]
        let control_path = control_directory.control_path(&target);
        #[cfg(not(unix))]
        let _ = control_directory;
        if target.is_empty() || target.starts_with('-') || !target.bytes().all(is_target_byte) {
            return Err(SshHostError::InvalidTarget);
        }
        Ok(Self {
            #[cfg(unix)]
            control_path,
            executable: "ssh".to_owned(),
            id: encoded_host_id("ssh:", &target),
            label: label.into(),
            target,
        })
    }
}

impl SshControlDirectory {
    pub(crate) fn open(user_data_path: &Path) -> Self {
        #[cfg(unix)]
        {
            let owned = match prepare_control_directory(user_data_path) {
                Ok(owned) => Some(owned),
                Err(error) => {
                    eprintln!(
                        "[ssh] control multiplexing unavailable; using fresh connections: {error}"
                    );
                    None
                }
            };
            Self { owned }
        }
        #[cfg(not(unix))]
        {
            let _ = user_data_path;
            Self {}
        }
    }

    #[cfg(unix)]
    fn control_path(&self, target: &str) -> Option<String> {
        let directory = self.owned.as_ref()?;
        let target_id = digest_id(target.as_bytes());
        control_path_string(&directory.path.join(&target_id[..CONTROL_TARGET_ID_LENGTH])).ok()
    }
}

impl Drop for SshControlDirectory {
    fn drop(&mut self) {
        #[cfg(unix)]
        if let Some(owned) = self.owned.take()
            && let Err(error) = cleanup_control_directory(&owned)
        {
            eprintln!("[ssh] control directory cleanup failed: {error}");
        }
    }
}

#[async_trait]
impl ExecutionHost for SshHost {
    fn id(&self) -> &str {
        &self.id
    }

    fn kind(&self) -> HostKind {
        HostKind::Ssh
    }

    fn label(&self) -> &str {
        &self.label
    }

    fn platform(&self) -> HostPlatform {
        HostPlatform::Unknown
    }

    fn runtime_pid(&self) -> Option<u32> {
        None
    }

    fn target(&self) -> Option<&str> {
        Some(&self.target)
    }

    async fn exec(&self, input: HostCommand) -> Result<HostCommandOutput, HostCommandError> {
        let remote_command = build(&input);
        let mut arguments = vec![
            "-o".to_owned(),
            "BatchMode=yes".to_owned(),
            "-o".to_owned(),
            "ConnectTimeout=10".to_owned(),
        ];
        #[cfg(unix)]
        if let Some(control_path) = &self.control_path {
            arguments.extend([
                "-o".to_owned(),
                "ControlMaster=auto".to_owned(),
                "-o".to_owned(),
                "ControlPersist=60".to_owned(),
                "-o".to_owned(),
                format!("ControlPath={control_path}"),
            ]);
        }
        arguments.extend(["--".to_owned(), self.target.clone(), remote_command]);
        let mut transport = HostCommand::new(self.executable.clone(), arguments);
        transport.cancel = input.cancel;
        transport.capture_stdout_bytes = input.capture_stdout_bytes;
        transport.disable_timeout = input.disable_timeout;
        transport.kill_process_tree = input.kill_process_tree;
        transport.max_output_bytes = input.max_output_bytes;
        transport.retain_stderr = input.retain_stderr;
        transport.retain_stdout = input.retain_stdout;
        transport.stdin = input.stdin;
        transport.output_observer = input.output_observer;
        transport.timeout_ms = input.timeout_ms;
        command::run(transport).await
    }

    async fn terminate(&self, pid: u32) -> Result<(), HostCommandError> {
        let output = self
            .exec(HostCommand::new(
                "kill",
                ["-TERM".to_owned(), "--".to_owned(), pid.to_string()],
            ))
            .await?;
        if output.exit_code == 0 {
            Ok(())
        } else {
            Err(failed_command(output, "Failed to stop the process."))
        }
    }
}

fn is_target_byte(byte: u8) -> bool {
    byte.is_ascii_alphanumeric()
        || matches!(
            byte,
            b'.' | b'_' | b'@' | b'%' | b'+' | b':' | b'[' | b']' | b'-'
        )
}

#[cfg(unix)]
fn prepare_control_directory(user_data_path: &Path) -> io::Result<OwnedControlDirectory> {
    use std::os::unix::ffi::OsStrExt as _;

    let installation_id = digest_id(user_data_path.as_os_str().as_bytes());
    let directory_prefix = format!("ys-{}-", &installation_id[..CONTROL_INSTALLATION_ID_LENGTH]);
    let base_path = std::env::temp_dir();
    let user_id = nix::unistd::geteuid().as_raw();
    let target_placeholder = "x".repeat(CONTROL_TARGET_ID_LENGTH);
    for _ in 0..CONTROL_DIRECTORY_CREATE_ATTEMPTS {
        let instance_token = random_id()?;
        let path = base_path.join(format!(
            "{directory_prefix}{}",
            &instance_token[..CONTROL_INSTANCE_ID_LENGTH]
        ));
        control_path_string(&path.join(&target_placeholder))?;
        match create_control_directory(&path, user_id) {
            Ok(()) => {}
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error),
        }
        let owned = OwnedControlDirectory {
            owner_marker: format!(
                "1:{installation_id}:{user_id}:{}:{instance_token}",
                std::process::id()
            ),
            path,
            user_id,
        };
        if let Err(error) = write_owner_marker(&owned) {
            let _ = fs::remove_file(owned.path.join(".owner"));
            let _ = fs::remove_dir(&owned.path);
            return Err(error);
        }
        cleanup_stale_control_directories(&base_path, &directory_prefix, &installation_id, &owned);
        return Ok(owned);
    }
    Err(io::Error::new(
        io::ErrorKind::AlreadyExists,
        "could not allocate a unique SSH control directory",
    ))
}

#[cfg(unix)]
fn create_control_directory(path: &Path, user_id: u32) -> io::Result<()> {
    use std::os::unix::fs::{DirBuilderExt as _, MetadataExt as _, PermissionsExt as _};

    let mut builder = fs::DirBuilder::new();
    builder.mode(0o700).create(path)?;
    let result = fs::set_permissions(path, fs::Permissions::from_mode(0o700)).and_then(|()| {
        let metadata = fs::symlink_metadata(path)?;
        if !metadata.file_type().is_dir()
            || metadata.uid() != user_id
            || metadata.mode() & 0o7777 != 0o700
        {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "SSH control directory could not be made private",
            ));
        }
        Ok(())
    });
    if result.is_err() {
        let _ = fs::remove_dir(path);
    }
    result
}

#[cfg(unix)]
fn write_owner_marker(owned: &OwnedControlDirectory) -> io::Result<()> {
    use std::os::unix::fs::{OpenOptionsExt as _, PermissionsExt as _};

    let mut marker = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .custom_flags(nix::libc::O_NOFOLLOW)
        .open(owned.path.join(".owner"))?;
    marker.set_permissions(fs::Permissions::from_mode(0o600))?;
    marker.write_all(owned.owner_marker.as_bytes())?;
    marker.sync_all()?;
    validate_owner_marker_metadata(&marker.metadata()?, owned.user_id)
}

#[cfg(unix)]
fn cleanup_stale_control_directories(
    base_path: &Path,
    directory_prefix: &str,
    installation_id: &str,
    current: &OwnedControlDirectory,
) {
    let entries = match fs::read_dir(base_path) {
        Ok(entries) => entries,
        Err(error) => {
            eprintln!("[ssh] stale control directory scan failed: {error}");
            return;
        }
    };
    for entry in entries {
        let entry = match entry {
            Ok(entry) => entry,
            Err(error) => {
                eprintln!("[ssh] stale control directory entry unreadable: {error}");
                continue;
            }
        };
        let Some(name) = entry.file_name().to_str().map(str::to_owned) else {
            continue;
        };
        let Some(instance_id) = name.strip_prefix(directory_prefix) else {
            continue;
        };
        if instance_id.len() != CONTROL_INSTANCE_ID_LENGTH || !is_control_id(instance_id) {
            continue;
        }
        let path = entry.path();
        if path == current.path {
            continue;
        }
        if let Err(error) =
            cleanup_stale_control_directory(path, installation_id, instance_id, current.user_id)
        {
            eprintln!("[ssh] stale control directory preserved: {error}");
        }
    }
}

#[cfg(unix)]
fn cleanup_stale_control_directory(
    path: std::path::PathBuf,
    installation_id: &str,
    instance_id: &str,
    user_id: u32,
) -> io::Result<()> {
    validate_control_directory(&path, user_id)?;
    let owner_marker = read_owner_marker(&path, user_id)?;
    let process_id =
        recorded_owner_process_id(&owner_marker, installation_id, instance_id, user_id)?;
    // Why: a reused PID is treated as live. Leaking one stale directory until that process exits
    // is safer than disrupting another process whose identity cannot be disproved by kill(2).
    if crate::process_liveness::is_process_running(process_id) {
        return Ok(());
    }
    cleanup_control_directory(&OwnedControlDirectory {
        owner_marker,
        path,
        user_id,
    })
}

#[cfg(unix)]
fn cleanup_control_directory(owned: &OwnedControlDirectory) -> io::Result<()> {
    use std::os::unix::fs::{FileTypeExt as _, MetadataExt as _};

    validate_control_directory(&owned.path, owned.user_id)?;
    let owner_marker = read_owner_marker(&owned.path, owned.user_id)?;
    if owner_marker != owned.owner_marker {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "SSH control directory belongs to another daemon instance",
        ));
    }
    let marker_path = owned.path.join(".owner");
    let mut sockets = Vec::new();
    // Why: validate the complete directory before unlinking anything so an unexpected regular
    // file is preserved and disables multiplexing instead of being mistaken for daemon state.
    for entry in fs::read_dir(&owned.path)? {
        let entry = entry?;
        if entry.file_name() == ".owner" {
            continue;
        }
        let entry_metadata = fs::symlink_metadata(entry.path())?;
        if !entry_metadata.file_type().is_socket()
            || entry_metadata.uid() != owned.user_id
            || entry_metadata.mode() & 0o7777 != 0o600
        {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "SSH control directory contains an unexpected entry",
            ));
        }
        sockets.push(entry.path());
    }
    for socket in sockets {
        match fs::remove_file(socket) {
            Ok(()) => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => return Err(error),
        }
    }
    fs::remove_file(marker_path)?;
    fs::remove_dir(&owned.path)
}

#[cfg(unix)]
fn validate_control_directory(path: &Path, user_id: u32) -> io::Result<()> {
    use std::os::unix::fs::MetadataExt as _;

    let metadata = fs::symlink_metadata(path)?;
    if metadata.file_type().is_dir()
        && metadata.uid() == user_id
        && metadata.mode() & 0o7777 == 0o700
    {
        return Ok(());
    }
    Err(io::Error::new(
        io::ErrorKind::InvalidData,
        "SSH control directory is not private",
    ))
}

#[cfg(unix)]
fn validate_owner_marker_metadata(metadata: &fs::Metadata, user_id: u32) -> io::Result<()> {
    use std::os::unix::fs::MetadataExt as _;

    if metadata.file_type().is_file()
        && metadata.uid() == user_id
        && metadata.mode() & 0o7777 == 0o600
        && metadata.nlink() == 1
        && metadata.len() <= CONTROL_MARKER_MAX_BYTES
    {
        return Ok(());
    }
    Err(io::Error::new(
        io::ErrorKind::InvalidData,
        "SSH control directory owner marker is invalid",
    ))
}

#[cfg(unix)]
fn recorded_owner_process_id(
    owner_marker: &str,
    installation_id: &str,
    instance_id: &str,
    user_id: u32,
) -> io::Result<u32> {
    let mut fields = owner_marker.split(':');
    let version = fields.next();
    let recorded_installation_id = fields.next();
    let recorded_user_id = fields.next().and_then(|value| value.parse::<u32>().ok());
    let process_id = fields.next().and_then(|value| value.parse::<u32>().ok());
    let instance_token = fields.next();
    let is_valid = version == Some("1")
        && recorded_installation_id == Some(installation_id)
        && recorded_user_id == Some(user_id)
        && process_id.is_some_and(|pid| pid != 0 && i32::try_from(pid).is_ok())
        && instance_token.is_some_and(|token| {
            token.len() == 11 && token.starts_with(instance_id) && is_control_id(token)
        })
        && fields.next().is_none();
    if is_valid && let Some(process_id) = process_id {
        return Ok(process_id);
    }
    Err(io::Error::new(
        io::ErrorKind::InvalidData,
        "SSH control directory owner identity is invalid",
    ))
}

#[cfg(unix)]
fn digest_id(value: &[u8]) -> String {
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(Sha256::digest(value))
}

#[cfg(unix)]
fn random_id() -> io::Result<String> {
    let mut token = [0_u8; 8];
    getrandom::fill(&mut token)
        .map_err(|error| io::Error::other(format!("OS random source failed: {error}")))?;
    Ok(base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(token))
}

#[cfg(unix)]
fn is_control_id(value: &str) -> bool {
    value
        .bytes()
        .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
}

#[cfg(unix)]
fn control_path_string(path: &Path) -> io::Result<String> {
    use std::os::unix::ffi::OsStrExt as _;

    let bytes = path.as_os_str().as_bytes();
    // Why: OpenSSH appends a 17-byte temporary listener suffix, so the final path must remain
    // below Darwin's 104-byte sun_path; percent tokens and whitespace are parsed specially too.
    if bytes.len() > CONTROL_PATH_MAX_BYTES
        || bytes.contains(&b'%')
        || bytes.iter().any(u8::is_ascii_whitespace)
    {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "SSH control path is not safe for OpenSSH",
        ));
    }
    path.to_str().map(str::to_owned).ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::InvalidInput,
            "SSH control path is not valid UTF-8",
        )
    })
}

#[cfg(unix)]
fn read_owner_marker(directory: &Path, user_id: u32) -> io::Result<String> {
    use std::os::unix::fs::OpenOptionsExt as _;

    let mut marker = fs::OpenOptions::new()
        .read(true)
        .custom_flags(nix::libc::O_NOFOLLOW | nix::libc::O_NONBLOCK)
        .open(directory.join(".owner"))?;
    let marker_metadata = marker.metadata()?;
    validate_owner_marker_metadata(&marker_metadata, user_id)?;
    let mut owner_marker = String::new();
    marker.read_to_string(&mut owner_marker)?;
    Ok(owner_marker)
}

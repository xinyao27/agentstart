use std::time::{SystemTime, UNIX_EPOCH};

use crate::hosts::{ExecutionHost, HostCommand, HostKind, HostPlatform};
use crate::workspace_paths::AuthorizedWorkspacePath;

use super::ShellFileError;

const METADATA_OUTPUT_MAX_BYTES: usize = 64 * 1_024;
const MISSING_EXIT_CODE: i32 = 44;

pub(super) struct FileMetadata {
    pub(super) is_directory: bool,
    pub(super) mtime_ms: f64,
    pub(super) size: u64,
}

pub(super) async fn load(
    target: &AuthorizedWorkspacePath,
) -> Result<Option<FileMetadata>, ShellFileError> {
    if target.host.kind() == HostKind::Local {
        return local(&target.path).await;
    }
    remote(target.host.as_ref(), &target.path).await
}

async fn local(path: &str) -> Result<Option<FileMetadata>, ShellFileError> {
    let metadata = match tokio::fs::metadata(path).await {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.into()),
    };
    Ok(Some(FileMetadata {
        is_directory: metadata.is_dir(),
        mtime_ms: system_time_millis(metadata.modified()?),
        size: metadata.len(),
    }))
}

async fn remote(
    host: &dyn ExecutionHost,
    path: &str,
) -> Result<Option<FileMetadata>, ShellFileError> {
    let script = match host.platform() {
        HostPlatform::Darwin => {
            "path=$1; [ -e \"$path\" ] || exit 44; [ -d \"$path\" ] && d=1 || d=0; stat -f '%z %m' \"$path\" && printf '%s\\n' \"$d\""
        }
        HostPlatform::Linux | HostPlatform::Unknown | HostPlatform::Windows => {
            "path=$1; [ -e \"$path\" ] || exit 44; [ -d \"$path\" ] && d=1 || d=0; stat -Lc '%s %Y' -- \"$path\" && printf '%s\\n' \"$d\""
        }
    };
    let mut command = HostCommand::new("sh", ["-c", script, "sh", path]);
    command.max_output_bytes = Some(METADATA_OUTPUT_MAX_BYTES);
    let output = host.exec(command).await?;
    if output.exit_code == MISSING_EXIT_CODE {
        return Ok(None);
    }
    if output.exit_code != 0 {
        return Err(ShellFileError::Operation(output.stderr.trim().to_owned()));
    }
    let mut fields = output.stdout.split_ascii_whitespace();
    let size = fields
        .next()
        .and_then(|value| value.parse::<u64>().ok())
        .ok_or_else(|| ShellFileError::Operation("invalid stat size".to_owned()))?;
    let seconds = fields
        .next()
        .and_then(|value| value.parse::<f64>().ok())
        .ok_or_else(|| ShellFileError::Operation("invalid stat mtime".to_owned()))?;
    let is_directory = fields
        .next()
        .and_then(|value| value.parse::<u8>().ok())
        .ok_or_else(|| ShellFileError::Operation("invalid stat kind".to_owned()))?
        == 1;
    Ok(Some(FileMetadata {
        is_directory,
        mtime_ms: seconds * 1_000.0,
        size,
    }))
}

pub(super) fn system_time_millis(time: SystemTime) -> f64 {
    match time.duration_since(UNIX_EPOCH) {
        Ok(duration) => duration.as_secs_f64() * 1_000.0,
        Err(error) => -(error.duration().as_secs_f64() * 1_000.0),
    }
}

#[cfg(unix)]
pub(super) fn local_identity(metadata: &std::fs::Metadata) -> String {
    use std::os::unix::fs::MetadataExt;

    let birthtime = metadata
        .created()
        .map(system_time_millis)
        .unwrap_or_default();
    format!("{}:{}:{birthtime}", metadata.dev(), metadata.ino())
}

#[cfg(not(unix))]
pub(super) fn local_identity(metadata: &std::fs::Metadata) -> String {
    let birthtime = metadata
        .created()
        .map(system_time_millis)
        .unwrap_or_default();
    format!("0:0:{birthtime}")
}

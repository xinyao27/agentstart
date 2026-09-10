use std::ffi::OsStr;
use std::path::Path;
use std::process::{ExitStatus, Stdio};
use std::time::Duration;

use tokio::io::{AsyncReadExt, BufReader};
use tokio::process::{Child, ChildStderr, Command};
use tokio::time::timeout;

use super::UpdateError;

const CODESIGN_PATH: &str = "/usr/bin/codesign";
const CODESIGN_TIMEOUT: Duration = Duration::from_secs(10);
const EXPECTED_TEAM_ID: &str = "8H6Q2YA365";
const MAX_STDERR_BYTES: usize = 64 * 1024;

struct CodesignOutput {
    status: ExitStatus,
    stderr: Vec<u8>,
    was_truncated: bool,
}

pub(super) async fn verify(executable: &Path) -> Result<(), UpdateError> {
    let verification = run(&[
        OsStr::new("--verify"),
        OsStr::new("--strict"),
        OsStr::new("--verbose=4"),
        executable.as_os_str(),
    ])
    .await?;
    require_success("codesign verification failed", &verification)?;

    let details = run(&[
        OsStr::new("-d"),
        OsStr::new("--verbose=4"),
        executable.as_os_str(),
    ])
    .await?;
    require_success("codesign details unavailable", &details)?;
    let details = String::from_utf8_lossy(&details.stderr);
    if !has_developer_id_authority(&details)
        || !has_expected_team(&details)
        || !has_hardened_runtime(&details)
    {
        return Err(UpdateError::SignatureInvalid(
            "expected AgentStart Developer ID authority, team, and hardened runtime".to_owned(),
        ));
    }
    Ok(())
}

async fn run(arguments: &[&OsStr]) -> Result<CodesignOutput, UpdateError> {
    let mut command = Command::new(CODESIGN_PATH);
    command
        .args(arguments)
        .env_clear()
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    let mut child = command.spawn().map_err(UpdateError::SignatureIo)?;
    let stderr = match child.stderr.take() {
        Some(stderr) => stderr,
        None => {
            kill_and_reap(&mut child).await;
            return Err(UpdateError::SignatureIo(std::io::Error::other(
                "codesign stderr unavailable",
            )));
        }
    };
    let completed = timeout(CODESIGN_TIMEOUT, async {
        tokio::try_join!(child.wait(), read_stderr(stderr))
    })
    .await;
    let (status, stderr) = match completed {
        Ok(Ok(result)) => result,
        Ok(Err(error)) => {
            kill_and_reap(&mut child).await;
            return Err(UpdateError::SignatureIo(error));
        }
        Err(_) => {
            kill_and_reap(&mut child).await;
            return Err(UpdateError::SignatureTimeout);
        }
    };
    Ok(CodesignOutput {
        status,
        stderr: stderr.bytes,
        was_truncated: stderr.was_truncated,
    })
}

async fn kill_and_reap(child: &mut Child) {
    let _ = child.start_kill();
    let _ = child.wait().await;
}

struct CapturedStderr {
    bytes: Vec<u8>,
    was_truncated: bool,
}

async fn read_stderr(stderr: ChildStderr) -> Result<CapturedStderr, std::io::Error> {
    let mut reader = BufReader::new(stderr);
    let mut bytes = Vec::new();
    let mut buffer = [0_u8; 8 * 1024];
    let mut was_truncated = false;
    loop {
        let count = reader.read(&mut buffer).await?;
        if count == 0 {
            break;
        }
        let remaining = MAX_STDERR_BYTES.saturating_sub(bytes.len());
        bytes.extend_from_slice(&buffer[..count.min(remaining)]);
        was_truncated |= count > remaining;
    }
    Ok(CapturedStderr {
        bytes,
        was_truncated,
    })
}

fn require_success(label: &str, output: &CodesignOutput) -> Result<(), UpdateError> {
    if output.was_truncated {
        return Err(UpdateError::SignatureOutputTooLarge);
    }
    if output.status.success() {
        return Ok(());
    }
    let detail = String::from_utf8_lossy(&output.stderr).trim().to_owned();
    let message = if detail.is_empty() {
        label.to_owned()
    } else {
        format!("{label}: {detail}")
    };
    Err(UpdateError::SignatureInvalid(message))
}

fn has_developer_id_authority(details: &str) -> bool {
    details.lines().any(|line| {
        line.starts_with("Authority=Developer ID Application:")
            && line.ends_with(&format!("({EXPECTED_TEAM_ID})"))
    })
}

fn has_expected_team(details: &str) -> bool {
    details
        .lines()
        .any(|line| line == format!("TeamIdentifier={EXPECTED_TEAM_ID}"))
}

fn has_hardened_runtime(details: &str) -> bool {
    details
        .lines()
        .filter_map(|line| line.strip_prefix("CodeDirectory "))
        .flat_map(str::split_ascii_whitespace)
        .filter_map(|field| field.strip_prefix("flags="))
        .filter_map(|flags| flags.split_once('(').map(|(_, names)| names))
        .map(|names| names.trim_end_matches(')'))
        .any(|names| names.split(',').any(|name| name == "runtime"))
}

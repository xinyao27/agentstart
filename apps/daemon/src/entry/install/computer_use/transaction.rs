use std::env;
use std::io;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

use tokio::io::{AsyncReadExt, BufReader};
use tokio::process::Command;
use tokio::time::timeout;

use super::ComputerUseInstallError;
use super::download::HELPER_ASSET_NAME;

const MAX_VERSION_MARKER_BYTES: u64 = 1024;
const MAX_COMMAND_STDERR_BYTES: usize = 64 * 1024;
const EXTRACT_TIMEOUT: Duration = Duration::from_secs(120);
const SIGNATURE_TIMEOUT: Duration = Duration::from_secs(30);

pub(super) enum TargetResolution {
    AlreadyInstalled,
    Install(InstallTarget),
}

pub(super) struct InstallTarget {
    app_path: PathBuf,
    previous_version_marker: Option<Vec<u8>>,
    version_path: PathBuf,
}

pub(super) async fn resolve(version: &str) -> Result<TargetResolution, ComputerUseInstallError> {
    let app_path = crate::paths::resolve_default_user_data_path()?
        .join("native")
        .join("computer-use")
        .join("Yiru Computer Use.app");
    let version_path = app_path
        .parent()
        .ok_or_else(|| io::Error::other("computer use helper app path has no parent"))?
        .join("version");
    let previous_version_marker = read_marker(&version_path).await?;
    let installed_version = previous_version_marker
        .as_deref()
        .and_then(|contents| std::str::from_utf8(contents).ok())
        .unwrap_or_default();
    if installed_version == version && executable_has_bytes(&helper_executable(&app_path)).await {
        return Ok(TargetResolution::AlreadyInstalled);
    }
    if let Some(override_path) = env::var_os("YIRU_COMPUTER_MACOS_HELPER_APP_PATH") {
        let override_path = PathBuf::from(override_path);
        if helper_executable(&override_path).is_file() {
            return Ok(TargetResolution::AlreadyInstalled);
        }
    }
    Ok(TargetResolution::Install(InstallTarget {
        app_path,
        previous_version_marker,
        version_path,
    }))
}

pub(super) async fn install(
    staging_directory: &Path,
    target: &InstallTarget,
    version: &str,
) -> Result<(), ComputerUseInstallError> {
    let archive_path = staging_directory.join(HELPER_ASSET_NAME);
    let staged_app_path = staging_directory.join("Yiru Computer Use.app");
    run_command(
        "/usr/bin/ditto",
        &["-x", "-k"],
        &[archive_path.as_os_str(), staging_directory.as_os_str()],
        EXTRACT_TIMEOUT,
    )
    .await?;
    run_command(
        "/usr/bin/codesign",
        &["--verify", "--deep", "--strict"],
        &[staged_app_path.as_os_str()],
        SIGNATURE_TIMEOUT,
    )
    .await?;

    let app_directory = target
        .app_path
        .parent()
        .ok_or_else(|| io::Error::other("computer use helper app path has no parent"))?;
    tokio::fs::create_dir_all(app_directory).await?;
    let backup_path = target.app_path.with_extension("app.previous");
    remove_path(&backup_path).await?;
    if executable_has_bytes(&helper_executable(&target.app_path)).await {
        tokio::fs::rename(&target.app_path, &backup_path).await?;
    } else {
        remove_path(&target.app_path).await?;
    }

    let result = async {
        tokio::fs::rename(&staged_app_path, &target.app_path).await?;
        crate::transport::secure_file::write_bytes(&target.version_path, version.as_bytes())?;
        remove_path(&backup_path).await?;
        Ok::<(), ComputerUseInstallError>(())
    }
    .await;
    if let Err(error) = result {
        if let Err(rollback) = rollback(target, &backup_path).await {
            return Err(ComputerUseInstallError::Rollback {
                install: error.to_string(),
                rollback: rollback.to_string(),
            });
        }
        return Err(error);
    }
    Ok(())
}

async fn rollback(
    target: &InstallTarget,
    backup_path: &Path,
) -> Result<(), ComputerUseInstallError> {
    let app_result = async {
        remove_path(&target.app_path).await?;
        if executable_has_bytes(&helper_executable(backup_path)).await {
            tokio::fs::rename(backup_path, &target.app_path).await?;
        }
        Ok::<(), io::Error>(())
    }
    .await;
    let marker_result = restore_marker(
        &target.version_path,
        target.previous_version_marker.as_deref(),
    )
    .await;
    match (app_result, marker_result) {
        (Ok(()), Ok(())) => Ok(()),
        (Err(error), Ok(())) => Err(error.into()),
        (Ok(()), Err(error)) => Err(error),
        (Err(app), Err(marker)) => Err(ComputerUseInstallError::Rollback {
            install: app.to_string(),
            rollback: marker.to_string(),
        }),
    }
}

async fn restore_marker(
    path: &Path,
    previous: Option<&[u8]>,
) -> Result<(), ComputerUseInstallError> {
    if let Some(contents) = previous {
        crate::transport::secure_file::write_bytes(path, contents)?;
        return Ok(());
    }
    match tokio::fs::remove_file(path).await {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.into()),
    }
}

async fn read_marker(path: &Path) -> Result<Option<Vec<u8>>, io::Error> {
    let metadata = match tokio::fs::metadata(path).await {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error),
    };
    if metadata.len() > MAX_VERSION_MARKER_BYTES {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "computer use helper version marker is too large",
        ));
    }
    tokio::fs::read(path).await.map(Some)
}

fn helper_executable(app: &Path) -> PathBuf {
    app.join("Contents")
        .join("MacOS")
        .join("yiru-computer-use-macos")
}

async fn executable_has_bytes(path: &Path) -> bool {
    tokio::fs::metadata(path)
        .await
        .is_ok_and(|metadata| metadata.is_file() && metadata.len() > 0)
}

async fn remove_path(path: &Path) -> Result<(), io::Error> {
    let metadata = match tokio::fs::symlink_metadata(path).await {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error),
    };
    if metadata.is_dir() && !metadata.file_type().is_symlink() {
        tokio::fs::remove_dir_all(path).await
    } else {
        tokio::fs::remove_file(path).await
    }
}

async fn run_command(
    program: &str,
    flags: &[&str],
    paths: &[&std::ffi::OsStr],
    duration: Duration,
) -> Result<(), ComputerUseInstallError> {
    let mut command = Command::new(program);
    command
        .args(flags)
        .args(paths)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    let mut child = command.spawn()?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| io::Error::other("computer use helper stderr pipe unavailable"))?;
    let completed = timeout(duration, async {
        tokio::try_join!(child.wait(), read_bounded_stderr(stderr))
    })
    .await;
    let (status, stderr) = match completed {
        Ok(result) => result?,
        Err(_) => {
            let _ = child.kill().await;
            let _ = child.wait().await;
            return Err(ComputerUseInstallError::CommandFailed {
                program: program.to_owned(),
                stderr: format!("timed out after {} seconds", duration.as_secs()),
            });
        }
    };
    if status.success() {
        return Ok(());
    }
    Err(ComputerUseInstallError::CommandFailed {
        program: program.to_owned(),
        stderr: String::from_utf8_lossy(&stderr).trim().to_owned(),
    })
}

async fn read_bounded_stderr(stderr: tokio::process::ChildStderr) -> Result<Vec<u8>, io::Error> {
    let mut reader = BufReader::new(stderr);
    let mut retained = Vec::new();
    let mut buffer = [0_u8; 8 * 1024];
    loop {
        let count = reader.read(&mut buffer).await?;
        if count == 0 {
            break;
        }
        let remaining = MAX_COMMAND_STDERR_BYTES.saturating_sub(retained.len());
        retained.extend_from_slice(&buffer[..count.min(remaining)]);
    }
    Ok(retained)
}

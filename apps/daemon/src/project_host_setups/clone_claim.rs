use std::sync::Arc;

#[cfg(any(target_os = "macos", windows))]
use crate::hosts::HostKind;
use crate::hosts::{ExecutionHost, HostCommand, HostPlatform, HostRemoveOptions};

use super::ProjectHostSetupError;

#[derive(Clone)]
pub(crate) struct CloneClaim {
    identity: Option<String>,
    pub(crate) path: String,
}

pub(crate) async fn claim(
    host: Arc<dyn ExecutionHost>,
    path: String,
) -> Result<CloneClaim, ProjectHostSetupError> {
    let filesystem = crate::hosts::HostFilesystem::new(host.clone());
    if let Err(error) = filesystem.mkdir(&path, false).await {
        if filesystem.exists(&path).await.unwrap_or(false) {
            return Ok(CloneClaim {
                identity: None,
                path,
            });
        }
        return Err(error.into());
    }
    let Some(identity) = identity(host, &path).await else {
        return Err(ProjectHostSetupError::CloneIdentityUnavailable(path));
    };
    Ok(CloneClaim {
        identity: Some(identity),
        path,
    })
}

pub(crate) async fn claim_new(
    host: Arc<dyn ExecutionHost>,
    path: String,
) -> Result<CloneClaim, ProjectHostSetupError> {
    crate::hosts::HostFilesystem::new(host.clone())
        .mkdir(&path, false)
        .await?;
    observe(host, path).await
}

pub(crate) async fn observe(
    host: Arc<dyn ExecutionHost>,
    path: String,
) -> Result<CloneClaim, ProjectHostSetupError> {
    let Some(identity) = identity(host, &path).await else {
        return Err(ProjectHostSetupError::CloneIdentityUnavailable(path));
    };
    Ok(CloneClaim {
        identity: Some(identity),
        path,
    })
}

pub(crate) async fn cleanup(host: Arc<dyn ExecutionHost>, claim: &CloneClaim) {
    let Some(claimed_identity) = claim.identity.as_deref() else {
        return;
    };
    if identity(host.clone(), &claim.path).await.as_deref() != Some(claimed_identity) {
        return;
    }
    let _ = crate::hosts::HostFilesystem::new(host)
        .remove(
            &claim.path,
            HostRemoveOptions {
                force: true,
                recursive: true,
            },
        )
        .await;
}

pub(crate) async fn is_current(host: Arc<dyn ExecutionHost>, claim: &CloneClaim) -> bool {
    let Some(claimed_identity) = claim.identity.as_deref() else {
        return false;
    };
    identity(host, &claim.path).await.as_deref() == Some(claimed_identity)
}

async fn identity(host: Arc<dyn ExecutionHost>, path: &str) -> Option<String> {
    #[cfg(any(target_os = "macos", windows))]
    if host.kind() == HostKind::Local {
        return local_identity(path);
    }
    let mut command = match host.platform() {
        HostPlatform::Darwin => HostCommand::new("stat", ["-f", "%d:%i:%B", "--", path]),
        HostPlatform::Linux | HostPlatform::Unknown => {
            HostCommand::new("stat", ["-c", "%d:%i:%W", "--", path])
        }
        HostPlatform::Windows => HostCommand::new(
            "powershell.exe",
            [
                "-NoLogo",
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "$i=Get-Item -LiteralPath $args[0] -Force; [Console]::Out.Write(\"$($i.CreationTimeUtc.Ticks):$($i.FullName)\")",
                path,
            ],
        ),
    };
    command.max_output_bytes = Some(512);
    command.timeout_ms = Some(10_000);
    host.exec(command)
        .await
        .ok()
        .filter(|output| output.exit_code == 0)
        .map(|output| output.stdout.trim().to_owned())
        .filter(|value| !value.is_empty())
}

#[cfg(target_os = "macos")]
fn local_identity(path: &str) -> Option<String> {
    use std::os::macos::fs::MetadataExt;

    let metadata = std::fs::symlink_metadata(path).ok()?;
    metadata.is_dir().then(|| {
        format!(
            "{}:{}:{}:{}",
            metadata.st_dev(),
            metadata.st_ino(),
            metadata.st_birthtime(),
            metadata.st_birthtime_nsec()
        )
    })
}

#[cfg(windows)]
fn local_identity(path: &str) -> Option<String> {
    use std::os::windows::fs::MetadataExt;

    let identity =
        crate::file_identity::FileIdentity::from_path(std::path::Path::new(path)).ok()?;
    let metadata = std::fs::symlink_metadata(path).ok()?;
    metadata
        .is_dir()
        .then(|| format!("{}:{}", identity.fingerprint(), metadata.creation_time()))
}

use std::io;

use thiserror::Error;

mod download;
mod transaction;

#[derive(Debug, Error)]
pub(crate) enum ComputerUseInstallError {
    #[error("computer_use_helper_release_version_unavailable")]
    ReleaseVersionUnavailable,
    #[error("computer_use_helper_release_unavailable")]
    ReleaseUnavailable,
    #[error("computer_use_helper_checksum_missing")]
    ChecksumMissing,
    #[error("computer_use_helper_checksum_mismatch")]
    ChecksumMismatch,
    #[error("computer_use_helper_artifact_too_large")]
    ArtifactTooLarge,
    #[error("computer_use_helper_request_failed:{0}")]
    Request(#[from] reqwest::Error),
    #[error("computer_use_helper_command_failed:{program}:{stderr}")]
    CommandFailed { program: String, stderr: String },
    #[error("computer_use_helper_cleanup_failed:{0}")]
    Cleanup(io::Error),
    #[error("computer_use_helper_install_failed:{install}; rollback failed:{rollback}")]
    Rollback { install: String, rollback: String },
    #[error("computer_use_helper_io_failed:{0}")]
    Io(#[from] io::Error),
    #[error(transparent)]
    Path(#[from] crate::paths::PathResolutionError),
    #[error(transparent)]
    SecureFile(#[from] crate::transport::secure_file::SecureFileError),
}

pub(super) async fn install(version: &str) -> Result<&'static str, ComputerUseInstallError> {
    let target = match transaction::resolve(version).await? {
        transaction::TargetResolution::AlreadyInstalled => return Ok("already-installed"),
        transaction::TargetResolution::Install(target) => target,
    };
    let archive = download::prepare(version).await?;
    let install_result = transaction::install(&archive, &target, version).await;
    let cleanup_result = download::cleanup(&archive).await;
    match (install_result, cleanup_result) {
        (Ok(()), Ok(())) => Ok("installed"),
        (Ok(()), Err(error)) => Err(ComputerUseInstallError::Cleanup(error)),
        (Err(error), Ok(())) => Err(error),
        (Err(error), Err(cleanup)) => Err(ComputerUseInstallError::Rollback {
            install: error.to_string(),
            rollback: cleanup.to_string(),
        }),
    }
}

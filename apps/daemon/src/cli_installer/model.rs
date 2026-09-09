use serde::Serialize;
use thiserror::Error;

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum CliInstallState {
    Installed,
    NotInstalled,
    Stale,
    Conflict,
    Unsupported,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum CliInstallUnsupportedReason {
    PlatformNotSupported,
    LauncherMissing,
    LaunchModeUnavailable,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum CliInstallMethod {
    Symlink,
    Wrapper,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CliInstallStatus {
    pub(crate) platform: String,
    pub(crate) command_name: String,
    pub(crate) command_path: Option<String>,
    pub(crate) path_directory: Option<String>,
    pub(crate) path_configured: bool,
    pub(crate) launcher_path: Option<String>,
    pub(crate) install_method: Option<CliInstallMethod>,
    pub(crate) supported: bool,
    pub(crate) state: CliInstallState,
    pub(crate) current_target: Option<String>,
    pub(crate) unsupported_reason: Option<CliInstallUnsupportedReason>,
    pub(crate) detail: Option<String>,
}

#[derive(Debug, Error)]
pub(crate) enum CliInstallerError {
    #[error("CLI installer path is unavailable: {0}")]
    PathUnavailable(&'static str),
    #[error("CLI installer file operation failed: {0}")]
    Io(#[from] std::io::Error),
    #[error("CLI installer command timed out: {0}")]
    CommandTimeout(&'static str),
    #[error("CLI installer command failed: {0}")]
    CommandFailed(String),
    #[error("{0}")]
    Refused(String),
    #[error("{0}")]
    WslCommand(String),
}

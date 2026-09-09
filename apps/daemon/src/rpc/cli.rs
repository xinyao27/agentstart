// Why: the legacy `cli.installStatus`/`cli.install`/`cli.remove` JSON surface
// is retired; the protobuf `CliService` mounts (WSL trio plus this local trio)
// remain, backed by the same installer.
pub(super) mod protocol;

use crate::cli_installer::{CliInstaller, CliInstallerError};

#[derive(Clone)]
pub(super) struct CliRpc {
    installer: CliInstaller,
}

impl CliRpc {
    pub(super) fn new(installer: CliInstaller) -> Self {
        Self { installer }
    }

    pub(super) async fn protocol_status(
        &self,
    ) -> Result<crate::cli_installer::CliInstallStatus, CliInstallerError> {
        self.installer.status().await
    }

    pub(super) async fn protocol_install(
        &self,
    ) -> Result<crate::cli_installer::CliInstallStatus, CliInstallerError> {
        self.installer.install().await
    }

    pub(super) async fn protocol_remove(
        &self,
    ) -> Result<crate::cli_installer::CliInstallStatus, CliInstallerError> {
        self.installer.remove().await
    }

    pub(super) async fn protocol_wsl_status(
        &self,
        distro: Option<&str>,
    ) -> Result<crate::cli_installer::CliInstallStatus, CliInstallerError> {
        self.installer.wsl_status(distro).await
    }

    pub(super) async fn protocol_wsl_install(
        &self,
        distro: Option<&str>,
    ) -> Result<crate::cli_installer::CliInstallStatus, CliInstallerError> {
        self.installer.wsl_install(distro).await
    }

    pub(super) async fn protocol_wsl_remove(
        &self,
        distro: Option<&str>,
    ) -> Result<crate::cli_installer::CliInstallStatus, CliInstallerError> {
        self.installer.wsl_remove(distro).await
    }
}

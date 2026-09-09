mod context;
mod inspection;
mod model;
mod operations;
mod platform_path;
mod wsl;

use crate::host_registry::SystemHostCapabilities;

pub(crate) use model::{
    CliInstallMethod, CliInstallState, CliInstallStatus, CliInstallUnsupportedReason,
    CliInstallerError,
};
use wsl::WslCliInstaller;

#[derive(Clone)]
pub(crate) struct CliInstaller {
    wsl: WslCliInstaller,
}

impl CliInstaller {
    pub(crate) fn new(system: SystemHostCapabilities) -> Self {
        Self {
            wsl: WslCliInstaller::new(system),
        }
    }

    pub(crate) async fn status(&self) -> Result<CliInstallStatus, CliInstallerError> {
        inspection::status(&context::InstallContext::local()?).await
    }

    pub(crate) async fn install(&self) -> Result<CliInstallStatus, CliInstallerError> {
        operations::install(&context::InstallContext::local()?).await
    }

    pub(crate) async fn remove(&self) -> Result<CliInstallStatus, CliInstallerError> {
        operations::remove(&context::InstallContext::local()?).await
    }

    pub(crate) async fn wsl_status(
        &self,
        distro: Option<&str>,
    ) -> Result<CliInstallStatus, CliInstallerError> {
        self.wsl.status(distro).await
    }

    pub(crate) async fn wsl_install(
        &self,
        distro: Option<&str>,
    ) -> Result<CliInstallStatus, CliInstallerError> {
        self.wsl.install(distro).await
    }

    pub(crate) async fn wsl_remove(
        &self,
        distro: Option<&str>,
    ) -> Result<CliInstallStatus, CliInstallerError> {
        self.wsl.remove(distro).await
    }
}

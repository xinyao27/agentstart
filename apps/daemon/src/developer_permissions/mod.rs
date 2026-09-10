#[cfg(target_os = "macos")]
mod macos;
#[cfg(not(target_os = "macos"))]
mod unsupported;

use thiserror::Error;

use crate::computer::{ComputerAuthority, ComputerError};

#[cfg(target_os = "macos")]
use macos as platform;
#[cfg(not(target_os = "macos"))]
use unsupported as platform;

/// A privacy permission the developer grants to the daemon. The order is the
/// order the workbench renders, so it is the order a status list is built in.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum DeveloperPermissionId {
    Microphone,
    Camera,
    Screen,
    Accessibility,
    FullDiskAccess,
    Automation,
    LocalNetwork,
    Usb,
    Bluetooth,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum DeveloperPermissionStatus {
    #[cfg(target_os = "macos")]
    Granted,
    #[cfg(target_os = "macos")]
    Unknown,
    #[cfg(not(target_os = "macos"))]
    Unsupported,
    #[cfg(target_os = "macos")]
    Ready,
}

pub(crate) struct DeveloperPermissionState {
    pub(crate) id: DeveloperPermissionId,
    pub(crate) status: DeveloperPermissionStatus,
}

pub(crate) struct DeveloperPermissionRequest {
    pub(crate) id: DeveloperPermissionId,
    pub(crate) opened_system_settings: bool,
    pub(crate) status: DeveloperPermissionStatus,
}

#[derive(Debug, Error)]
pub(crate) enum DeveloperPermissionsError {
    #[cfg(target_os = "macos")]
    #[error("developer_permission_settings_open_failed")]
    SettingsOpenFailed,
    #[error(transparent)]
    ComputerUse(#[from] ComputerError),
}

/// Reads and requests the macOS privacy grants the daemon itself holds. Off
/// macOS every permission reads as unsupported, because the platform has no
/// equivalent authority to consult.
#[derive(Clone)]
pub(crate) struct DeveloperPermissionsAuthority {
    computer: ComputerAuthority,
}

impl DeveloperPermissionId {
    pub(crate) const ALL: [Self; 9] = [
        Self::Microphone,
        Self::Camera,
        Self::Screen,
        Self::Accessibility,
        Self::FullDiskAccess,
        Self::Automation,
        Self::LocalNetwork,
        Self::Usb,
        Self::Bluetooth,
    ];
}

impl DeveloperPermissionsAuthority {
    pub(crate) fn new(computer: ComputerAuthority) -> Self {
        Self { computer }
    }

    pub(crate) async fn status(&self) -> Vec<DeveloperPermissionState> {
        platform::status(&self.computer).await
    }

    pub(crate) async fn request(
        &self,
        id: DeveloperPermissionId,
    ) -> Result<DeveloperPermissionRequest, DeveloperPermissionsError> {
        platform::request(&self.computer, id).await
    }
}

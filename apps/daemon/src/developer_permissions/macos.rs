use std::process::Stdio;

use tokio::process::Command;

use crate::computer::{ComputerAuthority, ComputerUsePermission};

use super::{
    DeveloperPermissionId, DeveloperPermissionRequest, DeveloperPermissionState,
    DeveloperPermissionStatus, DeveloperPermissionsError,
};

const PRIVACY_SECURITY_PANE_URL: &str =
    "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension";

pub(super) async fn status(computer: &ComputerAuthority) -> Vec<DeveloperPermissionState> {
    // Why: reading the helper grants spawns an app, so it runs alongside the
    // disk probe rather than after it.
    let (grants, full_disk_access) =
        tokio::join!(computer.computer_use_grants(), full_disk_access_status());
    // Why: a helper that cannot answer leaves the pane rendering `unknown`
    // rather than failing the whole status read.
    let grants = grants.ok();
    let accessibility = grants.as_ref().is_some_and(|grants| grants.accessibility);
    let screenshots = grants.as_ref().is_some_and(|grants| grants.screenshots);
    DeveloperPermissionId::ALL
        .into_iter()
        .map(|id| DeveloperPermissionState {
            id,
            status: match id {
                DeveloperPermissionId::Accessibility => granted_or_unknown(accessibility),
                DeveloperPermissionId::Screen => granted_or_unknown(screenshots),
                DeveloperPermissionId::FullDiskAccess => full_disk_access,
                DeveloperPermissionId::Usb | DeveloperPermissionId::Bluetooth => {
                    DeveloperPermissionStatus::Ready
                }
                DeveloperPermissionId::Microphone
                | DeveloperPermissionId::Camera
                | DeveloperPermissionId::Automation
                | DeveloperPermissionId::LocalNetwork => DeveloperPermissionStatus::Unknown,
            },
        })
        .collect()
}

pub(super) async fn request(
    computer: &ComputerAuthority,
    id: DeveloperPermissionId,
) -> Result<DeveloperPermissionRequest, DeveloperPermissionsError> {
    if let Some(permission) = computer_use_permission(id) {
        let opened = computer.open_computer_use_permission(permission).await?;
        return Ok(DeveloperPermissionRequest {
            id,
            opened_system_settings: opened.opened_settings,
            status: granted_or_unknown(opened.granted),
        });
    }
    open_privacy_pane(id).await?;
    Ok(DeveloperPermissionRequest {
        id,
        opened_system_settings: true,
        status: status(computer)
            .await
            .into_iter()
            .find(|state| state.id == id)
            .map_or(DeveloperPermissionStatus::Unknown, |state| state.status),
    })
}

async fn full_disk_access_status() -> DeveloperPermissionStatus {
    // Why: this is a daemon capability, so probe a protected file through the
    // daemon identity rather than asking for a grant the system holds per app.
    let Some(home) = crate::paths::resolve_local_home_path() else {
        return DeveloperPermissionStatus::Unknown;
    };
    let probe = home.join("Library").join("Safari").join("Bookmarks.plist");
    if tokio::fs::metadata(probe).await.is_ok() {
        DeveloperPermissionStatus::Granted
    } else {
        DeveloperPermissionStatus::Unknown
    }
}

async fn open_privacy_pane(id: DeveloperPermissionId) -> Result<(), DeveloperPermissionsError> {
    let status = Command::new("/usr/bin/open")
        .arg(privacy_pane_url(id))
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .await;
    match status {
        Ok(status) if status.success() => Ok(()),
        _ => Err(DeveloperPermissionsError::SettingsOpenFailed),
    }
}

fn granted_or_unknown(is_granted: bool) -> DeveloperPermissionStatus {
    if is_granted {
        DeveloperPermissionStatus::Granted
    } else {
        DeveloperPermissionStatus::Unknown
    }
}

/// The two permissions the Computer Use helper owns; every other permission is
/// granted through a system settings pane instead.
fn computer_use_permission(id: DeveloperPermissionId) -> Option<ComputerUsePermission> {
    match id {
        DeveloperPermissionId::Accessibility => Some(ComputerUsePermission::Accessibility),
        DeveloperPermissionId::Screen => Some(ComputerUsePermission::Screenshots),
        _ => None,
    }
}

/// The pane that grants one permission. Permissions without a dedicated pane
/// open the Privacy & Security root instead.
fn privacy_pane_url(id: DeveloperPermissionId) -> &'static str {
    match id {
        DeveloperPermissionId::Accessibility => {
            "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
        }
        DeveloperPermissionId::Automation => {
            "x-apple.systempreferences:com.apple.preference.security?Privacy_Automation"
        }
        DeveloperPermissionId::Bluetooth => {
            "x-apple.systempreferences:com.apple.preference.security?Privacy_Bluetooth"
        }
        DeveloperPermissionId::Camera => {
            "x-apple.systempreferences:com.apple.preference.security?Privacy_Camera"
        }
        DeveloperPermissionId::FullDiskAccess => {
            "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles"
        }
        DeveloperPermissionId::Microphone => {
            "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"
        }
        DeveloperPermissionId::Screen => {
            "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
        }
        DeveloperPermissionId::LocalNetwork | DeveloperPermissionId::Usb => {
            PRIVACY_SECURITY_PANE_URL
        }
    }
}

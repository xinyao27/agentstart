use crate::computer::ComputerAuthority;

use super::{
    DeveloperPermissionId, DeveloperPermissionRequest, DeveloperPermissionState,
    DeveloperPermissionStatus, DeveloperPermissionsError,
};

// Why: these grants are macOS TCC concepts. Reporting every permission as
// unsupported keeps the pane honest instead of implying a grant the platform
// never gates.
pub(super) async fn status(_computer: &ComputerAuthority) -> Vec<DeveloperPermissionState> {
    DeveloperPermissionId::ALL
        .into_iter()
        .map(|id| DeveloperPermissionState {
            id,
            status: DeveloperPermissionStatus::Unsupported,
        })
        .collect()
}

pub(super) async fn request(
    _computer: &ComputerAuthority,
    id: DeveloperPermissionId,
) -> Result<DeveloperPermissionRequest, DeveloperPermissionsError> {
    Ok(DeveloperPermissionRequest {
        id,
        opened_system_settings: false,
        status: DeveloperPermissionStatus::Unsupported,
    })
}

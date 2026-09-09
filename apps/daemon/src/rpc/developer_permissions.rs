pub(super) mod protocol;

use crate::developer_permissions::{
    DeveloperPermissionId, DeveloperPermissionRequest, DeveloperPermissionState,
    DeveloperPermissionsAuthority, DeveloperPermissionsError,
};

#[derive(Clone)]
pub(super) struct DeveloperPermissionsRpc {
    authority: DeveloperPermissionsAuthority,
}

impl DeveloperPermissionsRpc {
    pub(super) fn new(authority: DeveloperPermissionsAuthority) -> Self {
        Self { authority }
    }

    pub(super) async fn status(&self) -> Vec<DeveloperPermissionState> {
        self.authority.status().await
    }

    pub(super) async fn request(
        &self,
        id: DeveloperPermissionId,
    ) -> Result<DeveloperPermissionRequest, DeveloperPermissionsError> {
        self.authority.request(id).await
    }
}

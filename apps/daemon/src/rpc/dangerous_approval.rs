pub(super) mod protocol;
pub(super) mod protocol_values;

use crate::dangerous_approval::DangerousApprovalAuthority;

#[derive(Clone)]
pub(super) struct DangerousApprovalRpc {
    pub(super) authority: DangerousApprovalAuthority,
}

impl DangerousApprovalRpc {
    pub(super) fn new(authority: DangerousApprovalAuthority) -> Self {
        Self { authority }
    }
}

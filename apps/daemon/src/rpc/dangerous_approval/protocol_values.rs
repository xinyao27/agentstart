use yiru_protocol::runtime::v1::{
    DangerousApprovalServiceBeginApprovalResponse,
    DangerousApprovalServiceBeginRegistrationResponse,
    DangerousApprovalServiceFinishApprovalResponse, DangerousApprovalServiceStatusResponse,
};

use crate::dangerous_approval::{
    BeginApprovalResult, BeginRegistrationResult, DangerousApprovalStatus, FinishApprovalResult,
};

pub(in crate::rpc) fn protocol_status(
    status: &DangerousApprovalStatus,
) -> DangerousApprovalServiceStatusResponse {
    DangerousApprovalServiceStatusResponse {
        configured: status.configured,
        credential_id: status.credential_id.clone(),
    }
}

pub(in crate::rpc) fn protocol_begin_registration(
    result: &BeginRegistrationResult,
) -> DangerousApprovalServiceBeginRegistrationResponse {
    DangerousApprovalServiceBeginRegistrationResponse {
        challenge: result.challenge.clone(),
        request_id: result.request_id.clone(),
        user_id: result.user_id.clone(),
    }
}

pub(in crate::rpc) fn protocol_begin_approval(
    result: &BeginApprovalResult,
) -> DangerousApprovalServiceBeginApprovalResponse {
    DangerousApprovalServiceBeginApprovalResponse {
        challenge: result.challenge.clone(),
        request_id: result.request_id.clone(),
    }
}

pub(in crate::rpc) fn protocol_finish_approval(
    result: &FinishApprovalResult,
) -> DangerousApprovalServiceFinishApprovalResponse {
    DangerousApprovalServiceFinishApprovalResponse {
        approved_until: result.approved_until,
    }
}

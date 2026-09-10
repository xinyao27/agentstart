use agentstart_protocol::protocol::v1::{Status, StatusCode};
use agentstart_protocol::runtime::v1::{
    AppControlServiceRecordStartupDiagnosticRequest,
    AppControlServiceRecordStartupDiagnosticResponse, AppControlServiceRestartRequest,
    AppControlServiceRestartResponse,
};
use agentstart_protocol::transport::{decode, encode};

use crate::app_control::AppControlError;

use super::AppControlRpc;
use crate::rpc::protocol_call::{
    ProtocolDeliveryGuard, ProtocolDeliveryOutcome, ProtocolHandlerResponse,
};

pub(in crate::rpc) fn restart(
    rpc: &AppControlRpc,
    payload: &[u8],
) -> Result<ProtocolHandlerResponse, Status> {
    let _ = decode::<AppControlServiceRestartRequest>(payload)?;
    let pending = rpc.authority.begin_restart().map_err(app_control_status)?;
    let response = encode(&AppControlServiceRestartResponse { accepted: true });
    let delivery = ProtocolDeliveryGuard::new(move |outcome| match outcome {
        ProtocolDeliveryOutcome::Confirmed => pending.confirm(),
        ProtocolDeliveryOutcome::RolledBack => drop(pending),
    });
    Ok(ProtocolHandlerResponse::with_delivery(response, delivery))
}

pub(in crate::rpc) fn record_startup_diagnostic(
    rpc: &AppControlRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<AppControlServiceRecordStartupDiagnosticRequest>(payload)?;
    let recorded = rpc
        .authority
        .record_startup_diagnostic(
            &request.event,
            request.renderer_elapsed_ms,
            request.duration_ms,
        )
        .map_err(app_control_status)?;
    Ok(encode(&AppControlServiceRecordStartupDiagnosticResponse {
        recorded,
    }))
}

fn app_control_status(error: AppControlError) -> Status {
    let code = match error {
        AppControlError::RestartAlreadyPending => StatusCode::FailedPrecondition,
        AppControlError::InvalidStartupDiagnosticEvent => StatusCode::InvalidArgument,
        AppControlError::StartupDiagnosticWrite => StatusCode::Internal,
    };
    Status {
        code: code as i32,
        message: error.to_string(),
        details: Vec::new(),
    }
}

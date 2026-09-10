use agentstart_protocol::protocol::v1::{Status, StatusCode};
use agentstart_protocol::runtime::v1::{
    GetAutoRestoreFitRequest, GetAutoRestoreFitResponse, SetAutoRestoreFitRequest,
    SetAutoRestoreFitResponse,
};
use agentstart_protocol::transport::{decode, encode};

use crate::terminal_session::TerminalSessionAuthority;

pub(super) fn protocol_auto_restore_fit(
    authority: &TerminalSessionAuthority,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    decode::<GetAutoRestoreFitRequest>(payload)?;
    Ok(encode(&GetAutoRestoreFitResponse {
        milliseconds: authority.get_auto_restore_fit_ms(),
    }))
}

pub(super) async fn protocol_set_auto_restore_fit(
    authority: &TerminalSessionAuthority,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<SetAutoRestoreFitRequest>(payload)?;
    if request.milliseconds.is_some_and(|value| !value.is_finite()) {
        return Err(Status {
            code: StatusCode::InvalidArgument as i32,
            message: "Terminal preference milliseconds must be finite".to_owned(),
            details: Vec::new(),
        });
    }
    let milliseconds = authority
        .set_auto_restore_fit_ms(request.milliseconds)
        .await
        .map_err(|_| Status {
            code: StatusCode::Internal as i32,
            message: "Terminal preference could not be stored".to_owned(),
            details: Vec::new(),
        })?;
    Ok(encode(&SetAutoRestoreFitResponse { milliseconds }))
}

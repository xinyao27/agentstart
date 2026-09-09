use serde_json::{Map, Value, json};
use yiru_protocol::protocol::v1::{Status, StatusCode};
use yiru_protocol::runtime::v1::{
    RitualKind, RitualSchedule as ProtocolSchedule, RitualServiceGetScheduleRequest,
    RitualServiceRunRequest, RitualServiceScheduleResponse, RitualServiceSetScheduleRequest,
};
use yiru_protocol::transport::{decode, encode};

use crate::ritual::RitualSchedule;

use super::RitualRpc;
use super::RitualRpcError;
use super::parse_schedule;
use super::protocol_values::{run_result, schedule_status};

pub(in crate::rpc) async fn get_schedule(
    rpc: &RitualRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    decode::<RitualServiceGetScheduleRequest>(payload)?;
    let schedule = rpc.get_schedule().await.map_err(ritual_status)?;
    Ok(encode(&RitualServiceScheduleResponse {
        schedule: Some(schedule_status(&schedule)),
    }))
}

pub(in crate::rpc) async fn set_schedule(
    rpc: &RitualRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<RitualServiceSetScheduleRequest>(payload)?;
    let schedule = schedule_input(request.schedule)?;
    let status = rpc.set_schedule(schedule).await.map_err(ritual_status)?;
    Ok(encode(&RitualServiceScheduleResponse {
        schedule: Some(schedule_status(&status)),
    }))
}

pub(in crate::rpc) async fn run(rpc: &RitualRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<RitualServiceRunRequest>(payload)?;
    let kind = match request.kind() {
        RitualKind::StartDay => "start-day",
        RitualKind::EndDay => "end-day",
        RitualKind::Unspecified => {
            return Err(invalid_argument("Ritual kind is invalid"));
        }
    };
    let result = rpc.run(kind).await.map_err(ritual_status)?;
    Ok(encode(&run_result(request.kind(), &result)))
}

// Why: the typed schedule renders into the legacy JSON input shape and reuses
// the legacy parser, so timezone bounds and weekday rules are validated in one
// place for both transports.
fn schedule_input(schedule: Option<ProtocolSchedule>) -> Result<RitualSchedule, Status> {
    let Some(schedule) = schedule else {
        return Err(invalid_argument("A ritual schedule is required"));
    };
    let object = Map::from_iter([
        (
            "archiveOnEndDay".to_owned(),
            json!(schedule.archive_on_end_day),
        ),
        ("enabled".to_owned(), json!(schedule.enabled)),
        ("endMinutes".to_owned(), json!(schedule.end_minutes)),
        ("startMinutes".to_owned(), json!(schedule.start_minutes)),
        ("timezone".to_owned(), json!(schedule.timezone)),
        ("weekdays".to_owned(), json!(schedule.weekdays)),
    ]);
    parse_schedule(Some(&Value::Object(object)))
        .map_err(|_| invalid_argument("Ritual input is invalid"))
}

fn ritual_status(error: RitualRpcError) -> Status {
    match error {
        RitualRpcError::Input => invalid_argument("Ritual input is invalid"),
        RitualRpcError::State(_) | RitualRpcError::Approval(_) => {
            status(StatusCode::Internal, &error.to_string())
        }
    }
}

fn invalid_argument(message: &str) -> Status {
    status(StatusCode::InvalidArgument, message)
}

fn status(code: StatusCode, message: &str) -> Status {
    Status {
        code: code as i32,
        message: message.to_owned(),
        details: Vec::new(),
    }
}

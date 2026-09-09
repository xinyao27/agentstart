pub(in crate::rpc) mod protocol;
pub(in crate::rpc) mod protocol_values;

use serde_json::Value;
use thiserror::Error;

use crate::dangerous_approval::{DangerousApprovalAuthority, DangerousApprovalError};
use crate::ritual::{
    RitualAuthority, RitualError, RitualRunResult, RitualSchedule, RitualScheduleStatus,
};

// Why: the shared wrappers own the side effects around the authority calls —
// most importantly the archive-approval consumption on setSchedule — so the
// protobuf surface cannot drift on when a dangerous approval is required.
#[derive(Clone)]
pub(super) struct RitualRpc {
    authority: RitualAuthority,
    dangerous_approval: DangerousApprovalAuthority,
}

#[derive(Debug, Error)]
pub(super) enum RitualRpcError {
    #[error("ritual input is invalid")]
    Input,
    #[error(transparent)]
    State(#[from] RitualError),
    #[error(transparent)]
    Approval(#[from] DangerousApprovalError),
}

impl RitualRpc {
    pub(super) fn new(
        authority: RitualAuthority,
        dangerous_approval: DangerousApprovalAuthority,
    ) -> Self {
        Self {
            authority,
            dangerous_approval,
        }
    }

    pub(super) async fn get_schedule(&self) -> Result<RitualScheduleStatus, RitualRpcError> {
        Ok(self.authority.get_schedule().await?)
    }

    pub(super) async fn set_schedule(
        &self,
        schedule: RitualSchedule,
    ) -> Result<RitualScheduleStatus, RitualRpcError> {
        if schedule.archive_on_end_day {
            self.dangerous_approval
                .consume("ritual.enable-archive")
                .await?;
        }
        Ok(self.authority.set_schedule(schedule).await?)
    }

    pub(super) async fn run(&self, kind: &str) -> Result<RitualRunResult, RitualRpcError> {
        if !matches!(kind, "start-day" | "end-day") {
            return Err(RitualRpcError::Input);
        }
        Ok(self.authority.run(kind).await?)
    }
}

// Why: the typed schedule renders into a JSON object and reuses this parser,
// so timezone bounds and weekday rules are validated in exactly one place.
pub(super) fn parse_schedule(body: Option<&Value>) -> Result<RitualSchedule, RitualRpcError> {
    let object = body
        .and_then(Value::as_object)
        .ok_or(RitualRpcError::Input)?;
    let archive_on_end_day = object
        .get("archiveOnEndDay")
        .and_then(Value::as_bool)
        .ok_or(RitualRpcError::Input)?;
    let enabled = object
        .get("enabled")
        .and_then(Value::as_bool)
        .ok_or(RitualRpcError::Input)?;
    let end_minutes = integer(object.get("endMinutes"))?
        .try_into()
        .map_err(|_| RitualRpcError::Input)?;
    let start_minutes = integer(object.get("startMinutes"))?
        .try_into()
        .map_err(|_| RitualRpcError::Input)?;
    let timezone = object
        .get("timezone")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty() && value.chars().count() <= 100)
        .map(str::to_owned)
        .ok_or(RitualRpcError::Input)?;
    let weekdays = object
        .get("weekdays")
        .and_then(Value::as_array)
        .filter(|days| (1..=7).contains(&days.len()))
        .ok_or(RitualRpcError::Input)?
        .iter()
        .map(|day| {
            integer(Some(day)).and_then(|value| value.try_into().map_err(|_| RitualRpcError::Input))
        })
        .collect::<Result<Vec<u8>, RitualRpcError>>()?;
    Ok(RitualSchedule {
        archive_on_end_day,
        enabled,
        end_minutes,
        start_minutes,
        timezone,
        weekdays,
    })
}

fn integer(value: Option<&Value>) -> Result<i64, RitualRpcError> {
    value.and_then(Value::as_i64).ok_or(RitualRpcError::Input)
}

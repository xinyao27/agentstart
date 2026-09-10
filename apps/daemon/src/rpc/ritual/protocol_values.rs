// Why: the ritual authority answers with typed schedule and run structs; this
// is the single place that renders those structs into the protobuf wire
// messages, mirroring the legacy serde camelCase projection.
use agentstart_protocol::runtime::v1::{
    RitualKind, RitualProjectResult, RitualScheduleStatus as ProtocolScheduleStatus,
    RitualServiceRunResponse,
};

use crate::ritual::{RitualRunResult, RitualScheduleStatus};

pub(super) fn schedule_status(status: &RitualScheduleStatus) -> ProtocolScheduleStatus {
    ProtocolScheduleStatus {
        enabled: status.enabled,
        archive_on_end_day: status.archive_on_end_day,
        start_minutes: u32::from(status.start_minutes),
        end_minutes: u32::from(status.end_minutes),
        timezone: status.timezone.clone(),
        weekdays: status.weekdays.iter().map(|day| u32::from(*day)).collect(),
        last_start_at: status.last_start_at,
        last_end_at: status.last_end_at,
        last_failure: status.last_failure.clone(),
    }
}

pub(super) fn run_result(kind: RitualKind, result: &RitualRunResult) -> RitualServiceRunResponse {
    RitualServiceRunResponse {
        kind: kind as i32,
        summary: result.summary.clone(),
        projects: result
            .projects
            .iter()
            .map(|project| RitualProjectResult {
                project_id: project.project_id.clone(),
                status: project.status.clone(),
                detail: project.detail.clone(),
            })
            .collect(),
    }
}

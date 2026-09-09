// Why: The secure-file writer publishes reports atomically with installation-scoped permissions.

use std::path::{Path, PathBuf};

use tokio::sync::Mutex;

use crate::transport::secure_file::{self, SecureFileError};

use super::codec::decode_reports;
use super::model::{CrashReportCreateInput, CrashReportRecord, CrashReportStatus};
use super::now_iso8601;
use super::redaction::{sanitize_breadcrumbs, sanitize_details};

const FILE_NAME: &str = "crash-reports.json";
const MAX_REPORTS: usize = 5;
const RELATED_CRASH_WINDOW_MS: i64 = 5_000;

pub(super) struct CrashReportStore {
    file_path: PathBuf,
    // Why: serializes read-modify-write cycles the same way the TS store's
    // `writeChain` promise does, so concurrent RPCs never race a lost update. A plain
    // `list_recent()` also takes this lock (briefly) so a read always observes the
    // result of any write that was already in flight, matching `listRecent()`'s
    // `await this.writeChain` in the TS source.
    write_gate: Mutex<()>,
}

impl CrashReportStore {
    pub(super) fn new(user_data_path: &Path) -> Self {
        Self {
            file_path: user_data_path.join(FILE_NAME),
            write_gate: Mutex::new(()),
        }
    }

    pub(super) async fn record(
        &self,
        input: CrashReportCreateInput,
    ) -> Result<CrashReportRecord, SecureFileError> {
        let _guard = self.write_gate.lock().await;
        let mut reports = self.read_reports().await;
        let report = CrashReportRecord {
            id: random_uuid(),
            created_at: now_iso8601(),
            status: CrashReportStatus::Pending,
            source: input.source,
            process_type: input.process_type,
            reason: input.reason,
            exit_code: input.exit_code,
            app_version: input.app_version,
            platform: input.platform,
            os_release: input.os_release,
            arch: input.arch,
            chrome_version: input.chrome_version,
            details: sanitize_details(&input.details),
            breadcrumbs: sanitize_breadcrumbs(&input.breadcrumbs),
        };
        reports.insert(0, report.clone());
        reports.truncate(MAX_REPORTS);
        self.write_reports(&reports).await?;
        Ok(report)
    }

    pub(super) async fn list_recent(&self) -> Vec<CrashReportRecord> {
        let _guard = self.write_gate.lock().await;
        self.read_reports().await
    }

    pub(super) async fn get_by_id(&self, id: &str) -> Option<CrashReportRecord> {
        self.list_recent()
            .await
            .into_iter()
            .find(|report| report.id == id)
    }

    pub(super) async fn mark_sent(
        &self,
        id: &str,
    ) -> Result<Option<CrashReportRecord>, SecureFileError> {
        self.transition_status(id, CrashReportStatus::Pending, CrashReportStatus::Sent)
            .await
    }

    pub(super) async fn mark_dismissed_sent(
        &self,
        id: &str,
    ) -> Result<Option<CrashReportRecord>, SecureFileError> {
        self.transition_status(id, CrashReportStatus::Dismissed, CrashReportStatus::Sent)
            .await
    }

    pub(super) async fn dismiss(
        &self,
        id: &str,
    ) -> Result<Option<CrashReportRecord>, SecureFileError> {
        self.transition_status(id, CrashReportStatus::Pending, CrashReportStatus::Dismissed)
            .await
    }

    /// Mirrors `CrashReportStore#transitionStatus`: moves `id` from `from` to `status`
    /// (a no-op returning the current record if it isn't in `from`), and — the same
    /// pass — dismisses every other still-`from`-status report that looks like the
    /// same crash event (`is_related_crash_event`), so a crash that produced several
    /// near-simultaneous reports doesn't keep nagging after the first is handled.
    async fn transition_status(
        &self,
        id: &str,
        from: CrashReportStatus,
        status: CrashReportStatus,
    ) -> Result<Option<CrashReportRecord>, SecureFileError> {
        let _guard = self.write_gate.lock().await;
        let mut reports = self.read_reports().await;
        let anchor = reports.iter().find(|report| report.id == id).cloned();
        let mut result = None;
        for report in &mut reports {
            if report.id != id {
                if anchor.as_ref().is_some_and(|anchor| anchor.status == from)
                    && is_related_crash_event(anchor.as_ref().expect("checked above"), report)
                {
                    report.status = CrashReportStatus::Dismissed;
                }
                continue;
            }
            if report.status != from {
                result = Some(report.clone());
                continue;
            }
            report.status = status;
            result = Some(report.clone());
        }
        self.write_reports(&reports).await?;
        Ok(result)
    }

    async fn read_reports(&self) -> Vec<CrashReportRecord> {
        match tokio::fs::read_to_string(&self.file_path).await {
            Ok(contents) => match serde_json::from_str(&contents) {
                Ok(value) => decode_reports(&value, MAX_REPORTS),
                Err(error) => {
                    eprintln!("[crash-reports] failed to parse crash reports: {error}");
                    Vec::new()
                }
            },
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Vec::new(),
            Err(error) => {
                eprintln!("[crash-reports] failed to read crash reports: {error}");
                Vec::new()
            }
        }
    }

    async fn write_reports(&self, reports: &[CrashReportRecord]) -> Result<(), SecureFileError> {
        let payload = serde_json::json!({ "reports": reports });
        secure_file::write_json(&self.file_path, &payload)
    }
}

fn is_related_crash_event(anchor: &CrashReportRecord, candidate: &CrashReportRecord) -> bool {
    if anchor.id == candidate.id || candidate.status != CrashReportStatus::Pending {
        return false;
    }
    let (Some(anchor_time), Some(candidate_time)) = (
        parse_millis(&anchor.created_at),
        parse_millis(&candidate.created_at),
    ) else {
        return false;
    };
    (anchor_time - candidate_time).abs() <= RELATED_CRASH_WINDOW_MS
        && anchor.reason == candidate.reason
        && anchor.exit_code == candidate.exit_code
        && anchor.app_version == candidate.app_version
        && anchor.platform == candidate.platform
}

fn parse_millis(created_at: &str) -> Option<i64> {
    chrono::DateTime::parse_from_rfc3339(created_at)
        .ok()
        .map(|value| value.timestamp_millis())
}

/// Random v4 UUID for a new report id. `crate::telemetry`'s equivalent is
/// module-private, so this is a small, deliberately self-contained duplicate.
fn random_uuid() -> String {
    let mut bytes = [0_u8; 16];
    getrandom::fill(&mut bytes).expect("OS random source is available");
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    format!(
        "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        bytes[0],
        bytes[1],
        bytes[2],
        bytes[3],
        bytes[4],
        bytes[5],
        bytes[6],
        bytes[7],
        bytes[8],
        bytes[9],
        bytes[10],
        bytes[11],
        bytes[12],
        bytes[13],
        bytes[14],
        bytes[15]
    )
}

use yiru_protocol::protocol::v1::{Status, StatusCode};
use yiru_protocol::runtime::v1::diagnostics_service_upload_bundle_response::Result as UploadResult;
use yiru_protocol::runtime::v1::{
    AppMemory as ProtocolAppMemory, DiagnosticsDisabledReason as ProtocolDisabledReason,
    DiagnosticsServiceCollectBundleRequest, DiagnosticsServiceCollectBundleResponse,
    DiagnosticsServiceDiscardBundlePreviewRequest, DiagnosticsServiceDiscardBundlePreviewResponse,
    DiagnosticsServiceGetStatusRequest, DiagnosticsServiceGetStatusResponse,
    DiagnosticsServiceOpenBundlePreviewRequest, DiagnosticsServiceOpenBundlePreviewResponse,
    DiagnosticsServiceUploadBundleRequest, DiagnosticsServiceUploadBundleResponse,
    GetMemorySnapshotRequest, GetMemorySnapshotResponse, HostMemory as ProtocolHostMemory,
    SessionMemory as ProtocolSessionMemory, UsageValues as ProtocolUsageValues,
    WorktreeMemory as ProtocolWorktreeMemory,
};
use yiru_protocol::transport::{decode, encode};

use crate::diagnostics::{
    AppMemory, DiagnosticsDisabledReason, HostMemory, MemoryDiagnostics, MemorySnapshot,
    SessionMemory, SupportDiagnosticsError, TraceSpan, UsageValues, WorktreeMemory,
};
use crate::telemetry::SupportReportError;

#[derive(Clone)]
pub(super) struct DiagnosticsRpc {
    diagnostics: MemoryDiagnostics,
}

impl DiagnosticsRpc {
    pub(super) fn new(diagnostics: MemoryDiagnostics) -> Self {
        Self { diagnostics }
    }

    pub(super) fn start_trace_span(
        &self,
        name: &'static str,
        attributes: serde_json::Map<String, serde_json::Value>,
    ) -> TraceSpan {
        self.diagnostics.start_trace_span(name, attributes)
    }

    pub(super) fn start_root_trace_span(
        &self,
        name: &'static str,
        attributes: serde_json::Map<String, serde_json::Value>,
    ) -> TraceSpan {
        self.diagnostics.start_root_trace_span(name, attributes)
    }

    pub(super) async fn protocol_memory_snapshot(&self, payload: &[u8]) -> Result<Vec<u8>, Status> {
        decode::<GetMemorySnapshotRequest>(payload)?;
        Ok(encode(&protocol_snapshot(
            self.diagnostics.snapshot().await,
        )))
    }

    pub(super) fn protocol_status(&self, payload: &[u8]) -> Result<Vec<u8>, Status> {
        decode::<DiagnosticsServiceGetStatusRequest>(payload)?;
        let status = self.diagnostics.support_status();
        Ok(encode(&DiagnosticsServiceGetStatusResponse {
            local_file_enabled: status.local_file_enabled,
            bundle_enabled: status.bundle_enabled,
            trace_file_path: status.trace_file_path,
            trace_family_size: status.trace_family_size,
            disabled_reason: status.disabled_reason.map(protocol_disabled_reason),
        }))
    }

    pub(super) async fn protocol_collect_bundle(&self, payload: &[u8]) -> Result<Vec<u8>, Status> {
        let request = decode::<DiagnosticsServiceCollectBundleRequest>(payload)?;
        let bundle = self
            .diagnostics
            .collect_bundle(request.lookback_minutes)
            .await
            .map_err(support_status)?;
        Ok(encode(&DiagnosticsServiceCollectBundleResponse {
            bundle_submission_id: bundle.bundle_submission_id,
            bytes: bundle.bytes,
            span_count: bundle.span_count,
        }))
    }

    pub(super) async fn protocol_open_bundle_preview(
        &self,
        payload: &[u8],
    ) -> Result<Vec<u8>, Status> {
        let request = decode::<DiagnosticsServiceOpenBundlePreviewRequest>(payload)?;
        self.diagnostics
            .open_bundle_preview(&request.bundle_submission_id)
            .await
            .map_err(support_status)?;
        Ok(encode(&DiagnosticsServiceOpenBundlePreviewResponse {}))
    }

    pub(super) fn protocol_discard_bundle_preview(
        &self,
        payload: &[u8],
    ) -> Result<Vec<u8>, Status> {
        let request = decode::<DiagnosticsServiceDiscardBundlePreviewRequest>(payload)?;
        self.diagnostics
            .discard_bundle_preview(&request.bundle_submission_id)
            .map_err(support_status)?;
        Ok(encode(&DiagnosticsServiceDiscardBundlePreviewResponse {}))
    }

    pub(super) async fn protocol_upload_bundle(&self, payload: &[u8]) -> Result<Vec<u8>, Status> {
        let request = decode::<DiagnosticsServiceUploadBundleRequest>(payload)?;
        let upload = self
            .diagnostics
            .upload_bundle(&request.bundle_submission_id)
            .await
            .map_err(support_status)?;
        Ok(encode(&DiagnosticsServiceUploadBundleResponse {
            result: Some(UploadResult::TicketId(upload.ticket_id)),
        }))
    }
}

fn protocol_disabled_reason(reason: DiagnosticsDisabledReason) -> i32 {
    (match reason {
        DiagnosticsDisabledReason::DoNotTrack => ProtocolDisabledReason::DoNotTrack,
        DiagnosticsDisabledReason::YiruTelemetryDisabled => {
            ProtocolDisabledReason::YiruTelemetryDisabled
        }
        DiagnosticsDisabledReason::YiruDiagnosticsDisabled => {
            ProtocolDisabledReason::YiruDiagnosticsDisabled
        }
        DiagnosticsDisabledReason::Ci => ProtocolDisabledReason::Ci,
    }) as i32
}

fn support_status(error: SupportDiagnosticsError) -> Status {
    let code = match &error {
        SupportDiagnosticsError::InvalidBundleId => StatusCode::InvalidArgument,
        SupportDiagnosticsError::CollectionDisabled
        | SupportDiagnosticsError::Expired
        | SupportDiagnosticsError::PreviewNotOpened
        | SupportDiagnosticsError::UploadDisabled
        | SupportDiagnosticsError::AlreadyUploading => StatusCode::FailedPrecondition,
        SupportDiagnosticsError::OpenFailed | SupportDiagnosticsError::Io(_) => {
            StatusCode::Internal
        }
        SupportDiagnosticsError::Report(report) => match report {
            SupportReportError::NotConfigured
            | SupportReportError::ShuttingDown
            | SupportReportError::AlreadySending => StatusCode::FailedPrecondition,
            SupportReportError::RateLimited => StatusCode::ResourceExhausted,
            SupportReportError::InvalidContent => StatusCode::Internal,
            SupportReportError::Transport | SupportReportError::Telemetry(_) => {
                StatusCode::Unavailable
            }
        },
    };
    Status {
        code: code as i32,
        message: error.to_string(),
        details: Vec::new(),
    }
}

fn protocol_snapshot(snapshot: MemorySnapshot) -> GetMemorySnapshotResponse {
    GetMemorySnapshotResponse {
        app: Some(protocol_app(snapshot.app)),
        worktrees: snapshot
            .worktrees
            .into_iter()
            .map(protocol_worktree)
            .collect(),
        host: Some(protocol_host(snapshot.host)),
        total_cpu: snapshot.total_cpu,
        total_memory: snapshot.total_memory,
        collected_at: snapshot.collected_at,
    }
}

fn protocol_usage(usage: UsageValues) -> ProtocolUsageValues {
    ProtocolUsageValues {
        cpu: usage.cpu,
        memory: usage.memory,
    }
}

fn protocol_app(app: AppMemory) -> ProtocolAppMemory {
    ProtocolAppMemory {
        cpu: app.cpu,
        memory: app.memory,
        daemon: Some(protocol_usage(app.daemon)),
        other: Some(protocol_usage(app.other)),
        history: app.history,
    }
}

fn protocol_session(session: SessionMemory) -> ProtocolSessionMemory {
    ProtocolSessionMemory {
        cpu: session.cpu,
        memory: session.memory,
        session_id: session.session_id,
        pane_key: session.pane_key,
        pid: session.pid,
    }
}

fn protocol_worktree(worktree: WorktreeMemory) -> ProtocolWorktreeMemory {
    ProtocolWorktreeMemory {
        cpu: worktree.cpu,
        memory: worktree.memory,
        worktree_id: worktree.worktree_id,
        worktree_name: worktree.worktree_name,
        repo_id: worktree.repo_id,
        repo_name: worktree.repo_name,
        sessions: worktree
            .sessions
            .into_iter()
            .map(protocol_session)
            .collect(),
        history: worktree.history,
    }
}

fn protocol_host(host: HostMemory) -> ProtocolHostMemory {
    ProtocolHostMemory {
        total_memory: host.total_memory,
        free_memory: host.free_memory,
        used_memory: host.used_memory,
        memory_usage_percent: host.memory_usage_percent,
        cpu_core_count: u32::try_from(host.cpu_core_count).unwrap_or(u32::MAX),
        load_average_1m: host.load_average_1m,
    }
}

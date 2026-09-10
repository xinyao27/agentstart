// Why: decode -> call authority -> encode, matching apps/daemon/src/rpc/diagnostics.rs.
// Conversion helpers live in crash_reports/protocol.rs (the same split as
// rpc/github.rs + rpc/github/protocol.rs) because there are enough message shapes here
// (CrashReport, its breadcrumbs/details, three response unions) to crowd this file.

mod protocol;

use agentstart_protocol::protocol::v1::Status;
use agentstart_protocol::runtime::v1::{
    CrashReportsServiceCopyLatestDiagnosticsRequest, CrashReportsServiceDismissRequest,
    CrashReportsServiceGetLatestPendingRequest, CrashReportsServiceGetLatestReportRequest,
    CrashReportsServiceRecordBreadcrumbRequest, CrashReportsServiceRecordBreadcrumbResponse,
    CrashReportsServiceRecordRendererErrorRequest, CrashReportsServiceSubmitRequest,
};
use agentstart_protocol::transport::{decode, encode};

use crate::crash_reports::CrashReportAuthority;
use crate::crash_reports::model::CrashReportBreadcrumbRecordArgs;

#[derive(Clone)]
pub(super) struct CrashReportsRpc {
    authority: CrashReportAuthority,
}

impl CrashReportsRpc {
    pub(super) fn new(authority: CrashReportAuthority) -> Self {
        Self { authority }
    }

    pub(super) async fn protocol_get_latest_pending(
        &self,
        payload: &[u8],
    ) -> Result<Vec<u8>, Status> {
        decode::<CrashReportsServiceGetLatestPendingRequest>(payload)?;
        let report = self.authority.get_latest_pending().await;
        Ok(encode(&protocol::get_latest_pending_response(report)))
    }

    pub(super) async fn protocol_get_latest_report(
        &self,
        payload: &[u8],
    ) -> Result<Vec<u8>, Status> {
        decode::<CrashReportsServiceGetLatestReportRequest>(payload)?;
        let report = self.authority.get_latest_report().await;
        Ok(encode(&protocol::get_latest_report_response(report)))
    }

    pub(super) async fn protocol_dismiss(&self, payload: &[u8]) -> Result<Vec<u8>, Status> {
        let request = decode::<CrashReportsServiceDismissRequest>(payload)?;
        let report = self
            .authority
            .dismiss(&request.report_id)
            .await
            .map_err(store_error)?;
        Ok(encode(&protocol::dismiss_response(report)))
    }

    pub(super) fn protocol_record_breadcrumb(&self, payload: &[u8]) -> Result<Vec<u8>, Status> {
        let request = decode::<CrashReportsServiceRecordBreadcrumbRequest>(payload)?;
        self.authority
            .record_breadcrumb(CrashReportBreadcrumbRecordArgs {
                name: request.name,
                data: request.data.map(protocol::decode_details),
            });
        Ok(encode(&CrashReportsServiceRecordBreadcrumbResponse {}))
    }

    pub(super) async fn protocol_record_renderer_error(
        &self,
        payload: &[u8],
    ) -> Result<Vec<u8>, Status> {
        let request = decode::<CrashReportsServiceRecordRendererErrorRequest>(payload)?;
        let result = self
            .authority
            .record_renderer_error(protocol::decode_renderer_error_args(request))
            .await;
        Ok(encode(&protocol::encode_renderer_error_response(result)))
    }

    pub(super) async fn protocol_submit(&self, payload: &[u8]) -> Result<Vec<u8>, Status> {
        let request = decode::<CrashReportsServiceSubmitRequest>(payload)?;
        let result = self
            .authority
            .submit(protocol::decode_submit_args(request))
            .await;
        Ok(encode(&protocol::encode_submit_response(result)))
    }

    pub(super) async fn protocol_copy_latest_diagnostics(
        &self,
        payload: &[u8],
    ) -> Result<Vec<u8>, Status> {
        let request = decode::<CrashReportsServiceCopyLatestDiagnosticsRequest>(payload)?;
        let result = self
            .authority
            .copy_latest_diagnostics(protocol::decode_copy_args(request))
            .await;
        Ok(encode(&protocol::encode_copy_response(result)))
    }
}

fn store_error(error: crate::transport::secure_file::SecureFileError) -> Status {
    use agentstart_protocol::protocol::v1::StatusCode;
    Status {
        code: StatusCode::Internal as i32,
        message: error.to_string(),
        details: Vec::new(),
    }
}

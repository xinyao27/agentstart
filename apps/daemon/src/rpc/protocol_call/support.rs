use super::{
    CallerClass, ProtocolCallContext, ProtocolHandlerOutcome, ProtocolHandlerResponse,
    ProtocolRequest, ProtocolRouter, feedback_protocol, notification_protocol,
    shell_telemetry_protocol, star_nag_protocol,
};

pub(super) enum Method {
    DiagnosticsServiceGetMemorySnapshot,
    DiagnosticsServiceGetStatus,
    DiagnosticsServiceCollectBundle,
    DiagnosticsServiceOpenBundlePreview,
    DiagnosticsServiceDiscardBundlePreview,
    DiagnosticsServiceUploadBundle,
    NotificationsServiceDismiss,
    NotificationsServiceReport,
    NotificationsServiceGetMissedSince,
    NotificationsServiceLoadCustomSound,
    NotificationsServiceRegisterPush,
    NotificationsServiceSubscribe,
    StarNagShellServiceDismiss,
    StarNagShellServiceLater,
    StarNagShellServiceComplete,
    StarNagShellServiceOpenWeb,
    StarNagShellServiceStarYiru,
    StarNagShellServiceAgentValueMoment,
    StarNagShellServiceShowAgentValueMoment,
    StarNagShellServiceOnboardingCompleted,
    FeedbackServiceSubmit,
    CrashReportsServiceGetLatestPending,
    CrashReportsServiceGetLatestReport,
    CrashReportsServiceDismiss,
    CrashReportsServiceRecordRendererError,
    CrashReportsServiceSubmit,
    CrashReportsServiceCopyLatestDiagnostics,
    CrashReportsServiceRecordBreadcrumb,
    ShellTelemetryServiceTrack,
    ShellTelemetryServiceGetConsentState,
    ShellTelemetryServiceSetOptIn,
    ShellTelemetryServiceAcknowledgeBanner,
}

impl ProtocolRouter {
    pub(super) async fn handle_support(
        &self,
        method: Method,
        request: ProtocolRequest<'_>,
        context: &ProtocolCallContext,
    ) -> ProtocolHandlerOutcome {
        let result = match method {
            Method::DiagnosticsServiceGetMemorySnapshot => self
                .diagnostics
                .protocol_memory_snapshot(request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::DiagnosticsServiceGetStatus => self
                .diagnostics
                .protocol_status(request.payload)
                .map(ProtocolHandlerResponse::plain),
            Method::DiagnosticsServiceCollectBundle => self
                .diagnostics
                .protocol_collect_bundle(request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::DiagnosticsServiceOpenBundlePreview => self
                .diagnostics
                .protocol_open_bundle_preview(request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::DiagnosticsServiceDiscardBundlePreview => self
                .diagnostics
                .protocol_discard_bundle_preview(request.payload)
                .map(ProtocolHandlerResponse::plain),
            Method::DiagnosticsServiceUploadBundle => self
                .diagnostics
                .protocol_upload_bundle(request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::NotificationsServiceDismiss => notification_protocol::dismiss(
                &self.notifications,
                request.payload,
                (context.access().principal() == CallerClass::Local)
                    .then(|| format!("web:{}", self.connection_id)),
            )
            .await
            .map(ProtocolHandlerResponse::plain),
            Method::NotificationsServiceReport => notification_protocol::report(
                &self.notifications,
                request.payload,
                (context.access().principal() == CallerClass::Local)
                    .then(|| format!("web:{}", self.connection_id)),
            )
            .await
            .map(ProtocolHandlerResponse::plain),
            Method::NotificationsServiceGetMissedSince => notification_protocol::get_missed_since(
                &self.notifications.authority(),
                request.payload,
            )
            .await
            .map(ProtocolHandlerResponse::plain),
            Method::NotificationsServiceLoadCustomSound => {
                return match notification_protocol::load_custom_sound(
                    &self.notifications.sounds(),
                    request.payload,
                    context,
                )
                .await
                {
                    Ok(()) => ProtocolHandlerOutcome::StreamComplete,
                    Err(error) => ProtocolHandlerOutcome::Failed(error),
                };
            }
            Method::NotificationsServiceRegisterPush => notification_protocol::register_push(
                &self.notifications.devices(),
                request.payload,
                context.access(),
            )
            .await
            .map(ProtocolHandlerResponse::plain),
            Method::NotificationsServiceSubscribe => {
                return match notification_protocol::subscribe(
                    &self.notifications.authority(),
                    request.payload,
                    context,
                )
                .await
                {
                    Ok(()) => ProtocolHandlerOutcome::StreamComplete,
                    Err(error) => ProtocolHandlerOutcome::Failed(error),
                };
            }
            Method::StarNagShellServiceDismiss => {
                star_nag_protocol::dismiss(&self.star_nag, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::StarNagShellServiceLater => {
                star_nag_protocol::later(&self.star_nag, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::StarNagShellServiceComplete => {
                star_nag_protocol::complete(&self.star_nag, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::StarNagShellServiceOpenWeb => {
                star_nag_protocol::open_web(&self.star_nag, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::StarNagShellServiceStarYiru => {
                star_nag_protocol::star_yiru(&self.star_nag, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::StarNagShellServiceAgentValueMoment => {
                star_nag_protocol::agent_value_moment(&self.star_nag, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::StarNagShellServiceShowAgentValueMoment => {
                star_nag_protocol::show_agent_value_moment(&self.star_nag, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::StarNagShellServiceOnboardingCompleted => {
                star_nag_protocol::onboarding_completed(&self.star_nag, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::FeedbackServiceSubmit => {
                feedback_protocol::submit(&self.feedback, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::CrashReportsServiceGetLatestPending => self
                .crash_reports
                .protocol_get_latest_pending(request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::CrashReportsServiceGetLatestReport => self
                .crash_reports
                .protocol_get_latest_report(request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::CrashReportsServiceDismiss => self
                .crash_reports
                .protocol_dismiss(request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::CrashReportsServiceRecordRendererError => self
                .crash_reports
                .protocol_record_renderer_error(request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::CrashReportsServiceSubmit => self
                .crash_reports
                .protocol_submit(request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::CrashReportsServiceCopyLatestDiagnostics => self
                .crash_reports
                .protocol_copy_latest_diagnostics(request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::CrashReportsServiceRecordBreadcrumb => self
                .crash_reports
                .protocol_record_breadcrumb(request.payload)
                .map(ProtocolHandlerResponse::plain),
            Method::ShellTelemetryServiceTrack => {
                shell_telemetry_protocol::track(&self.shell_telemetry, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ShellTelemetryServiceGetConsentState => {
                shell_telemetry_protocol::get_consent_state(&self.shell_telemetry, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ShellTelemetryServiceSetOptIn => {
                shell_telemetry_protocol::set_opt_in(&self.shell_telemetry, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ShellTelemetryServiceAcknowledgeBanner => {
                shell_telemetry_protocol::acknowledge_banner(&self.shell_telemetry, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
        };
        match result {
            Ok(response) => ProtocolHandlerOutcome::Complete(response),
            Err(error) => ProtocolHandlerOutcome::Failed(error),
        }
    }
}

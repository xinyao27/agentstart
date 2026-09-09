use super::{
    ProtocolCallContext, ProtocolHandlerOutcome, ProtocolHandlerResponse, ProtocolRequest,
    ProtocolRouter, computer_protocol, dangerous_approval_protocol, emulator_protocol,
};

pub(super) enum Method {
    ComputerServiceCapabilities,
    ComputerServiceListApps,
    ComputerServicePermissions,
    ComputerServicePermissionsStatus,
    ComputerServicePermissionsReset,
    ComputerServiceListWindows,
    ComputerServiceGetAppState,
    ComputerServiceClick,
    ComputerServicePerformSecondaryAction,
    ComputerServiceScroll,
    ComputerServiceDrag,
    ComputerServiceTypeText,
    ComputerServicePressKey,
    ComputerServiceHotkey,
    ComputerServicePasteText,
    ComputerServiceSetValue,
    EmulatorServiceList,
    EmulatorServiceAttach,
    EmulatorServiceTap,
    EmulatorServiceGesture,
    EmulatorServiceTypeText,
    EmulatorServiceButton,
    EmulatorServiceRotate,
    EmulatorServiceExec,
    EmulatorServiceKill,
    EmulatorServiceShutdown,
    EmulatorServiceListSimulators,
    EmulatorServiceAvailability,
    EmulatorServiceUnregisterActive,
    EmulatorServiceStreamFrames,
    DangerousApprovalServiceStatus,
    DangerousApprovalServiceBeginRegistration,
    DangerousApprovalServiceFinishRegistration,
    DangerousApprovalServiceBeginApproval,
    DangerousApprovalServiceFinishApproval,
    DangerousApprovalServiceRemove,
}

impl ProtocolRouter {
    pub(super) async fn handle_computer(
        &self,
        method: Method,
        request: ProtocolRequest<'_>,
        context: &ProtocolCallContext,
    ) -> ProtocolHandlerOutcome {
        let result = match method {
            Method::ComputerServiceCapabilities => {
                computer_protocol::capabilities(&self.computer, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ComputerServiceListApps => {
                computer_protocol::list_apps(&self.computer, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ComputerServicePermissions => {
                computer_protocol::permissions(&self.computer, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ComputerServicePermissionsStatus => {
                computer_protocol::permissions_status(&self.computer, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ComputerServicePermissionsReset => {
                computer_protocol::permissions_reset(&self.computer, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ComputerServiceListWindows => {
                computer_protocol::list_windows(&self.computer, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ComputerServiceGetAppState => {
                computer_protocol::get_app_state(&self.computer, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ComputerServiceClick => {
                computer_protocol::click(&self.computer, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ComputerServicePerformSecondaryAction => {
                computer_protocol::perform_secondary_action(&self.computer, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ComputerServiceScroll => {
                computer_protocol::scroll(&self.computer, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ComputerServiceDrag => computer_protocol::drag(&self.computer, request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::ComputerServiceTypeText => {
                computer_protocol::type_text(&self.computer, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ComputerServicePressKey => {
                computer_protocol::press_key(&self.computer, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ComputerServiceHotkey => {
                computer_protocol::hotkey(&self.computer, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ComputerServicePasteText => {
                computer_protocol::paste_text(&self.computer, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::ComputerServiceSetValue => {
                computer_protocol::set_value(&self.computer, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::EmulatorServiceList => emulator_protocol::list(&self.emulator, request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::EmulatorServiceAttach => {
                emulator_protocol::attach(&self.emulator, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::EmulatorServiceTap => emulator_protocol::tap(&self.emulator, request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::EmulatorServiceGesture => {
                emulator_protocol::gesture(&self.emulator, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::EmulatorServiceTypeText => {
                emulator_protocol::type_text(&self.emulator, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::EmulatorServiceButton => {
                emulator_protocol::button(&self.emulator, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::EmulatorServiceRotate => {
                emulator_protocol::rotate(&self.emulator, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::EmulatorServiceExec => emulator_protocol::exec(&self.emulator, request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::EmulatorServiceKill => emulator_protocol::kill(&self.emulator, request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::EmulatorServiceShutdown => {
                emulator_protocol::shutdown(&self.emulator, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::EmulatorServiceListSimulators => {
                emulator_protocol::list_simulators(&self.emulator, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::EmulatorServiceAvailability => {
                emulator_protocol::availability(&self.emulator, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::EmulatorServiceUnregisterActive => {
                emulator_protocol::unregister_active(&self.emulator, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::EmulatorServiceStreamFrames => {
                return match emulator_protocol::stream_frames(
                    &self.emulator,
                    request.payload,
                    context,
                )
                .await
                {
                    Ok(()) => ProtocolHandlerOutcome::StreamComplete,
                    Err(error) => ProtocolHandlerOutcome::Failed(error),
                };
            }
            Method::DangerousApprovalServiceStatus => {
                dangerous_approval_protocol::status(&self.dangerous_approval, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::DangerousApprovalServiceBeginRegistration => {
                dangerous_approval_protocol::begin_registration(
                    &self.dangerous_approval,
                    request.payload,
                )
                .await
                .map(ProtocolHandlerResponse::plain)
            }
            Method::DangerousApprovalServiceFinishRegistration => {
                dangerous_approval_protocol::finish_registration(
                    &self.dangerous_approval,
                    request.payload,
                )
                .await
                .map(ProtocolHandlerResponse::plain)
            }
            Method::DangerousApprovalServiceBeginApproval => {
                dangerous_approval_protocol::begin_approval(
                    &self.dangerous_approval,
                    request.payload,
                )
                .await
                .map(ProtocolHandlerResponse::plain)
            }
            Method::DangerousApprovalServiceFinishApproval => {
                dangerous_approval_protocol::finish_approval(
                    &self.dangerous_approval,
                    request.payload,
                )
                .await
                .map(ProtocolHandlerResponse::plain)
            }
            Method::DangerousApprovalServiceRemove => {
                dangerous_approval_protocol::remove(&self.dangerous_approval, request.payload)
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

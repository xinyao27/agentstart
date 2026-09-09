use super::{
    ProtocolCallContext, ProtocolHandlerOutcome, ProtocolHandlerResponse, ProtocolRequest,
    ProtocolRouter, driver_events_protocol, layout_protocol, session_tabs_protocol,
};

pub(super) enum Method {
    TerminalFitServiceGetDrivers,
    TerminalFitServiceGetOverrides,
    TerminalFitServiceRestore,
    TerminalPreferencesServiceGetAutoRestoreFit,
    TerminalPreferencesServiceSetAutoRestoreFit,
    TerminalServiceList,
    TerminalServiceCreate,
    TerminalServiceRead,
    TerminalServiceSend,
    TerminalServiceClose,
    TerminalServiceFocus,
    LayoutServiceList,
    LayoutServiceApply,
    SessionTabsServiceActivate,
    SessionTabsServiceClose,
    SessionTabsServiceCreateTerminal,
    SessionTabsServiceList,
    SessionTabsServiceListAll,
    SessionTabsServiceMove,
    SessionTabsServiceSetTabProps,
    SessionTabsServiceUpdatePaneLayout,
    SessionTabsServiceSubscribe,
    SessionTabsServiceSubscribeAll,
    SessionTabsServiceUnsubscribe,
    SessionTabsServiceUnsubscribeAll,
    TerminalServiceClearBuffer,
    TerminalServiceCloseTab,
    TerminalServiceGetDisplayMode,
    TerminalServiceSetDisplayMode,
    TerminalServiceInspectProcess,
    TerminalServiceIsRunningAgent,
    TerminalServiceGetAgentStatus,
    TerminalServiceListManagedSessions,
    TerminalServiceKillAllManaged,
    TerminalServiceKillManaged,
    TerminalServiceRestartManaged,
    TerminalServiceRename,
    TerminalServiceShow,
    TerminalServiceResizeForClient,
    TerminalServiceResolveActive,
    TerminalServiceResolvePane,
    TerminalServiceSplit,
    TerminalServiceStop,
    TerminalServiceStopExact,
    TerminalServiceUnsubscribe,
    TerminalServiceUpdateViewAttributes,
    TerminalServiceUpdateViewport,
    TerminalServiceRestoreDesktopFit,
    TerminalServiceWait,
    TerminalServiceApprove,
    TerminalServiceOpenMultiplex,
    TerminalServiceMultiplex,
    DriverEventsServiceSubscribe,
}

impl ProtocolRouter {
    pub(super) async fn handle_terminal(
        &self,
        method: Method,
        request: ProtocolRequest<'_>,
        context: &ProtocolCallContext,
    ) -> ProtocolHandlerOutcome {
        let result = match method {
            Method::TerminalFitServiceGetDrivers => self
                .terminal
                .protocol_get_terminal_drivers(request.payload)
                .map(ProtocolHandlerResponse::plain),
            Method::TerminalFitServiceGetOverrides => self
                .terminal
                .protocol_get_terminal_fit_overrides(request.payload)
                .map(ProtocolHandlerResponse::plain),
            Method::TerminalFitServiceRestore => self
                .terminal
                .protocol_restore_terminal_fit(request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::TerminalPreferencesServiceGetAutoRestoreFit => self
                .terminal
                .protocol_auto_restore_fit(request.payload)
                .map(ProtocolHandlerResponse::plain),
            Method::TerminalPreferencesServiceSetAutoRestoreFit => self
                .terminal
                .protocol_set_auto_restore_fit(request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::TerminalServiceList => self
                .terminal
                .protocol_list(request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::TerminalServiceCreate => self
                .terminal
                .protocol_create(request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::TerminalServiceRead => self
                .terminal
                .protocol_read(request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::TerminalServiceSend => self
                .terminal
                .protocol_send(request.payload, context.access().principal_id())
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::TerminalServiceClose => self
                .terminal
                .protocol_close(request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::TerminalServiceFocus => self
                .terminal
                .protocol_focus(request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::LayoutServiceList => layout_protocol::list(&self.layout, request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::LayoutServiceApply => layout_protocol::apply(&self.layout, request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::SessionTabsServiceActivate => {
                session_tabs_protocol::activate(&self.session_tabs, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::SessionTabsServiceClose => {
                session_tabs_protocol::close(&self.session_tabs, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::SessionTabsServiceCreateTerminal => {
                session_tabs_protocol::create_terminal(&self.session_tabs, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::SessionTabsServiceList => {
                session_tabs_protocol::list(&self.session_tabs, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::SessionTabsServiceListAll => {
                session_tabs_protocol::list_all(&self.session_tabs, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::SessionTabsServiceMove => {
                session_tabs_protocol::move_tab(&self.session_tabs, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::SessionTabsServiceSetTabProps => {
                session_tabs_protocol::set_tab_props(&self.session_tabs, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::SessionTabsServiceUpdatePaneLayout => {
                session_tabs_protocol::update_pane_layout(&self.session_tabs, request.payload)
                    .await
                    .map(ProtocolHandlerResponse::plain)
            }
            Method::SessionTabsServiceSubscribe => {
                return match session_tabs_protocol::subscribe(
                    &self.session_tabs,
                    request.payload,
                    &self.connection_id,
                    context,
                )
                .await
                {
                    Ok(()) => ProtocolHandlerOutcome::StreamComplete,
                    Err(error) => ProtocolHandlerOutcome::Failed(error),
                };
            }
            Method::SessionTabsServiceSubscribeAll => {
                return match session_tabs_protocol::subscribe_all(
                    &self.session_tabs,
                    request.payload,
                    &self.connection_id,
                    context,
                )
                .await
                {
                    Ok(()) => ProtocolHandlerOutcome::StreamComplete,
                    Err(error) => ProtocolHandlerOutcome::Failed(error),
                };
            }
            Method::SessionTabsServiceUnsubscribe => session_tabs_protocol::unsubscribe(
                &self.session_tabs,
                request.payload,
                &self.connection_id,
            )
            .await
            .map(ProtocolHandlerResponse::plain),
            Method::SessionTabsServiceUnsubscribeAll => session_tabs_protocol::unsubscribe_all(
                &self.session_tabs,
                request.payload,
                &self.connection_id,
            )
            .await
            .map(ProtocolHandlerResponse::plain),
            Method::TerminalServiceClearBuffer => self
                .terminal
                .protocol_clear_buffer(request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::TerminalServiceCloseTab => self
                .terminal
                .protocol_close_tab(request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::TerminalServiceGetDisplayMode => self
                .terminal
                .protocol_get_display_mode(request.payload)
                .map(ProtocolHandlerResponse::plain),
            Method::TerminalServiceSetDisplayMode => self
                .terminal
                .protocol_set_display_mode(request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::TerminalServiceInspectProcess => self
                .terminal
                .protocol_inspect_process(request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::TerminalServiceIsRunningAgent => self
                .terminal
                .protocol_is_running_agent(request.payload)
                .map(ProtocolHandlerResponse::plain),
            Method::TerminalServiceGetAgentStatus => self
                .terminal
                .protocol_get_agent_status(request.payload)
                .map(ProtocolHandlerResponse::plain),
            Method::TerminalServiceListManagedSessions => self
                .terminal
                .protocol_list_managed_sessions(request.payload)
                .map(ProtocolHandlerResponse::plain),
            Method::TerminalServiceKillAllManaged => self
                .terminal
                .protocol_kill_all_managed(request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::TerminalServiceKillManaged => self
                .terminal
                .protocol_kill_managed(request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::TerminalServiceRestartManaged => self
                .terminal
                .protocol_restart_managed(request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::TerminalServiceRename => self
                .terminal
                .protocol_rename(request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::TerminalServiceShow => self
                .terminal
                .protocol_show(request.payload)
                .map(ProtocolHandlerResponse::plain),
            Method::TerminalServiceResizeForClient => self
                .terminal
                .protocol_resize_for_client(request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::TerminalServiceResolveActive => self
                .terminal
                .protocol_resolve_active(request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::TerminalServiceResolvePane => self
                .terminal
                .protocol_resolve_pane(request.payload)
                .map(ProtocolHandlerResponse::plain),
            Method::TerminalServiceSplit => self
                .terminal
                .protocol_split(request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::TerminalServiceStop => self
                .terminal
                .protocol_stop(request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::TerminalServiceStopExact => self
                .terminal
                .protocol_stop_exact(request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::TerminalServiceUnsubscribe => self
                .terminal
                .protocol_unsubscribe(request.payload)
                .map(ProtocolHandlerResponse::plain),
            Method::TerminalServiceUpdateViewAttributes => self
                .terminal
                .protocol_update_view_attributes(request.payload)
                .map(ProtocolHandlerResponse::plain),
            Method::TerminalServiceUpdateViewport => self
                .terminal
                .protocol_update_viewport(request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::TerminalServiceRestoreDesktopFit => self
                .terminal
                .protocol_restore_desktop_fit(request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::TerminalServiceWait => self
                .terminal
                .protocol_wait(request.payload)
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::TerminalServiceApprove => self
                .terminal
                .protocol_approve(request.payload, context.access().principal_id())
                .await
                .map(ProtocolHandlerResponse::plain),
            Method::TerminalServiceMultiplex => {
                return match self
                    .terminal
                    .protocol_multiplex(request.payload, &self.connection_id, context)
                    .await
                {
                    Ok(()) => ProtocolHandlerOutcome::StreamComplete,
                    Err(error) => ProtocolHandlerOutcome::Failed(error),
                };
            }
            Method::TerminalServiceOpenMultiplex => self
                .terminal
                .protocol_open_multiplex(request.payload, context.access().principal_id())
                .map(ProtocolHandlerResponse::plain),
            Method::DriverEventsServiceSubscribe => {
                return match driver_events_protocol::subscribe(
                    &self.terminal,
                    request.payload,
                    &self.connection_id,
                    context,
                )
                .await
                {
                    Ok(()) => ProtocolHandlerOutcome::StreamComplete,
                    Err(error) => ProtocolHandlerOutcome::Failed(error),
                };
            }
        };
        match result {
            Ok(response) => ProtocolHandlerOutcome::Complete(response),
            Err(error) => ProtocolHandlerOutcome::Failed(error),
        }
    }
}

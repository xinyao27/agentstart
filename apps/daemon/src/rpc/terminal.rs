mod fit;
mod multiplex;
mod preferences;
mod protocol;
mod protocol_lifecycle;
mod protocol_management;
mod protocol_view;

use crate::dangerous_approval::DangerousApprovalAuthority;
use crate::session_tabs::SessionTabsAuthority;
use crate::terminal_session::{TerminalMultiplexClose, TerminalSessionAuthority};

#[derive(Clone)]
pub(super) struct TerminalRpc {
    authority: TerminalSessionAuthority,
    dangerous_approval: DangerousApprovalAuthority,
    session_tabs: SessionTabsAuthority,
}

impl TerminalRpc {
    pub(super) fn new(
        authority: TerminalSessionAuthority,
        dangerous_approval: DangerousApprovalAuthority,
        session_tabs: SessionTabsAuthority,
    ) -> Self {
        Self {
            authority,
            dangerous_approval,
            session_tabs,
        }
    }

    pub(super) async fn protocol_multiplex(
        &self,
        payload: &[u8],
        connection_id: &str,
        context: &super::protocol_call::ProtocolCallContext,
    ) -> Result<(), agentstart_protocol::protocol::v1::Status> {
        use super::protocol_call::status;
        use agentstart_protocol::protocol::v1::StatusCode;
        use agentstart_protocol::runtime::v1::{
            TerminalServiceMultiplexRequest, terminal_service_multiplex_request,
        };
        let request =
            agentstart_protocol::transport::decode::<TerminalServiceMultiplexRequest>(payload)?;
        let Some(terminal_service_multiplex_request::Content::BulkTicket(ticket)) = request.content
        else {
            return Err(status(
                StatusCode::InvalidArgument,
                "Terminal duplex must begin with a bulk ticket",
            ));
        };
        let request_id = context.call_id().to_string();
        let logical_connection = format!("{connection_id}:terminal:{request_id}");
        let close = self
            .authority
            .multiplex()
            .register_connection(logical_connection.clone());
        let lease = MultiplexLease {
            authority: self.authority.clone(),
            connection_id: logical_connection.clone(),
        };
        self.authority
            .multiplex()
            .admit_bulk(
                &logical_connection,
                context.access().principal_id(),
                &request_id,
                &ticket,
            )
            .map_err(|_| {
                status(
                    StatusCode::PermissionDenied,
                    "Terminal bulk ticket is invalid, expired or belongs to another principal",
                )
            })?;
        let result = multiplex::run_protocol(
            self.authority.clone(),
            logical_connection,
            request_id,
            context,
            close,
        )
        .await;
        drop(lease);
        result
    }

    pub(super) fn register_connection(
        &self,
        connection_id: String,
    ) -> tokio::sync::watch::Receiver<Option<TerminalMultiplexClose>> {
        self.authority
            .multiplex()
            .register_connection(connection_id)
    }

    pub(super) fn close_connection(&self, connection_id: &str) {
        self.authority.multiplex().close_connection(connection_id);
    }

    pub(super) fn subscribe_driver_events(
        &self,
    ) -> tokio::sync::broadcast::Receiver<serde_json::Value> {
        self.authority.subscribe_driver_events()
    }

    pub(super) fn protocol_auto_restore_fit(
        &self,
        payload: &[u8],
    ) -> Result<Vec<u8>, agentstart_protocol::protocol::v1::Status> {
        preferences::protocol_auto_restore_fit(&self.authority, payload)
    }

    pub(super) fn protocol_get_terminal_drivers(
        &self,
        payload: &[u8],
    ) -> Result<Vec<u8>, agentstart_protocol::protocol::v1::Status> {
        fit::protocol_get_drivers(&self.authority, payload)
    }

    pub(super) fn protocol_get_terminal_fit_overrides(
        &self,
        payload: &[u8],
    ) -> Result<Vec<u8>, agentstart_protocol::protocol::v1::Status> {
        fit::protocol_get_overrides(&self.authority, payload)
    }

    pub(super) async fn protocol_restore_terminal_fit(
        &self,
        payload: &[u8],
    ) -> Result<Vec<u8>, agentstart_protocol::protocol::v1::Status> {
        fit::protocol_restore(&self.authority, payload).await
    }

    pub(super) async fn protocol_set_auto_restore_fit(
        &self,
        payload: &[u8],
    ) -> Result<Vec<u8>, agentstart_protocol::protocol::v1::Status> {
        preferences::protocol_set_auto_restore_fit(&self.authority, payload).await
    }

    pub(super) async fn protocol_list(
        &self,
        payload: &[u8],
    ) -> Result<Vec<u8>, agentstart_protocol::protocol::v1::Status> {
        protocol::list(&self.authority, payload).await
    }

    pub(super) async fn protocol_create(
        &self,
        payload: &[u8],
    ) -> Result<Vec<u8>, agentstart_protocol::protocol::v1::Status> {
        protocol::create(&self.authority, payload).await
    }

    pub(super) async fn protocol_read(
        &self,
        payload: &[u8],
    ) -> Result<Vec<u8>, agentstart_protocol::protocol::v1::Status> {
        protocol::read(&self.authority, payload).await
    }

    pub(super) async fn protocol_send(
        &self,
        payload: &[u8],
        principal_id: &str,
    ) -> Result<Vec<u8>, agentstart_protocol::protocol::v1::Status> {
        protocol::send(&self.authority, payload, principal_id).await
    }

    pub(super) async fn protocol_close(
        &self,
        payload: &[u8],
    ) -> Result<Vec<u8>, agentstart_protocol::protocol::v1::Status> {
        protocol::close(&self.authority, payload).await
    }

    pub(super) async fn protocol_focus(
        &self,
        payload: &[u8],
    ) -> Result<Vec<u8>, agentstart_protocol::protocol::v1::Status> {
        protocol::focus(&self.authority, payload).await
    }

    pub(super) fn protocol_open_multiplex(
        &self,
        payload: &[u8],
        principal_id: &str,
    ) -> Result<Vec<u8>, agentstart_protocol::protocol::v1::Status> {
        protocol::open_multiplex(&self.authority, payload, principal_id)
    }

    pub(super) async fn protocol_approve(
        &self,
        payload: &[u8],
        principal_id: &str,
    ) -> Result<Vec<u8>, agentstart_protocol::protocol::v1::Status> {
        protocol_lifecycle::approve(
            &self.authority,
            &self.dangerous_approval,
            payload,
            principal_id,
        )
        .await
    }

    pub(super) async fn protocol_clear_buffer(
        &self,
        payload: &[u8],
    ) -> Result<Vec<u8>, agentstart_protocol::protocol::v1::Status> {
        protocol_lifecycle::clear_buffer(&self.authority, payload).await
    }

    pub(super) async fn protocol_close_tab(
        &self,
        payload: &[u8],
    ) -> Result<Vec<u8>, agentstart_protocol::protocol::v1::Status> {
        protocol_lifecycle::close_tab(&self.authority, &self.session_tabs, payload).await
    }

    pub(super) async fn protocol_rename(
        &self,
        payload: &[u8],
    ) -> Result<Vec<u8>, agentstart_protocol::protocol::v1::Status> {
        protocol_lifecycle::rename(&self.authority, payload).await
    }

    pub(super) fn protocol_show(
        &self,
        payload: &[u8],
    ) -> Result<Vec<u8>, agentstart_protocol::protocol::v1::Status> {
        protocol_lifecycle::show(&self.authority, payload)
    }

    pub(super) async fn protocol_split(
        &self,
        payload: &[u8],
    ) -> Result<Vec<u8>, agentstart_protocol::protocol::v1::Status> {
        protocol_lifecycle::split(&self.authority, payload).await
    }

    pub(super) async fn protocol_stop(
        &self,
        payload: &[u8],
    ) -> Result<Vec<u8>, agentstart_protocol::protocol::v1::Status> {
        protocol_lifecycle::stop(&self.authority, payload).await
    }

    pub(super) async fn protocol_stop_exact(
        &self,
        payload: &[u8],
    ) -> Result<Vec<u8>, agentstart_protocol::protocol::v1::Status> {
        protocol_lifecycle::stop_exact(&self.authority, payload).await
    }

    pub(super) async fn protocol_resolve_active(
        &self,
        payload: &[u8],
    ) -> Result<Vec<u8>, agentstart_protocol::protocol::v1::Status> {
        protocol_lifecycle::resolve_active(&self.authority, payload).await
    }

    pub(super) fn protocol_resolve_pane(
        &self,
        payload: &[u8],
    ) -> Result<Vec<u8>, agentstart_protocol::protocol::v1::Status> {
        protocol_lifecycle::resolve_pane(&self.authority, payload)
    }

    pub(super) async fn protocol_wait(
        &self,
        payload: &[u8],
    ) -> Result<Vec<u8>, agentstart_protocol::protocol::v1::Status> {
        protocol_lifecycle::wait(&self.authority, payload).await
    }

    pub(super) async fn protocol_restore_desktop_fit(
        &self,
        payload: &[u8],
    ) -> Result<Vec<u8>, agentstart_protocol::protocol::v1::Status> {
        protocol_lifecycle::restore_desktop_fit(&self.authority, payload).await
    }

    pub(super) fn protocol_unsubscribe(
        &self,
        payload: &[u8],
    ) -> Result<Vec<u8>, agentstart_protocol::protocol::v1::Status> {
        protocol_lifecycle::unsubscribe(payload)
    }

    pub(super) fn protocol_get_display_mode(
        &self,
        payload: &[u8],
    ) -> Result<Vec<u8>, agentstart_protocol::protocol::v1::Status> {
        protocol_view::get_display_mode(&self.authority, payload)
    }

    pub(super) async fn protocol_set_display_mode(
        &self,
        payload: &[u8],
    ) -> Result<Vec<u8>, agentstart_protocol::protocol::v1::Status> {
        protocol_view::set_display_mode(&self.authority, payload).await
    }

    pub(super) async fn protocol_resize_for_client(
        &self,
        payload: &[u8],
    ) -> Result<Vec<u8>, agentstart_protocol::protocol::v1::Status> {
        protocol_view::resize_for_client(&self.authority, payload).await
    }

    pub(super) async fn protocol_update_viewport(
        &self,
        payload: &[u8],
    ) -> Result<Vec<u8>, agentstart_protocol::protocol::v1::Status> {
        protocol_view::update_viewport(&self.authority, payload).await
    }

    pub(super) fn protocol_update_view_attributes(
        &self,
        payload: &[u8],
    ) -> Result<Vec<u8>, agentstart_protocol::protocol::v1::Status> {
        protocol_view::update_view_attributes(&self.authority, payload)
    }

    pub(super) async fn protocol_inspect_process(
        &self,
        payload: &[u8],
    ) -> Result<Vec<u8>, agentstart_protocol::protocol::v1::Status> {
        protocol_management::inspect_process(&self.authority, payload).await
    }

    pub(super) fn protocol_is_running_agent(
        &self,
        payload: &[u8],
    ) -> Result<Vec<u8>, agentstart_protocol::protocol::v1::Status> {
        protocol_management::is_running_agent(&self.authority, payload)
    }

    pub(super) fn protocol_get_agent_status(
        &self,
        payload: &[u8],
    ) -> Result<Vec<u8>, agentstart_protocol::protocol::v1::Status> {
        protocol_management::get_agent_status(&self.authority, payload)
    }

    pub(super) fn protocol_list_managed_sessions(
        &self,
        payload: &[u8],
    ) -> Result<Vec<u8>, agentstart_protocol::protocol::v1::Status> {
        protocol_management::list_managed_sessions(&self.authority, payload)
    }

    pub(super) async fn protocol_kill_all_managed(
        &self,
        payload: &[u8],
    ) -> Result<Vec<u8>, agentstart_protocol::protocol::v1::Status> {
        protocol_management::kill_all_managed(&self.authority, payload).await
    }

    pub(super) async fn protocol_kill_managed(
        &self,
        payload: &[u8],
    ) -> Result<Vec<u8>, agentstart_protocol::protocol::v1::Status> {
        protocol_management::kill_managed(&self.authority, payload).await
    }

    pub(super) async fn protocol_restart_managed(
        &self,
        payload: &[u8],
    ) -> Result<Vec<u8>, agentstart_protocol::protocol::v1::Status> {
        protocol_management::restart_managed(&self.authority, payload).await
    }
}

struct MultiplexLease {
    authority: TerminalSessionAuthority,
    connection_id: String,
}

impl Drop for MultiplexLease {
    fn drop(&mut self) {
        self.authority
            .multiplex()
            .close_connection(&self.connection_id);
    }
}

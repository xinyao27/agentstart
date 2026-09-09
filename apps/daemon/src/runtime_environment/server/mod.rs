mod channel;
mod connection;
mod establishment;

use std::sync::Arc;

use axum::extract::ws::WebSocket;
use tokio::sync::{OwnedSemaphorePermit, mpsc, watch};

pub(crate) use channel::{RuntimeAuthenticatedChannel, RuntimeOutbound};
use connection::run_socket;

use super::{RuntimeConnections, RuntimeEnvironmentAuthority};

pub(crate) const RUNTIME_PATH: &str = "/runtime";

#[derive(Clone)]
pub(crate) struct RuntimeAdmissionState {
    pub(crate) accepted: mpsc::Sender<RuntimeAuthenticatedChannel>,
    pub(crate) authority: RuntimeEnvironmentAuthority,
    pub(crate) connections: RuntimeConnections,
    pub(crate) runtime_id: Arc<str>,
    pub(crate) shutdown: watch::Sender<bool>,
}

pub(crate) async fn accept_socket(
    socket: WebSocket,
    state: RuntimeAdmissionState,
    pending_handshake: OwnedSemaphorePermit,
) {
    run_socket(socket, state, pending_handshake).await;
}

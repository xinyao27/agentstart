use std::sync::Arc;

use axum::extract::State;
use axum::extract::ws::{WebSocketUpgrade, rejection::WebSocketUpgradeRejection};
use axum::http::header::ORIGIN;
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use tokio::sync::{mpsc, watch};

use super::channel::MobileAuthenticatedChannel;
use super::connection::run_socket;
use super::connections::MobileConnections;
use crate::mobile::{MobileDeviceStore, MobileKeypair, MobilePresence};
use crate::runtime_environment::server::{
    RuntimeAdmissionState, accept_socket as accept_runtime_socket,
};

pub(super) const MOBILE_PATH: &str = "/mobile";
const MAX_MESSAGE_BYTES: usize = 4 * 1024 * 1024;
const MAX_BACKPRESSURE_BYTES: usize = 8 * 1024 * 1024;

#[derive(Clone)]
pub(super) struct AdmissionState {
    pub(super) accepted: mpsc::Sender<MobileAuthenticatedChannel>,
    pub(super) connections: MobileConnections,
    pub(super) devices: MobileDeviceStore,
    pub(super) keypair: Arc<MobileKeypair>,
    pub(super) presence: MobilePresence,
    pub(super) runtime_id: Arc<str>,
    pub(super) runtime: RuntimeAdmissionState,
    pub(super) shutdown: watch::Sender<bool>,
}

pub(super) async fn admit_mobile(
    State(state): State<AdmissionState>,
    headers: HeaderMap,
    upgrade: Result<WebSocketUpgrade, WebSocketUpgradeRejection>,
) -> Response {
    let Some(upgrade) = validate_upgrade(&headers, upgrade) else {
        return rejection(&headers);
    };
    let Some(pending_handshake) = state.connections.try_begin_handshake() else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            "Mobile handshake capacity reached",
        )
            .into_response();
    };
    upgrade
        .max_message_size(MAX_MESSAGE_BYTES)
        .max_frame_size(MAX_MESSAGE_BYTES)
        .write_buffer_size(0)
        .max_write_buffer_size(MAX_BACKPRESSURE_BYTES)
        .on_upgrade(move |socket| run_socket(socket, state, pending_handshake))
}

pub(super) async fn admit_runtime(
    State(state): State<AdmissionState>,
    headers: HeaderMap,
    upgrade: Result<WebSocketUpgrade, WebSocketUpgradeRejection>,
) -> Response {
    let Some(upgrade) = validate_upgrade(&headers, upgrade) else {
        return rejection(&headers);
    };
    let Some(pending_handshake) = state.runtime.connections.try_begin_handshake() else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            "Runtime handshake capacity reached",
        )
            .into_response();
    };
    upgrade
        .max_message_size(crate::runtime_environment::MAX_RUNTIME_MESSAGE_BYTES)
        .max_frame_size(crate::runtime_environment::MAX_RUNTIME_MESSAGE_BYTES)
        .write_buffer_size(0)
        .max_write_buffer_size(MAX_BACKPRESSURE_BYTES)
        .on_upgrade(move |socket| accept_runtime_socket(socket, state.runtime, pending_handshake))
}

fn validate_upgrade(
    headers: &HeaderMap,
    upgrade: Result<WebSocketUpgrade, WebSocketUpgradeRejection>,
) -> Option<WebSocketUpgrade> {
    (!headers.contains_key(ORIGIN))
        .then_some(upgrade.ok())
        .flatten()
}

fn rejection(headers: &HeaderMap) -> Response {
    if headers.contains_key(ORIGIN) {
        (StatusCode::FORBIDDEN, "Browser origins are not allowed").into_response()
    } else {
        (StatusCode::BAD_REQUEST, "WebSocket upgrade required").into_response()
    }
}

use std::collections::HashSet;
use std::sync::Arc;

use axum::Json;
use axum::body::Body;
use axum::extract::State;
use axum::extract::ws::{WebSocketUpgrade, rejection::WebSocketUpgradeRejection};
use axum::http::header::{
    CACHE_CONTROL, CONTENT_DISPOSITION, CONTENT_LENGTH, CONTENT_TYPE, HOST, ORIGIN,
    X_CONTENT_TYPE_OPTIONS,
};
use axum::http::uri::Authority;
use axum::http::{HeaderMap, HeaderValue, Method, StatusCode, Uri};
use axum::response::{IntoResponse, Response};
use serde_json::json;
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;
use tokio::fs::File;
use tokio::sync::{mpsc, watch};
use tokio_util::io::ReaderStream;
use yiru_protocol::CURRENT_PROTOCOL_VERSION;
use yiru_protocol::protocol::v1::PeerKind;

use super::extension_socket::{
    MAX_INBOUND_MESSAGE_BYTES, MAX_OUTBOUND_BACKPRESSURE_BYTES, run_socket,
};
use crate::persistence::{ArtifactDownload, ArtifactStore};
use crate::rpc::AuthenticatedChannel;

pub(super) const EXTENSION_RPC_PATH: &str = "/rpc";

#[derive(Clone)]
pub(super) struct AdmissionState {
    accepted: mpsc::Sender<AuthenticatedChannel>,
    allowed_origins: Arc<HashSet<String>>,
    artifacts: ArtifactStore,
    expected_token_hash: [u8; 32],
    runtime_id: Arc<str>,
    socket_shutdown: watch::Sender<bool>,
}

impl AdmissionState {
    pub(super) fn new(
        accepted: mpsc::Sender<AuthenticatedChannel>,
        allowed_origins: HashSet<String>,
        artifacts: ArtifactStore,
        auth_token: &str,
        runtime_id: String,
        socket_shutdown: watch::Sender<bool>,
    ) -> Self {
        Self {
            accepted,
            allowed_origins: Arc::new(allowed_origins),
            artifacts,
            expected_token_hash: credential_hash(auth_token),
            runtime_id: Arc::from(runtime_id),
            socket_shutdown,
        }
    }
}

pub(super) async fn admit_request(
    State(state): State<AdmissionState>,
    headers: HeaderMap,
    method: Method,
    uri: Uri,
    upgrade: Result<WebSocketUpgrade, WebSocketUpgradeRejection>,
) -> Response {
    if !host_allowed(&headers, &uri) {
        return (StatusCode::FORBIDDEN, "Host not allowed").into_response();
    }
    let Some(peer_kind) = local_peer_kind(&headers, &state.allowed_origins) else {
        return (StatusCode::FORBIDDEN, "Origin not allowed").into_response();
    };
    if !query_value(&uri, "protocolVersion")
        .and_then(|value| parse_protocol_version(&value))
        .is_some_and(|version| version == f64::from(CURRENT_PROTOCOL_VERSION))
    {
        return (StatusCode::UPGRADE_REQUIRED, "Protocol version mismatch").into_response();
    }
    if let Some(id) = uri.path().strip_prefix("/artifacts/") {
        return artifact_response(&state.artifacts, &method, id, &uri).await;
    }
    if !credential_equal(
        query_value(&uri, "token").as_deref(),
        &state.expected_token_hash,
    ) {
        return (StatusCode::UNAUTHORIZED, "Unauthorized").into_response();
    }
    if uri.path() == "/health" {
        return Json(json!({
            "ok": true,
            "protocolVersion": CURRENT_PROTOCOL_VERSION,
            "runtimeId": state.runtime_id.as_ref()
        }))
        .into_response();
    }
    if uri.path() != EXTENSION_RPC_PATH {
        return (StatusCode::NOT_FOUND, "Not found").into_response();
    }
    let Ok(upgrade) = upgrade else {
        return (StatusCode::BAD_REQUEST, "WebSocket upgrade required").into_response();
    };
    let socket_shutdown = state.socket_shutdown.subscribe();
    upgrade
        .max_message_size(MAX_INBOUND_MESSAGE_BYTES)
        .max_frame_size(MAX_INBOUND_MESSAGE_BYTES)
        .write_buffer_size(0)
        .max_write_buffer_size(MAX_OUTBOUND_BACKPRESSURE_BYTES)
        .on_upgrade(move |socket| run_socket(socket, state.accepted, socket_shutdown, peer_kind))
}

async fn artifact_response(
    artifacts: &ArtifactStore,
    method: &Method,
    id: &str,
    uri: &Uri,
) -> Response {
    if method != Method::GET {
        return (StatusCode::METHOD_NOT_ALLOWED, "Method not allowed").into_response();
    }
    let ticket = query_value(uri, "downloadTicket");
    let download = match artifacts.consume_download(id.to_owned(), ticket).await {
        Ok(Some(download)) => download,
        Ok(None) => return (StatusCode::NOT_FOUND, "Artifact not found").into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    stream_artifact(download).await
}

async fn stream_artifact(download: ArtifactDownload) -> Response {
    let file = match File::open(&download.path).await {
        Ok(file) => file,
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    let mut response = Response::new(Body::from_stream(ReaderStream::new(file)));
    let headers = response.headers_mut();
    headers.insert(CACHE_CONTROL, HeaderValue::from_static("private, no-store"));
    for (name, value) in [
        (CONTENT_DISPOSITION, download.content_disposition),
        (CONTENT_LENGTH, download.byte_length.to_string()),
        (CONTENT_TYPE, download.mime_type),
    ] {
        let Ok(value) = HeaderValue::from_str(&value) else {
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        };
        headers.insert(name, value);
    }
    headers.insert(X_CONTENT_TYPE_OPTIONS, HeaderValue::from_static("nosniff"));
    response
}

fn query_value(uri: &Uri, name: &str) -> Option<String> {
    url::form_urlencoded::parse(uri.query()?.as_bytes())
        .find(|(key, _)| key == name)
        .map(|(_, value)| value.into_owned())
}

fn parse_protocol_version(value: &str) -> Option<f64> {
    let value = value.trim();
    for (prefix, radix) in [
        ("0x", 16),
        ("0X", 16),
        ("0o", 8),
        ("0O", 8),
        ("0b", 2),
        ("0B", 2),
    ] {
        if let Some(digits) = value.strip_prefix(prefix) {
            return u64::from_str_radix(digits, radix)
                .ok()
                .map(|value| value as f64);
        }
    }
    value.parse().ok()
}

fn host_allowed(headers: &HeaderMap, uri: &Uri) -> bool {
    let Some(header) = headers.get(HOST).and_then(|value| value.to_str().ok()) else {
        return false;
    };
    let Ok(header_authority) = header.parse::<Authority>() else {
        return false;
    };
    uri.authority()
        .is_none_or(|request_authority| request_authority == &header_authority)
}

fn local_peer_kind(headers: &HeaderMap, allowed: &HashSet<String>) -> Option<PeerKind> {
    match headers.get(ORIGIN) {
        Some(value) => value
            .to_str()
            .ok()
            .filter(|origin| allowed.contains(*origin))
            .map(|_| PeerKind::ChromeExtension),
        None => Some(PeerKind::Cli),
    }
}

fn credential_equal(candidate: Option<&str>, expected_hash: &[u8; 32]) -> bool {
    let candidate_hash = credential_hash(candidate.unwrap_or_default());
    candidate.is_some() && bool::from(candidate_hash.ct_eq(expected_hash))
}

fn credential_hash(value: &str) -> [u8; 32] {
    Sha256::digest(value.as_bytes()).into()
}

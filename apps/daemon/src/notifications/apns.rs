use std::fmt::Write;
use std::time::Duration;

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use reqwest::{Client, StatusCode, Url};
use ring::{aead, digest, hkdf};
use serde::Serialize;
use thiserror::Error;

use crate::mobile::MobilePresence;
use crate::mobile::{ApnsEnvironment, MobileDevice, MobileDeviceStore, MobileDeviceStoreError};
use crate::persistence::{WorkspaceEventPayload, WorkspaceJournal};

const GATEWAY_TIMEOUT: Duration = Duration::from_secs(10);
const KEY_DOMAIN: &str = "yiru-apns-v1";
const RETRY_DELAY: Duration = Duration::from_secs(1);

#[derive(Clone, Copy, Debug)]
pub(crate) enum ApnsNotificationPhase {
    Complete,
    WaitingDecision,
}

#[derive(Clone, Debug)]
pub(crate) struct ApnsNotification {
    pub(crate) body: Option<String>,
    pub(crate) phase: ApnsNotificationPhase,
    pub(crate) terminal: String,
    pub(crate) worktree_id: String,
}

pub(super) struct ApnsPublisher {
    devices: MobileDeviceStore,
    gateway: Option<Gateway>,
    http: Client,
    journal: WorkspaceJournal,
    presence: MobilePresence,
}

struct Gateway {
    endpoint: Url,
    token: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GatewayRequest<'a> {
    ciphertext: String,
    collapse_id: String,
    device_token: &'a str,
    environment: ApnsEnvironment,
    key_id: String,
    nonce: String,
}

struct GatewayResult {
    accepted: bool,
    reason: Option<String>,
    retryable: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NotificationPayload<'a> {
    body: &'a str,
    notification_id: &'a str,
    title: &'static str,
    v: u8,
    worktree_id: &'a str,
}

#[derive(Debug, Error)]
pub(super) enum ApnsPublishError {
    #[error(transparent)]
    Device(#[from] MobileDeviceStoreError),
    #[error("APNS notification encryption failed")]
    Encryption,
    #[error("APNS notification nonce generation failed: {0}")]
    Random(#[from] getrandom::Error),
    #[error("APNS notification serialization failed: {0}")]
    Serialization(#[from] serde_json::Error),
}

impl ApnsPublisher {
    pub(super) fn new(
        devices: MobileDeviceStore,
        presence: MobilePresence,
        journal: WorkspaceJournal,
        endpoint: Option<String>,
        token: Option<String>,
    ) -> Result<Self, reqwest::Error> {
        let http = Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .build()?;
        Ok(Self {
            devices,
            gateway: gateway(endpoint, token),
            http,
            journal,
            presence,
        })
    }

    pub(super) async fn publish(
        &self,
        notification: &ApnsNotification,
    ) -> Result<(), ApnsPublishError> {
        let devices = self
            .devices
            .push_devices()
            .await?
            .into_iter()
            .filter(|device| !self.presence.is_connected(&device.id))
            .collect::<Vec<_>>();
        if devices.is_empty() {
            return Ok(());
        }
        let Some(gateway) = &self.gateway else {
            self.record(
                notification,
                "notification.apns.unavailable",
                WorkspaceEventPayload::from_iter([(
                    "deviceCount".to_owned(),
                    serde_json::json!(devices.len()),
                )]),
            )
            .await;
            return Ok(());
        };
        for device in devices {
            let request = build_request(&device, notification)?;
            let mut result = post_gateway(&self.http, gateway, &request).await;
            if result.retryable {
                tokio::time::sleep(RETRY_DELAY).await;
                result = post_gateway(&self.http, gateway, &request).await;
            }
            if !result.accepted
                && is_invalid_device_token(result.reason.as_deref())
                && let Err(error) = self.devices.register_push(device.id.clone(), None).await
            {
                eprintln!("[daemon] Failed to clear rejected APNS registration: {error}");
            }
            self.record(
                notification,
                if result.accepted {
                    "notification.apns.sent"
                } else {
                    "notification.apns.rejected"
                },
                WorkspaceEventPayload::from_iter([
                    ("deviceId".to_owned(), serde_json::json!(device.id)),
                    ("reason".to_owned(), serde_json::json!(result.reason)),
                ]),
            )
            .await;
        }
        Ok(())
    }

    pub(super) async fn record_failure(
        &self,
        notification: &ApnsNotification,
        error: &ApnsPublishError,
    ) {
        self.record(
            notification,
            "notification.apns.failed",
            WorkspaceEventPayload::from_iter([(
                "error".to_owned(),
                serde_json::json!(error.to_string()),
            )]),
        )
        .await;
    }

    async fn record(
        &self,
        notification: &ApnsNotification,
        kind: &str,
        mut detail: WorkspaceEventPayload,
    ) {
        detail.insert(
            "phase".to_owned(),
            serde_json::json!(notification.phase.as_wire()),
        );
        detail.insert(
            "terminal".to_owned(),
            serde_json::json!(notification.terminal),
        );
        if let Err(error) = self
            .journal
            .append(
                repo_scope(&notification.worktree_id),
                kind.to_owned(),
                detail,
            )
            .await
        {
            eprintln!("[daemon] Failed to record APNS delivery event: {error}");
        }
    }
}

fn gateway(endpoint: Option<String>, token: Option<String>) -> Option<Gateway> {
    let endpoint = endpoint.and_then(|value| validate_endpoint(&value))?;
    let token = token.map(|value| value.trim().to_owned())?;
    if token.is_empty() {
        return None;
    }
    Some(Gateway { endpoint, token })
}

fn validate_endpoint(value: &str) -> Option<Url> {
    let endpoint = Url::parse(value).ok()?;
    let is_loopback = matches!(endpoint.host_str(), Some("127.0.0.1" | "::1" | "localhost"));
    let has_secure_transport = endpoint.scheme() == "https";
    let has_loopback_transport = endpoint.scheme() == "http" && is_loopback;
    (endpoint.path() == "/v1/push" && (has_secure_transport || has_loopback_transport))
        .then_some(endpoint)
}

fn build_request<'a>(
    device: &'a MobileDevice,
    notification: &ApnsNotification,
) -> Result<GatewayRequest<'a>, ApnsPublishError> {
    let device_token = device
        .apns_token
        .as_deref()
        .ok_or(ApnsPublishError::Encryption)?;
    let environment = device
        .apns_environment
        .ok_or(ApnsPublishError::Encryption)?;
    let key_id = key_identifier(&device.token);
    let mut nonce = [0_u8; 12];
    getrandom::fill(&mut nonce)?;
    let title = match notification.phase {
        ApnsNotificationPhase::Complete => "Yiru agent completed",
        ApnsNotificationPhase::WaitingDecision => "Yiru needs your decision",
    };
    let body = notification
        .body
        .as_deref()
        .filter(|body| !body.is_empty())
        .unwrap_or("Open Yiru to review the agent session");
    let mut ciphertext = serde_json::to_vec(&NotificationPayload {
        body,
        notification_id: &notification.terminal,
        title,
        v: 1,
        worktree_id: &notification.worktree_id,
    })?;
    let key = notification_key(&device.token)?;
    let unbound = aead::UnboundKey::new(&aead::AES_256_GCM, &key)
        .map_err(|_| ApnsPublishError::Encryption)?;
    let key = aead::LessSafeKey::new(unbound);
    let aad = format!("{KEY_DOMAIN}\0{key_id}");
    key.seal_in_place_append_tag(
        aead::Nonce::assume_unique_for_key(nonce),
        aead::Aad::from(aad.as_bytes()),
        &mut ciphertext,
    )
    .map_err(|_| ApnsPublishError::Encryption)?;
    Ok(GatewayRequest {
        ciphertext: URL_SAFE_NO_PAD.encode(ciphertext),
        collapse_id: sha256_hex(format!(
            "{}\0{}",
            notification.terminal,
            notification.phase.as_wire()
        )),
        device_token,
        environment,
        key_id,
        nonce: URL_SAFE_NO_PAD.encode(nonce),
    })
}

async fn post_gateway(
    http: &Client,
    gateway: &Gateway,
    request: &GatewayRequest<'_>,
) -> GatewayResult {
    let response = http
        .post(gateway.endpoint.clone())
        .bearer_auth(&gateway.token)
        .json(request)
        .timeout(GATEWAY_TIMEOUT)
        .send()
        .await;
    let Ok(response) = response else {
        return unavailable_result();
    };
    let status = response.status();
    let Ok(response) = response.json::<serde_json::Value>().await else {
        return unavailable_result();
    };
    GatewayResult {
        accepted: response
            .get("accepted")
            .and_then(serde_json::Value::as_bool)
            .unwrap_or(false),
        reason: response
            .get("reason")
            .and_then(serde_json::Value::as_str)
            .filter(|reason| reason.chars().count() <= 100)
            .map(str::to_owned),
        retryable: response
            .get("retryable")
            .and_then(serde_json::Value::as_bool)
            .unwrap_or_else(|| is_server_error(status)),
    }
}

fn notification_key(token: &str) -> Result<[u8; 32], ApnsPublishError> {
    let salt = hkdf::Salt::new(hkdf::HKDF_SHA256, format!("{KEY_DOMAIN}/salt").as_bytes());
    let key = salt.extract(token.as_bytes());
    let info = [b"notification".as_slice()];
    let key = key
        .expand(&info, &aead::AES_256_GCM)
        .map_err(|_| ApnsPublishError::Encryption)?;
    let mut bytes = [0_u8; 32];
    key.fill(&mut bytes)
        .map_err(|_| ApnsPublishError::Encryption)?;
    Ok(bytes)
}

fn key_identifier(token: &str) -> String {
    sha256_hex(format!("{KEY_DOMAIN}/key-id\0{token}"))
        .chars()
        .take(32)
        .collect()
}

fn sha256_hex(value: String) -> String {
    let hash = digest::digest(&digest::SHA256, value.as_bytes());
    let mut hex = String::with_capacity(hash.as_ref().len() * 2);
    for byte in hash.as_ref() {
        let _ = write!(&mut hex, "{byte:02x}");
    }
    hex
}

fn unavailable_result() -> GatewayResult {
    GatewayResult {
        accepted: false,
        reason: Some("gateway_unavailable".to_owned()),
        retryable: true,
    }
}

fn is_server_error(status: StatusCode) -> bool {
    status.as_u16() >= 500
}

fn is_invalid_device_token(reason: Option<&str>) -> bool {
    matches!(
        reason,
        Some("BadDeviceToken" | "DeviceTokenNotForTopic" | "Unregistered")
    )
}

fn repo_scope(worktree_id: &str) -> String {
    worktree_id
        .split_once("::")
        .map_or(worktree_id, |(repo_id, _)| repo_id)
        .to_owned()
}

impl ApnsNotificationPhase {
    fn as_wire(self) -> &'static str {
        match self {
            Self::Complete => "complete",
            Self::WaitingDecision => "waiting-decision",
        }
    }
}

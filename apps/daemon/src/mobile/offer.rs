use base64::Engine as _;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use serde::Serialize;
use thiserror::Error;
use url::Url;

use super::{MobileDevice, MobileDeviceStore, MobileDeviceStoreError, MobileKeypair};

const PAIRING_OFFER_VERSION: u8 = 2;

pub struct MobilePairingOffer {
    pub device_id: String,
    pub endpoint: String,
    pub pairing_url: String,
}

#[derive(Debug, Error)]
pub enum MobilePairingOfferError {
    #[error("mobile pairing address is invalid")]
    Address,
    #[error(transparent)]
    Device(#[from] MobileDeviceStoreError),
    #[error("mobile pairing offer serialization failed: {0}")]
    Serialization(#[from] serde_json::Error),
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PairingPayload<'a> {
    device_token: &'a str,
    endpoint: &'a str,
    public_key_b64: &'a str,
    scope: &'static str,
    v: u8,
}

pub async fn create_pairing_offer(
    devices: &MobileDeviceStore,
    keypair: &MobileKeypair,
    raw_endpoint: &str,
    address: &str,
    device_name: String,
) -> Result<MobilePairingOffer, MobilePairingOfferError> {
    let device = devices.get_or_create_named(device_name).await?;
    encode_pairing_offer(keypair, raw_endpoint, address, device)
}

pub(super) async fn create_pending_pairing_offer(
    devices: &MobileDeviceStore,
    keypair: &MobileKeypair,
    raw_endpoint: &str,
    address: &str,
    device_name: String,
    rotate: bool,
) -> Result<MobilePairingOffer, MobilePairingOfferError> {
    let device = devices.get_or_create_pending(device_name, rotate).await?;
    encode_pairing_offer(keypair, raw_endpoint, address, device)
}

fn encode_pairing_offer(
    keypair: &MobileKeypair,
    raw_endpoint: &str,
    address: &str,
    device: MobileDevice,
) -> Result<MobilePairingOffer, MobilePairingOfferError> {
    let endpoint = replace_endpoint_address(raw_endpoint, address)?;
    let payload = serde_json::to_vec(&PairingPayload {
        device_token: &device.token,
        endpoint: &endpoint,
        public_key_b64: &keypair.public_key_b64,
        scope: "mobile",
        v: PAIRING_OFFER_VERSION,
    })?;
    Ok(MobilePairingOffer {
        device_id: device.id,
        endpoint,
        pairing_url: format!("yiru://pair?code={}", URL_SAFE_NO_PAD.encode(payload)),
    })
}

fn replace_endpoint_address(
    raw_endpoint: &str,
    address: &str,
) -> Result<String, MobilePairingOfferError> {
    let mut endpoint = Url::parse(raw_endpoint).map_err(|_| MobilePairingOfferError::Address)?;
    let replacement =
        Url::parse(&format!("ws://{address}")).map_err(|_| MobilePairingOfferError::Address)?;
    let host = replacement
        .host_str()
        .filter(|host| !host.is_empty())
        .ok_or(MobilePairingOfferError::Address)?;
    endpoint
        .set_host(Some(host))
        .map_err(|_| MobilePairingOfferError::Address)?;
    if let Some(port) = replacement.port() {
        endpoint
            .set_port(Some(port))
            .map_err(|_| MobilePairingOfferError::Address)?;
    }
    Ok(endpoint.to_string())
}

use serde_json::Value;
use thiserror::Error;

use super::MobileDeviceStore;
use super::authorization::MobileAuthorization;
use super::devices::MobileDeviceStoreError;

#[derive(Debug, Error)]
pub enum MobilePairingError {
    #[error("mobile_auth_invalid")]
    Invalid,
    #[error(transparent)]
    Storage(#[from] MobileDeviceStoreError),
    #[error("mobile_auth_unauthorized")]
    Unauthorized,
}

pub async fn authenticate(
    devices: &MobileDeviceStore,
    plaintext: &str,
    expected_transcript_hash_b64: &str,
) -> Result<MobileAuthorization, MobilePairingError> {
    let value =
        serde_json::from_str::<Value>(plaintext).map_err(|_| MobilePairingError::Invalid)?;
    let object = value.as_object().ok_or(MobilePairingError::Invalid)?;
    let device_token = object
        .get("deviceToken")
        .and_then(Value::as_str)
        .ok_or(MobilePairingError::Invalid)?;
    if object.get("type").and_then(Value::as_str) != Some("e2ee_auth")
        || object.get("v").and_then(Value::as_f64) != Some(2.0)
        || object.get("transcriptHashB64").and_then(Value::as_str)
            != Some(expected_transcript_hash_b64)
    {
        return Err(MobilePairingError::Invalid);
    }
    devices
        .authorize_token(device_token.to_owned())
        .await?
        .ok_or(MobilePairingError::Unauthorized)
}

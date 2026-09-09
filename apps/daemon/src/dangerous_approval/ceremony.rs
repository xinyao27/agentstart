use std::collections::HashSet;

use base64::Engine;
use p256::ecdsa::{Signature, VerifyingKey, signature::Verifier};
use p256::pkcs8::DecodePublicKey;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;
use thiserror::Error;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CeremonyResponse {
    pub(crate) authenticator_data: Option<String>,
    pub(crate) client_data_json: String,
    pub(crate) credential_id: String,
    pub(crate) public_key_spki: Option<String>,
    pub(crate) signature: Option<String>,
}

#[derive(Debug, Error)]
pub(crate) enum CeremonyError {
    #[error("dangerous_approval_base64_invalid")]
    Base64,
    #[error("dangerous_approval_client_data_invalid")]
    ClientData,
    #[error("dangerous_approval_credential_key_invalid")]
    CredentialKey,
    #[error("dangerous_approval_rp_mismatch")]
    RpMismatch,
    #[error("dangerous_approval_signature_encoding_invalid")]
    SignatureEncoding,
    #[error("dangerous_approval_signature_invalid")]
    Signature,
    #[error("dangerous_approval_user_verification_required")]
    UserVerification,
}

pub(crate) fn validate_registration(
    response: &CeremonyResponse,
    expected_challenge: &str,
    allowed_origins: &HashSet<String>,
) -> Result<(), CeremonyError> {
    let authenticator_data = response
        .authenticator_data
        .as_deref()
        .filter(|value| !value.is_empty())
        .ok_or(CeremonyError::UserVerification)?;
    let public_key = response
        .public_key_spki
        .as_deref()
        .filter(|value| !value.is_empty())
        .ok_or(CeremonyError::CredentialKey)?;
    validate_client_data(
        &response.client_data_json,
        expected_challenge,
        allowed_origins,
        "webauthn.create",
    )?;
    validate_authenticator_data(authenticator_data, allowed_origins)?;
    decode_verifying_key(public_key)?;
    Ok(())
}

pub(crate) fn validate_assertion(
    response: &CeremonyResponse,
    expected_challenge: &str,
    allowed_origins: &HashSet<String>,
    public_key_spki: &str,
) -> Result<(), CeremonyError> {
    let authenticator_data = response
        .authenticator_data
        .as_deref()
        .filter(|value| !value.is_empty())
        .ok_or(CeremonyError::UserVerification)?;
    let signature = response
        .signature
        .as_deref()
        .filter(|value| !value.is_empty())
        .ok_or(CeremonyError::Signature)?;
    let client_data = decode_base64_url(&response.client_data_json)?;
    validate_client_data(
        &response.client_data_json,
        expected_challenge,
        allowed_origins,
        "webauthn.get",
    )?;
    let authenticator_data = validate_authenticator_data(authenticator_data, allowed_origins)?;
    let mut signed = Vec::with_capacity(authenticator_data.len() + 32);
    signed.extend_from_slice(&authenticator_data);
    signed.extend_from_slice(&Sha256::digest(client_data));
    let key = decode_verifying_key(public_key_spki)?;
    let signature = Signature::from_der(&decode_base64_url(signature)?)
        .map_err(|_| CeremonyError::SignatureEncoding)?;
    key.verify(&signed, &signature)
        .map_err(|_| CeremonyError::Signature)
}

fn validate_client_data(
    encoded: &str,
    expected_challenge: &str,
    allowed_origins: &HashSet<String>,
    expected_type: &str,
) -> Result<(), CeremonyError> {
    let decoded = decode_base64_url(encoded)?;
    let value = serde_json::from_slice::<serde_json::Value>(&decoded)
        .map_err(|_| CeremonyError::ClientData)?;
    let object = value.as_object().ok_or(CeremonyError::ClientData)?;
    let is_valid = object.get("type").and_then(serde_json::Value::as_str) == Some(expected_type)
        && object.get("challenge").and_then(serde_json::Value::as_str) == Some(expected_challenge)
        && object
            .get("origin")
            .and_then(serde_json::Value::as_str)
            .is_some_and(|origin| allowed_origins.contains(origin));
    is_valid.then_some(()).ok_or(CeremonyError::ClientData)
}

fn validate_authenticator_data(
    encoded: &str,
    allowed_origins: &HashSet<String>,
) -> Result<Vec<u8>, CeremonyError> {
    let data = decode_base64_url(encoded)?;
    if data.len() < 37 || data[32] & 0x05 != 0x05 {
        return Err(CeremonyError::UserVerification);
    }
    let rp_hash = &data[..32];
    let matches = allowed_origins.iter().any(|origin| {
        let expected = Sha256::digest(origin.as_bytes());
        bool::from(rp_hash.ct_eq(expected.as_slice()))
    });
    matches.then_some(data).ok_or(CeremonyError::RpMismatch)
}

fn decode_verifying_key(encoded: &str) -> Result<VerifyingKey, CeremonyError> {
    VerifyingKey::from_public_key_der(&decode_base64_url(encoded)?)
        .map_err(|_| CeremonyError::CredentialKey)
}

fn decode_base64_url(value: &str) -> Result<Vec<u8>, CeremonyError> {
    base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(value)
        .or_else(|_| base64::engine::general_purpose::URL_SAFE.decode(value))
        .map_err(|_| CeremonyError::Base64)
}

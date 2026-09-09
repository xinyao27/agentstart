use base64::Engine as _;
use base64::engine::general_purpose::{STANDARD as BASE64, URL_SAFE_NO_PAD};
use serde::{Deserialize, Serialize};
use url::Url;

use super::authority::RuntimeEnvironmentError;

const OFFER_VERSION: u8 = 2;
const MAX_OFFER_CODE_BYTES: usize = 8 * 1_024;
const RUNTIME_PATH: &str = "/runtime";

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct RuntimeOffer {
    endpoint: String,
    public_key_b64: String,
    scope: String,
    token: String,
    v: u8,
}

pub(super) struct DecodedRuntimeOffer {
    pub(super) endpoint: String,
    pub(super) public_key_b64: String,
    pub(super) token: String,
}

pub(super) fn encode(
    endpoint: &str,
    token: &str,
    public_key_b64: &str,
) -> Result<String, RuntimeEnvironmentError> {
    validate_endpoint(endpoint)?;
    decode_canonical_public_key(public_key_b64)?;
    validate_token(token)?;
    let json = serde_json::to_vec(&RuntimeOffer {
        endpoint: endpoint.to_owned(),
        public_key_b64: public_key_b64.to_owned(),
        scope: "runtime".to_owned(),
        token: token.to_owned(),
        v: OFFER_VERSION,
    })?;
    let code = URL_SAFE_NO_PAD.encode(json);
    if code.len() > MAX_OFFER_CODE_BYTES {
        return Err(RuntimeEnvironmentError::OfferInvalid);
    }
    let mut url = Url::parse("yiru://pair").map_err(|_| RuntimeEnvironmentError::OfferInvalid)?;
    url.query_pairs_mut().append_pair("code", &code);
    Ok(url.into())
}

pub(super) fn decode(value: &str) -> Result<DecodedRuntimeOffer, RuntimeEnvironmentError> {
    let code = if value.starts_with("yiru://") {
        let url = Url::parse(value).map_err(|_| RuntimeEnvironmentError::OfferInvalid)?;
        if url.scheme() != "yiru" || url.host_str() != Some("pair") {
            return Err(RuntimeEnvironmentError::OfferInvalid);
        }
        let mut codes = url
            .query_pairs()
            .filter_map(|(name, value)| (name == "code").then(|| value.into_owned()));
        let code = codes.next().ok_or(RuntimeEnvironmentError::OfferInvalid)?;
        if codes.next().is_some() {
            return Err(RuntimeEnvironmentError::OfferInvalid);
        }
        code
    } else {
        value.to_owned()
    };
    if code.len() > MAX_OFFER_CODE_BYTES {
        return Err(RuntimeEnvironmentError::OfferInvalid);
    }
    let bytes = URL_SAFE_NO_PAD
        .decode(&code)
        .map_err(|_| RuntimeEnvironmentError::OfferInvalid)?;
    if URL_SAFE_NO_PAD.encode(&bytes) != code {
        return Err(RuntimeEnvironmentError::OfferInvalid);
    }
    let offer = serde_json::from_slice::<RuntimeOffer>(&bytes)
        .map_err(|_| RuntimeEnvironmentError::OfferInvalid)?;
    if offer.v != OFFER_VERSION || offer.scope != "runtime" {
        return Err(RuntimeEnvironmentError::OfferInvalid);
    }
    validate_endpoint(&offer.endpoint)?;
    validate_token(&offer.token)?;
    decode_canonical_public_key(&offer.public_key_b64)?;
    Ok(DecodedRuntimeOffer {
        endpoint: offer.endpoint,
        public_key_b64: offer.public_key_b64,
        token: offer.token,
    })
}

pub(super) fn public_endpoint(
    active_endpoint: &str,
    address: &str,
    override_endpoint: Option<&str>,
) -> Result<String, RuntimeEnvironmentError> {
    if let Some(endpoint) = override_endpoint.filter(|value| !value.is_empty()) {
        validate_endpoint(endpoint)?;
        return Ok(endpoint.to_owned());
    }
    if address.trim().is_empty() {
        return Err(RuntimeEnvironmentError::AddressInvalid);
    }
    let mut endpoint =
        Url::parse(active_endpoint).map_err(|_| RuntimeEnvironmentError::EndpointInvalid)?;
    if address.contains("://") {
        endpoint = Url::parse(address).map_err(|_| RuntimeEnvironmentError::AddressInvalid)?;
    } else {
        endpoint
            .set_host(Some(address))
            .map_err(|_| RuntimeEnvironmentError::AddressInvalid)?;
    }
    endpoint.set_path(RUNTIME_PATH);
    validate_endpoint(endpoint.as_str())?;
    Ok(endpoint.into())
}

pub(super) fn validate_endpoint(value: &str) -> Result<(), RuntimeEnvironmentError> {
    let url = Url::parse(value).map_err(|_| RuntimeEnvironmentError::EndpointInvalid)?;
    if !matches!(url.scheme(), "ws" | "wss")
        || url.host_str().is_none()
        || url.path() != RUNTIME_PATH
        || !url.username().is_empty()
        || url.password().is_some()
        || url.fragment().is_some()
        || url.query().is_some()
    {
        return Err(RuntimeEnvironmentError::EndpointInvalid);
    }
    Ok(())
}

fn validate_token(value: &str) -> Result<(), RuntimeEnvironmentError> {
    if value.is_empty() || value.len() > 256 || !value.is_ascii() {
        return Err(RuntimeEnvironmentError::OfferInvalid);
    }
    Ok(())
}

fn decode_canonical_public_key(value: &str) -> Result<[u8; 32], RuntimeEnvironmentError> {
    if value.len() != 44 || !value.ends_with('=') {
        return Err(RuntimeEnvironmentError::OfferInvalid);
    }
    let bytes = BASE64
        .decode(value)
        .map_err(|_| RuntimeEnvironmentError::OfferInvalid)?;
    let bytes = <[u8; 32]>::try_from(bytes).map_err(|_| RuntimeEnvironmentError::OfferInvalid)?;
    if bytes == [0_u8; 32] || BASE64.encode(bytes) != value {
        return Err(RuntimeEnvironmentError::OfferInvalid);
    }
    Ok(bytes)
}

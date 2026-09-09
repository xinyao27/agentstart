use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(super) struct RuntimeAuthRequest {
    pub(super) token: String,
    pub(super) transcript_hash_b64: String,
    pub(super) r#type: String,
    pub(super) v: u8,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(super) struct RuntimeAuthResponse {
    pub(super) runtime_id: String,
    pub(super) transcript_hash_b64: String,
    pub(super) r#type: String,
    pub(super) v: u8,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RuntimeAuthRequestRef<'a> {
    pub(super) token: &'a str,
    pub(super) transcript_hash_b64: &'a str,
    pub(super) r#type: &'static str,
    pub(super) v: u8,
}

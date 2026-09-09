use std::path::Path;

use base64::Engine as _;
use base64::engine::general_purpose::{URL_SAFE, URL_SAFE_NO_PAD};
use serde_json::Value;

use super::{AccountsError, CREDENTIAL_BYTE_LIMIT, read_bounded_json};

pub(super) struct Identity {
    pub(super) email: String,
    pub(super) organization_uuid: Option<String>,
    pub(super) organization_name: Option<String>,
    pub(super) provider_account_id: Option<String>,
    pub(super) workspace_label: Option<String>,
    pub(super) workspace_account_id: Option<String>,
}

pub(super) fn claude_identity(
    status: &Value,
    credentials: &Value,
    oauth_account: &Value,
) -> Result<Identity, AccountsError> {
    let oauth = credentials.get("claudeAiOauth");
    let email = string_claim(status, "email")
        .or_else(|| string_claim(oauth_account, "emailAddress"))
        .or_else(|| string_claim(oauth_account, "email"))
        .or_else(|| oauth.and_then(|value| string_claim(value, "email")))
        .ok_or(AccountsError::IdentityUnavailable)?;
    Ok(Identity {
        email,
        organization_uuid: string_claim(status, "organizationUuid")
            .or_else(|| string_claim(status, "organizationId"))
            .or_else(|| string_claim(oauth_account, "organizationUuid"))
            .or_else(|| string_claim(oauth_account, "organizationId")),
        organization_name: string_claim(status, "organizationName")
            .or_else(|| string_claim(oauth_account, "organizationName")),
        provider_account_id: None,
        workspace_label: None,
        workspace_account_id: None,
    })
}

pub(super) async fn codex_identity(path: &Path) -> Result<Identity, AccountsError> {
    let auth = read_bounded_json(path)
        .await?
        .ok_or(AccountsError::IdentityUnavailable)?;
    let tokens = auth
        .get("tokens")
        .ok_or(AccountsError::IdentityUnavailable)?;
    let token = string_claim(tokens, "id_token")
        .or_else(|| string_claim(tokens, "idToken"))
        .ok_or(AccountsError::IdentityUnavailable)?;
    let payload = jwt_payload(&token).ok_or(AccountsError::IdentityUnavailable)?;
    let auth_claims = payload.get("https://api.openai.com/auth");
    let profile = payload.get("https://api.openai.com/profile");
    let email = string_claim(&payload, "email")
        .or_else(|| profile.and_then(|value| string_claim(value, "email")))
        .ok_or(AccountsError::IdentityUnavailable)?;
    let provider_account_id = string_claim(tokens, "account_id")
        .or_else(|| auth_claims.and_then(|value| string_claim(value, "chatgpt_account_id")));
    Ok(Identity {
        email,
        organization_uuid: None,
        organization_name: None,
        provider_account_id: provider_account_id.clone(),
        workspace_label: auth_claims
            .and_then(|value| string_claim(value, "workspace_name"))
            .or_else(|| profile.and_then(|value| string_claim(value, "workspace_name"))),
        workspace_account_id: auth_claims
            .and_then(|value| string_claim(value, "workspace_account_id"))
            .or(provider_account_id),
    })
}

fn string_claim(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

fn jwt_payload(token: &str) -> Option<Value> {
    let segment = token.split('.').nth(1)?;
    let bytes = URL_SAFE_NO_PAD
        .decode(segment)
        .or_else(|_| URL_SAFE.decode(segment))
        .ok()?;
    (bytes.len() as u64 <= CREDENTIAL_BYTE_LIMIT)
        .then(|| serde_json::from_slice(&bytes).ok())
        .flatten()
}

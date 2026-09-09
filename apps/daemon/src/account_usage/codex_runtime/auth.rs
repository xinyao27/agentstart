use std::path::Path;

use base64::Engine as _;
use serde_json::{Map, Value};

use super::{CodexRuntimeError, ManagedCodexAccount, managed_files};

const AUTH_BYTE_LIMIT: u64 = 2 * 1024 * 1024;

#[derive(Clone)]
struct AuthIdentity {
    email: Option<String>,
    provider_account_id: Option<String>,
    workspace_account_id: Option<String>,
}

pub(super) fn read(path: &Path) -> Result<Option<String>, CodexRuntimeError> {
    let contents = managed_files::read_bounded(path, AUTH_BYTE_LIMIT).map_err(|error| {
        if matches!(error, CodexRuntimeError::InvalidConfig) {
            CodexRuntimeError::InvalidAuth
        } else {
            error
        }
    })?;
    let Some(contents) = contents else {
        return Ok(None);
    };
    let contents = String::from_utf8(contents).map_err(|_| CodexRuntimeError::InvalidAuth)?;
    serde_json::from_str::<Value>(&contents).map_err(|_| CodexRuntimeError::InvalidAuth)?;
    Ok(Some(contents))
}

pub(super) fn write(path: &Path, contents: &str) -> Result<(), CodexRuntimeError> {
    if read(path).is_ok_and(|current| current.as_deref() == Some(contents)) {
        managed_files::harden_private_file(path)?;
        return Ok(());
    }
    managed_files::write_private(path, contents.as_bytes())?;
    Ok(())
}

pub(super) fn persist_runtime_refresh(
    runtime_contents: &str,
    account: &ManagedCodexAccount,
    last_written: Option<&str>,
) -> Result<bool, CodexRuntimeError> {
    let managed_path = account.host_path.join("auth.json");
    let managed_contents = read(&managed_path)?;
    let baseline = managed_contents.as_deref().or(last_written);
    let Some(baseline) = baseline else {
        return Ok(false);
    };
    if runtime_contents == baseline || !matches_account(runtime_contents, account, baseline) {
        return Ok(false);
    }
    match last_written {
        Some(last_written)
            if managed_contents
                .as_deref()
                .is_some_and(|managed| managed != last_written) =>
        {
            return Ok(false);
        }
        None if !is_fresher(runtime_contents, baseline) => return Ok(false),
        Some(_) | None => {}
    }
    write(&managed_path, runtime_contents)?;
    Ok(true)
}

pub(super) fn persist_system_refresh(
    runtime_contents: &str,
    system_auth_path: &Path,
    last_written: Option<&str>,
) -> Result<bool, CodexRuntimeError> {
    let Some(system_contents) = read(system_auth_path)? else {
        return Ok(false);
    };
    if runtime_contents == system_contents
        || !same_identity(runtime_contents, &system_contents)
        || last_written.is_none() && !is_fresher(runtime_contents, &system_contents)
        || last_written.is_some_and(|last| last != system_contents)
    {
        return Ok(false);
    }
    write(system_auth_path, runtime_contents)?;
    Ok(true)
}

fn matches_account(contents: &str, account: &ManagedCodexAccount, baseline: &str) -> bool {
    let Some(runtime) = identity(contents) else {
        return false;
    };
    let managed = identity(baseline);
    let selected_email = normalized(account.email.as_deref())
        .or_else(|| managed.as_ref().and_then(|value| value.email.clone()));
    let selected_provider = normalized(account.provider_account_id.as_deref()).or_else(|| {
        managed
            .as_ref()
            .and_then(|value| value.provider_account_id.clone())
    });
    let selected_workspace = normalized(account.workspace_account_id.as_deref()).or_else(|| {
        managed
            .as_ref()
            .and_then(|value| value.workspace_account_id.clone())
    });
    if selected_email
        .as_ref()
        .zip(runtime.email.as_ref())
        .is_some_and(|(selected, actual)| selected != actual)
        || !field_matches(
            selected_provider.as_deref(),
            runtime.provider_account_id.as_deref(),
        )
        || !field_matches(
            selected_workspace.as_deref(),
            runtime.workspace_account_id.as_deref(),
        )
    {
        return false;
    }
    let strong = selected_provider
        .as_ref()
        .zip(runtime.provider_account_id.as_ref())
        .is_some()
        || selected_workspace
            .as_ref()
            .zip(runtime.workspace_account_id.as_ref())
            .is_some();
    let email_only = selected_email
        .as_ref()
        .zip(runtime.email.as_ref())
        .is_some_and(|(selected, actual)| selected == actual)
        && runtime.provider_account_id.is_none()
        && runtime.workspace_account_id.is_none();
    strong || email_only
}

fn same_identity(left: &str, right: &str) -> bool {
    let (Some(left), Some(right)) = (identity(left), identity(right)) else {
        return false;
    };
    if left
        .email
        .as_ref()
        .zip(right.email.as_ref())
        .is_some_and(|(left, right)| left != right)
        || !field_matches(
            right.provider_account_id.as_deref(),
            left.provider_account_id.as_deref(),
        )
        || !field_matches(
            right.workspace_account_id.as_deref(),
            left.workspace_account_id.as_deref(),
        )
    {
        return false;
    }
    right
        .provider_account_id
        .as_ref()
        .zip(left.provider_account_id.as_ref())
        .is_some()
        || right
            .workspace_account_id
            .as_ref()
            .zip(left.workspace_account_id.as_ref())
            .is_some()
        || right
            .email
            .as_ref()
            .zip(left.email.as_ref())
            .is_some_and(|(right, left)| right == left)
            && left.provider_account_id.is_none()
            && left.workspace_account_id.is_none()
}

fn field_matches(expected: Option<&str>, actual: Option<&str>) -> bool {
    expected.is_none_or(|expected| actual == Some(expected))
}

fn is_fresher(left: &str, right: &str) -> bool {
    freshness(left)
        .zip(freshness(right))
        .is_some_and(|(left, right)| left > right)
}

fn identity(contents: &str) -> Option<AuthIdentity> {
    let raw = serde_json::from_str::<Value>(contents).ok()?;
    let raw = raw.as_object()?;
    let tokens = record(raw.get("tokens"));
    let token = string(tokens, "id_token").or_else(|| string(tokens, "idToken"));
    let payload = token.as_deref().and_then(jwt_payload);
    let auth = payload
        .as_ref()
        .and_then(|payload| record(payload.get("https://api.openai.com/auth")));
    let profile = payload
        .as_ref()
        .and_then(|payload| record(payload.get("https://api.openai.com/profile")));
    Some(AuthIdentity {
        email: normalized(
            string(payload.as_ref(), "email")
                .or_else(|| string(profile, "email"))
                .as_deref(),
        ),
        provider_account_id: normalized(
            string(tokens, "account_id")
                .or_else(|| string(tokens, "accountId"))
                .or_else(|| string(auth, "chatgpt_account_id"))
                .or_else(|| string(payload.as_ref(), "chatgpt_account_id"))
                .as_deref(),
        ),
        workspace_account_id: normalized(
            string(auth, "workspace_account_id")
                .or_else(|| string(tokens, "account_id"))
                .or_else(|| string(tokens, "accountId"))
                .or_else(|| string(payload.as_ref(), "chatgpt_account_id"))
                .as_deref(),
        ),
    })
}

fn freshness(contents: &str) -> Option<f64> {
    let raw = serde_json::from_str::<Value>(contents).ok()?;
    let tokens = record(raw.get("tokens"));
    let token = string(tokens, "id_token").or_else(|| string(tokens, "idToken"));
    let payload = token.as_deref().and_then(jwt_payload);
    ["expires_at", "expiresAt", "expiry", "expires"]
        .into_iter()
        .find_map(|key| number(tokens, key))
        .or_else(|| number(payload.as_ref(), "exp"))
        .or_else(|| number(payload.as_ref(), "iat"))
}

fn jwt_payload(token: &str) -> Option<Map<String, Value>> {
    let payload = token.split('.').nth(1)?;
    let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(payload)
        .or_else(|_| base64::engine::general_purpose::URL_SAFE.decode(payload))
        .ok()?;
    serde_json::from_slice::<Value>(&bytes)
        .ok()?
        .as_object()
        .cloned()
}

fn record(value: Option<&Value>) -> Option<&Map<String, Value>> {
    value.and_then(Value::as_object)
}

fn string(value: Option<&Map<String, Value>>, key: &str) -> Option<String> {
    value?.get(key)?.as_str().map(str::to_owned)
}

fn number(value: Option<&Map<String, Value>>, key: &str) -> Option<f64> {
    let value = value?.get(key)?;
    value
        .as_f64()
        .or_else(|| value.as_str().and_then(|value| value.parse().ok()))
        .filter(|value| value.is_finite())
}

fn normalized(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

use serde_json::{Map, Value, json};

use super::super::{AccountsError, ProviderAccountRoster};
use super::{
    AccountsAuthority, AuthenticationProvider, AuthenticationTarget, Identity, ManagedLocation,
    now_ms,
};

pub(super) fn account_value(
    provider: AuthenticationProvider,
    account_id: &str,
    location: &ManagedLocation,
    identity: Identity,
) -> Result<Value, AccountsError> {
    let now = now_ms()?;
    let mut account = Map::from_iter([
        ("id".to_owned(), json!(account_id)),
        ("email".to_owned(), json!(identity.email)),
        ("wslDistro".to_owned(), json!(location.wsl_distro)),
        ("createdAt".to_owned(), json!(now)),
        ("updatedAt".to_owned(), json!(now)),
        ("lastAuthenticatedAt".to_owned(), json!(now)),
    ]);
    match provider {
        AuthenticationProvider::Claude => {
            account.insert("managedAuthPath".to_owned(), json!(location.host_path));
            account.insert("managedAuthRuntime".to_owned(), json!(location.runtime));
            account.insert("wslLinuxAuthPath".to_owned(), json!(location.linux_path));
            account.insert("authMethod".to_owned(), json!("subscription-oauth"));
        }
        AuthenticationProvider::Codex => {
            account.insert("managedHomePath".to_owned(), json!(location.host_path));
            account.insert("managedHomeRuntime".to_owned(), json!(location.runtime));
            account.insert("wslLinuxHomePath".to_owned(), json!(location.linux_path));
        }
    }
    apply_identity(provider, &mut account, identity);
    Ok(Value::Object(account))
}

pub(super) fn apply_identity(
    provider: AuthenticationProvider,
    account: &mut Map<String, Value>,
    identity: Identity,
) {
    account.insert("email".to_owned(), json!(identity.email));
    match provider {
        AuthenticationProvider::Claude => {
            account.insert(
                "organizationUuid".to_owned(),
                json!(identity.organization_uuid),
            );
            account.insert(
                "organizationName".to_owned(),
                json!(identity.organization_name),
            );
        }
        AuthenticationProvider::Codex => {
            account.insert(
                "providerAccountId".to_owned(),
                json!(identity.provider_account_id),
            );
            account.insert("workspaceLabel".to_owned(), json!(identity.workspace_label));
            account.insert(
                "workspaceAccountId".to_owned(),
                json!(identity.workspace_account_id),
            );
        }
    }
}

pub(super) fn has_duplicate(
    document: &Map<String, Value>,
    provider: AuthenticationProvider,
    candidate: &Value,
) -> bool {
    if matches!(provider, AuthenticationProvider::Codex) {
        return false;
    }
    let email = normalized(candidate.get("email").and_then(Value::as_str), true);
    if email.is_none() {
        return false;
    }
    let organization_uuid = normalized(
        candidate.get("organizationUuid").and_then(Value::as_str),
        false,
    );
    let runtime = candidate
        .get(if matches!(provider, AuthenticationProvider::Claude) {
            "managedAuthRuntime"
        } else {
            "managedHomeRuntime"
        })
        .and_then(Value::as_str);
    let distro = normalized(candidate.get("wslDistro").and_then(Value::as_str), false);
    document
        .get(account_list_key(provider))
        .and_then(Value::as_array)
        .is_some_and(|accounts| {
            accounts.iter().any(|account| {
                normalized(account.get("email").and_then(Value::as_str), true) == email
                    && normalized(
                        account.get("organizationUuid").and_then(Value::as_str),
                        false,
                    ) == organization_uuid
                    && account
                        .get(if matches!(provider, AuthenticationProvider::Claude) {
                            "managedAuthRuntime"
                        } else {
                            "managedHomeRuntime"
                        })
                        .and_then(Value::as_str)
                        .unwrap_or("host")
                        == runtime.unwrap_or("host")
                    && normalized(account.get("wslDistro").and_then(Value::as_str), false) == distro
            })
        })
}

fn normalized(value: Option<&str>, lowercase: bool) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| {
            if lowercase {
                value.to_lowercase()
            } else {
                value.to_owned()
            }
        })
}

pub(super) fn roster(
    authority: &AccountsAuthority,
    provider: AuthenticationProvider,
) -> Result<ProviderAccountRoster, AccountsError> {
    match provider {
        AuthenticationProvider::Claude => authority
            .list_cached_claude()
            .map(ProviderAccountRoster::Claude),
        AuthenticationProvider::Codex => authority
            .list_cached_codex()
            .map(ProviderAccountRoster::Codex),
    }
}

pub(super) fn validate_target(target: &AuthenticationTarget<'_>) -> Result<(), AccountsError> {
    if !matches!(target.runtime, "host" | "wsl")
        || target.runtime == "host" && target.wsl_distro.is_some()
        || target.wsl_distro.is_some_and(|value| {
            value.trim().is_empty()
                || value.len() > 128
                || value.chars().any(|character| character.is_control())
        })
    {
        return Err(AccountsError::Input("target"));
    }
    Ok(())
}

pub(super) fn account_list_key(provider: AuthenticationProvider) -> &'static str {
    match provider {
        AuthenticationProvider::Claude => "claudeManagedAccounts",
        AuthenticationProvider::Codex => "codexManagedAccounts",
    }
}

pub(super) fn active_account_key(provider: AuthenticationProvider) -> &'static str {
    match provider {
        AuthenticationProvider::Claude => "activeClaudeManagedAccountId",
        AuthenticationProvider::Codex => "activeCodexManagedAccountId",
    }
}

pub(super) fn selection_key(provider: AuthenticationProvider) -> &'static str {
    match provider {
        AuthenticationProvider::Claude => "activeClaudeManagedAccountIdsByRuntime",
        AuthenticationProvider::Codex => "activeCodexManagedAccountIdsByRuntime",
    }
}

pub(super) fn account_restore_document(
    document: &Map<String, Value>,
    provider: AuthenticationProvider,
) -> Map<String, Value> {
    [
        account_list_key(provider),
        active_account_key(provider),
        selection_key(provider),
    ]
    .into_iter()
    .filter_map(|key| {
        document
            .get(key)
            .cloned()
            .map(|value| (key.to_owned(), value))
    })
    .collect()
}

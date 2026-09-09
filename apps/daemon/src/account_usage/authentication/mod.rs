mod claude;
mod codex;
mod credentials;
mod document;
mod identity;
mod location;
mod login;
mod minimax;

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde_json::{Map, Value, json};
use tokio::sync::watch;

use super::accounts::AccountsAuthority;
use super::{AccountsError, ProviderAccountRoster};
use claude::authenticate as authenticate_claude;
use codex::authenticate as authenticate_codex;
use credentials::{CredentialSnapshot, read_bounded, read_bounded_json, read_bounded_sync};
#[cfg(target_os = "macos")]
use credentials::{
    keychain_user, read_keychain_bytes, read_keychain_json, restore_keychain,
    scoped_keychain_service,
};
use document::{
    account_list_key, account_restore_document, account_value, active_account_key, apply_identity,
    has_duplicate, roster, selection_key, validate_target,
};
use identity::{Identity, claude_identity, codex_identity};
use location::{cleanup_location, create_location, stored_location};
use login::{run, run_codex};

const CLAUDE_LOGIN_TIMEOUT: Duration = Duration::from_secs(180);
const CODEX_LOGIN_TIMEOUT: Duration = Duration::from_secs(120);
const COMMAND_EXIT_GRACE: Duration = Duration::from_secs(3);
const CREDENTIAL_BYTE_LIMIT: u64 = 1024 * 1024;
pub(crate) use minimax::{
    clear as clear_minimax_cookie, read as read_minimax_cookie, save as save_minimax_cookie,
};

#[derive(Clone, Copy)]
pub(crate) enum AuthenticationProvider {
    Claude,
    Codex,
}

impl AuthenticationProvider {
    pub(crate) fn name(self) -> &'static str {
        match self {
            Self::Claude => "claude",
            Self::Codex => "codex",
        }
    }
}

pub(crate) struct AuthenticationTarget<'a> {
    pub(crate) runtime: &'a str,
    pub(crate) wsl_distro: Option<&'a str>,
}

pub(crate) struct AccountAuthentication {
    claude_login: Arc<Mutex<Option<watch::Sender<bool>>>>,
}

#[derive(Clone)]
pub(in crate::account_usage) struct ManagedLocation {
    pub(in crate::account_usage) account_id: String,
    pub(in crate::account_usage) host_path: PathBuf,
    pub(in crate::account_usage) linux_path: Option<String>,
    pub(in crate::account_usage) runtime: &'static str,
    pub(in crate::account_usage) wsl_distro: Option<String>,
}

struct PendingClaudeLoginGuard {
    pending: Arc<Mutex<Option<watch::Sender<bool>>>>,
}

struct LocationCleanupGuard {
    account_id: String,
    armed: bool,
    location: ManagedLocation,
    provider: AuthenticationProvider,
    root: PathBuf,
}

impl Drop for PendingClaudeLoginGuard {
    fn drop(&mut self) {
        *lock(&self.pending) = None;
    }
}

impl LocationCleanupGuard {
    fn new(
        root: &Path,
        provider: AuthenticationProvider,
        location: &ManagedLocation,
        account_id: &str,
    ) -> Self {
        Self {
            account_id: account_id.to_owned(),
            armed: true,
            location: location.clone(),
            provider,
            root: root.to_owned(),
        }
    }

    fn disarm(&mut self) {
        self.armed = false;
    }
}

impl Drop for LocationCleanupGuard {
    fn drop(&mut self) {
        if !self.armed {
            return;
        }
        let account_id = self.account_id.clone();
        let location = self.location.clone();
        let provider = self.provider;
        let root = self.root.clone();
        tokio::spawn(async move {
            cleanup_location(&root, provider, &location, &account_id).await;
        });
    }
}

impl AccountAuthentication {
    pub(crate) fn new() -> Self {
        Self {
            claude_login: Arc::new(Mutex::new(None)),
        }
    }

    pub(crate) fn cancel_claude_login(&self) -> bool {
        let sender = lock(&self.claude_login);
        sender
            .as_ref()
            .is_some_and(|sender| !*sender.borrow() && sender.send(true).is_ok())
    }

    pub(crate) async fn add(
        &self,
        authority: &AccountsAuthority,
        provider: AuthenticationProvider,
        target: AuthenticationTarget<'_>,
        call_cancelled: impl Future<Output = ()>,
    ) -> Result<ProviderAccountRoster, AccountsError> {
        validate_target(&target)?;
        let account_id = random_uuid()?;
        let location = create_location(&authority.root, provider, &account_id, &target).await?;
        let mut cleanup =
            LocationCleanupGuard::new(&authority.root, provider, &location, &account_id);
        if matches!(provider, AuthenticationProvider::Codex) {
            authority
                .codex_runtime()
                .sync_login_location(&location, true)
                .await
                .map_err(runtime_accounts_error)?;
        }
        let result = self
            .authenticate(provider, &location, call_cancelled)
            .await
            .and_then(|identity| account_value(provider, &account_id, &location, identity));
        let account = match result {
            Ok(account) => account,
            Err(error) => return Err(error),
        };
        let document = authority.settings.account_document();
        if has_duplicate(&document, provider, &account) {
            return Err(AccountsError::AlreadyExists);
        }
        let key = account_list_key(provider);
        let mut accounts = document
            .get(key)
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        accounts.push(account);
        let mut updates = Map::from_iter([(key.to_owned(), Value::Array(accounts))]);
        if matches!(provider, AuthenticationProvider::Codex) && location.runtime == "host" {
            updates.insert(
                active_account_key(provider).to_owned(),
                Value::String(account_id.clone()),
            );
            let mut selection = document
                .get(selection_key(provider))
                .and_then(Value::as_object)
                .cloned()
                .unwrap_or_else(|| Map::from_iter([("wsl".to_owned(), json!({}))]));
            selection.insert("host".to_owned(), Value::String(account_id.clone()));
            updates.insert(selection_key(provider).to_owned(), Value::Object(selection));
        } else if matches!(provider, AuthenticationProvider::Codex) {
            let distro = location
                .wsl_distro
                .as_deref()
                .ok_or(AccountsError::InvalidState)?;
            let mut selection = document
                .get(selection_key(provider))
                .and_then(Value::as_object)
                .cloned()
                .unwrap_or_default();
            let mut wsl = selection
                .get("wsl")
                .and_then(Value::as_object)
                .cloned()
                .unwrap_or_default();
            wsl.insert(distro.to_owned(), Value::String(account_id.clone()));
            selection.insert("wsl".to_owned(), Value::Object(wsl));
            selection.entry("host".to_owned()).or_insert(Value::Null);
            updates.insert(selection_key(provider).to_owned(), Value::Object(selection));
        }
        if let Err(error) = authority.settings.update_account_document(updates).await {
            let _ = authority
                .settings
                .update_account_document(account_restore_document(&document, provider))
                .await;
            return Err(error.into());
        }
        cleanup.disarm();
        if matches!(provider, AuthenticationProvider::Codex) {
            authority
                .codex_runtime()
                .sync_after_change(codex_target(&location), Some(&account_id))
                .await;
            refresh_codex_in_background(authority, &location);
        }
        authority.publish()?;
        roster(authority, provider)
    }

    pub(crate) async fn reauthenticate(
        &self,
        authority: &AccountsAuthority,
        provider: AuthenticationProvider,
        account_id: &str,
        call_cancelled: impl Future<Output = ()>,
    ) -> Result<ProviderAccountRoster, AccountsError> {
        let document = authority.settings.account_document();
        let account = super::accounts::find_account(&document, provider.name(), account_id)?;
        let location = stored_location(&authority.root, provider, account, account_id)?;
        let snapshot = CredentialSnapshot::capture(provider, &location).await?;
        if matches!(provider, AuthenticationProvider::Codex) {
            authority
                .codex_runtime()
                .sync_login_location(&location, false)
                .await
                .map_err(runtime_accounts_error)?;
        }
        let identity = match self.authenticate(provider, &location, call_cancelled).await {
            Ok(identity) => identity,
            Err(error) => {
                snapshot.restore().await?;
                return Err(error);
            }
        };
        let update = async {
            let key = account_list_key(provider);
            let now = now_ms()?;
            let mut accounts = document
                .get(key)
                .and_then(Value::as_array)
                .cloned()
                .ok_or(AccountsError::InvalidState)?;
            let account = accounts
                .iter_mut()
                .find(|account| account.get("id").and_then(Value::as_str) == Some(account_id))
                .and_then(Value::as_object_mut)
                .ok_or(AccountsError::NotFound)?;
            apply_identity(provider, account, identity);
            account.insert("updatedAt".to_owned(), json!(now));
            account.insert("lastAuthenticatedAt".to_owned(), json!(now));
            authority
                .settings
                .update_account_document(Map::from_iter([(key.to_owned(), Value::Array(accounts))]))
                .await?;
            if matches!(provider, AuthenticationProvider::Claude) {
                let settings = authority.settings.account_document();
                authority
                    .rate_limits()
                    .refresh_claude(
                        &settings,
                        Some((location.runtime, location.wsl_distro.as_deref())),
                    )
                    .await?;
            }
            Ok::<(), AccountsError>(())
        }
        .await;
        if let Err(error) = update {
            let _ = authority
                .settings
                .update_account_document(account_restore_document(&document, provider))
                .await;
            snapshot.restore().await?;
            return Err(error);
        }
        if matches!(provider, AuthenticationProvider::Codex) {
            authority
                .codex_runtime()
                .sync_after_change(codex_target(&location), Some(account_id))
                .await;
            refresh_codex_in_background(authority, &location);
        }
        authority.publish()?;
        roster(authority, provider)
    }

    async fn authenticate(
        &self,
        provider: AuthenticationProvider,
        location: &ManagedLocation,
        call_cancelled: impl Future<Output = ()>,
    ) -> Result<Identity, AccountsError> {
        match provider {
            AuthenticationProvider::Claude => {
                let (sender, cancellation) = watch::channel(false);
                {
                    let mut pending = lock(&self.claude_login);
                    if pending.is_some() {
                        return Err(AccountsError::LoginBusy);
                    }
                    *pending = Some(sender);
                }
                let _pending_guard = PendingClaudeLoginGuard {
                    pending: self.claude_login.clone(),
                };
                authenticate_claude(location, cancellation, call_cancelled).await
            }
            AuthenticationProvider::Codex => authenticate_codex(location, call_cancelled).await,
        }
    }
}

fn codex_target(location: &ManagedLocation) -> super::codex_runtime::CodexRuntimeTarget {
    if location.runtime == "wsl" {
        return super::codex_runtime::CodexRuntimeTarget::Wsl {
            distro: location.wsl_distro.clone().unwrap_or_default(),
        };
    }
    super::codex_runtime::CodexRuntimeTarget::Host
}

fn runtime_accounts_error(error: super::codex_runtime::CodexRuntimeError) -> AccountsError {
    match error {
        super::codex_runtime::CodexRuntimeError::CustomProvider => AccountsError::CustomProvider,
        super::codex_runtime::CodexRuntimeError::Io(error) => AccountsError::Io(error),
        super::codex_runtime::CodexRuntimeError::SecureFile(error) => {
            AccountsError::SecureFile(error)
        }
        super::codex_runtime::CodexRuntimeError::InvalidAuth
        | super::codex_runtime::CodexRuntimeError::InvalidConfig
        | super::codex_runtime::CodexRuntimeError::InvalidManagedHome
        | super::codex_runtime::CodexRuntimeError::WslHomeUnavailable => {
            AccountsError::InvalidState
        }
    }
}

fn refresh_codex_in_background(authority: &AccountsAuthority, location: &ManagedLocation) {
    let authority = authority.clone();
    let runtime = location.runtime;
    let distro = location.wsl_distro.clone();
    tokio::spawn(async move {
        let _ = authority
            .refresh_target("codex", runtime, distro.as_deref())
            .await;
    });
}

pub(crate) fn minimax_status() -> Result<bool, AccountsError> {
    minimax::status()
}

fn random_uuid() -> Result<String, AccountsError> {
    let mut bytes = [0_u8; 16];
    getrandom::fill(&mut bytes).map_err(|_| AccountsError::InvalidState)?;
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    Ok(format!(
        "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        bytes[0],
        bytes[1],
        bytes[2],
        bytes[3],
        bytes[4],
        bytes[5],
        bytes[6],
        bytes[7],
        bytes[8],
        bytes[9],
        bytes[10],
        bytes[11],
        bytes[12],
        bytes[13],
        bytes[14],
        bytes[15]
    ))
}

fn now_ms() -> Result<f64, AccountsError> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs_f64() * 1_000.0)
        .map_err(|_| AccountsError::InvalidState)
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

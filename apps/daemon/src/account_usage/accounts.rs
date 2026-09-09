use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, Weak};
use std::time::Duration;

use serde_json::{Map, Value};
use thiserror::Error;
use tokio::sync::{Mutex as AsyncMutex, watch};

use crate::host_registry::HostRegistry;
use crate::settings::{SettingsAuthority, SettingsError};

use super::account_snapshot::{
    AccountProvider, AccountsSnapshot, AccountsSubscriptionEvent, ClaudeAccountRoster,
    ClaudeAuthMethod, ClaudeManagedAccount, CodexAccountRoster, CodexManagedAccount,
    CodexSystemIdentity, GrokAccountStatus, ManagedAccountSelection, ManagedAccountSummary,
    ManagedRuntime, ProviderAccountRoster, RateLimitState,
};
use super::authentication::{AccountAuthentication, AuthenticationProvider, AuthenticationTarget};
use super::codex_runtime::{CodexRuntimeHome, CodexRuntimeTarget};
use super::rate_limits::{RateLimitAuthority, RateLimitError, codex_system_identity};

const LIST_REFRESH_BUDGET: Duration = Duration::from_secs(15);
const SUBSCRIBER_REFRESH_STALE_MS: f64 = 5.0 * 60.0 * 1_000.0;

#[derive(Clone)]
pub(crate) struct AccountsAuthority {
    authentication: Arc<AccountAuthentication>,
    codex_runtime: CodexRuntimeHome,
    events: Arc<AccountEvents>,
    mutation_gate: Arc<AsyncMutex<()>>,
    rate_limits: RateLimitAuthority,
    refresh_gate: Arc<AsyncMutex<()>>,
    pub(super) root: PathBuf,
    pub(super) settings: SettingsAuthority,
}

struct AccountEvents {
    next_id: AtomicU64,
    subscribers: Mutex<HashMap<u64, AccountSubscriber>>,
}

struct AccountSubscriber {
    cancellation: watch::Sender<bool>,
    sender: watch::Sender<Option<AccountsSnapshot>>,
    subscription_id: String,
}

pub(crate) struct AccountsSubscription {
    cancellation: watch::Receiver<bool>,
    events: Weak<AccountEvents>,
    id: u64,
    ready: Option<(String, AccountsSnapshot)>,
    snapshots: watch::Receiver<Option<AccountsSnapshot>>,
}

#[derive(Debug, Error)]
pub(crate) enum AccountsError {
    #[error("accounts input is invalid: {0}")]
    Input(&'static str),
    #[error("account not found")]
    NotFound,
    #[error("account belongs to a different runtime")]
    RuntimeMismatch,
    #[error("account already exists")]
    AlreadyExists,
    #[error("account login is already in progress")]
    LoginBusy,
    #[error("account login was cancelled")]
    LoginCancelled,
    #[error("account login timed out")]
    LoginTimedOut,
    #[error("account login command is unavailable")]
    LoginUnavailable,
    #[error("account login failed")]
    LoginFailed,
    #[error("account identity is unavailable")]
    IdentityUnavailable,
    #[error("custom Codex providers cannot use managed OAuth accounts")]
    CustomProvider,
    #[error(transparent)]
    SecureFile(#[from] crate::transport::secure_file::SecureFileError),
    #[error("account state is invalid")]
    InvalidState,
    #[error(transparent)]
    RateLimit(#[from] RateLimitError),
    #[error(transparent)]
    Settings(#[from] SettingsError),
    #[error("account storage failed: {0}")]
    Io(#[from] std::io::Error),
}

impl AccountsAuthority {
    pub(crate) fn new(
        root: PathBuf,
        settings: SettingsAuthority,
        codex_runtime: CodexRuntimeHome,
        hosts: HostRegistry,
    ) -> Result<Self, AccountsError> {
        Ok(Self {
            authentication: Arc::new(AccountAuthentication::new()),
            codex_runtime,
            events: Arc::new(AccountEvents {
                next_id: AtomicU64::new(0),
                subscribers: Mutex::new(HashMap::new()),
            }),
            mutation_gate: Arc::new(AsyncMutex::new(())),
            rate_limits: RateLimitAuthority::new(root.clone(), hosts)?,
            refresh_gate: Arc::new(AsyncMutex::new(())),
            root,
            settings,
        })
    }

    pub(crate) async fn add_authenticated(
        &self,
        provider: AuthenticationProvider,
        target: AuthenticationTarget<'_>,
        call_cancelled: impl Future<Output = ()>,
    ) -> Result<ProviderAccountRoster, AccountsError> {
        let _guard = self.mutation_gate.lock().await;
        self.authentication
            .add(self, provider, target, call_cancelled)
            .await
    }

    pub(crate) async fn reauthenticate(
        &self,
        provider: AuthenticationProvider,
        account_id: &str,
        call_cancelled: impl Future<Output = ()>,
    ) -> Result<ProviderAccountRoster, AccountsError> {
        let _guard = self.mutation_gate.lock().await;
        self.authentication
            .reauthenticate(self, provider, account_id, call_cancelled)
            .await
    }

    pub(crate) fn cancel_pending_claude_login(&self) -> bool {
        self.authentication.cancel_claude_login()
    }

    pub(crate) fn rate_limits(&self) -> RateLimitAuthority {
        self.rate_limits.clone()
    }

    pub(crate) fn codex_runtime(&self) -> CodexRuntimeHome {
        self.codex_runtime.clone()
    }

    pub(crate) fn settings_document(&self) -> Map<String, Value> {
        self.settings.account_document()
    }

    pub(crate) fn list_cached_claude(&self) -> Result<ClaudeAccountRoster, AccountsError> {
        claude_state(&self.settings.account_document())
    }

    pub(crate) fn list_cached_codex(&self) -> Result<CodexAccountRoster, AccountsError> {
        codex_state(&self.settings.account_document())
    }

    pub(crate) fn snapshot(&self) -> Result<AccountsSnapshot, AccountsError> {
        let settings = self.settings.account_document();
        Ok(AccountsSnapshot {
            claude: claude_state(&settings)?,
            codex: codex_state(&settings)?,
            rate_limits: rate_limit_state(&self.rate_limits.snapshot())?,
        })
    }

    pub(crate) async fn refresh(
        &self,
        cursor_context: Option<super::CursorRefreshContext<'_>>,
    ) -> Result<AccountsSnapshot, AccountsError> {
        let _guard = self.refresh_gate.lock().await;
        let (runtime, distro) = self.rate_limits.codex_target();
        let codex_home = self
            .codex_runtime
            .prepare_for_rate_limit(codex_target(&runtime, distro.as_deref()))
            .await
            .map_err(|error| {
                eprintln!("[codex-runtime-home] rate-limit home preparation failed: {error}");
                AccountsError::InvalidState
            })?;
        self.rate_limits
            .refresh_all(
                &self.settings.account_document(),
                codex_home,
                cursor_context,
            )
            .await?;
        self.publish()?;
        self.snapshot()
    }

    pub(crate) async fn list(&self) -> Result<AccountsSnapshot, AccountsError> {
        let authority = self.clone();
        let mut refresh = tokio::spawn(async move { authority.refresh_mobile().await });
        match tokio::time::timeout(LIST_REFRESH_BUDGET, &mut refresh).await {
            Ok(result) => result.map_err(|_| AccountsError::InvalidState)??,
            Err(_) => return self.snapshot(),
        }
        self.snapshot()
    }

    async fn refresh_mobile(&self) -> Result<(), AccountsError> {
        let _guard = self.refresh_gate.lock().await;
        self.refresh_mobile_locked().await
    }

    async fn refresh_mobile_locked(&self) -> Result<(), AccountsError> {
        let settings = self.settings.account_document();
        let (runtime, distro) = self.rate_limits.codex_target();
        let codex_home = self
            .codex_runtime
            .prepare_for_rate_limit(codex_target(&runtime, distro.as_deref()))
            .await
            .map_err(|error| {
                eprintln!("[codex-runtime-home] rate-limit home preparation failed: {error}");
                AccountsError::InvalidState
            })?;
        let (active, claude, codex) = tokio::join!(
            self.rate_limits.refresh_all(&settings, codex_home, None),
            self.rate_limits.refresh_inactive("claude", &settings),
            self.rate_limits.refresh_inactive("codex", &settings),
        );
        active?;
        claude?;
        codex?;
        self.publish()?;
        Ok(())
    }

    pub(crate) async fn refresh_for_subscriber(&self) -> Result<(), AccountsError> {
        if !self.rate_limits_are_stale() {
            return Ok(());
        }
        let _guard = self.refresh_gate.lock().await;
        if !self.rate_limits_are_stale() {
            return Ok(());
        }
        self.refresh_mobile_locked().await
    }

    pub(crate) async fn refresh_target(
        &self,
        provider: &str,
        runtime: &str,
        wsl_distro: Option<&str>,
    ) -> Result<RateLimitState, AccountsError> {
        let wsl_distro = wsl_distro.map(str::trim).filter(|value| !value.is_empty());
        let settings = self.settings.account_document();
        let target = Some((runtime, wsl_distro));
        let state = match provider {
            "claude" => self.rate_limits.refresh_claude(&settings, target).await?,
            "codex" => {
                let home = self
                    .codex_runtime
                    .prepare_for_rate_limit(codex_target(runtime, wsl_distro))
                    .await
                    .map_err(|error| {
                        eprintln!(
                            "[codex-runtime-home] rate-limit home preparation failed: {error}"
                        );
                        AccountsError::InvalidState
                    })?;
                self.rate_limits
                    .refresh_codex_home(&settings, home, target)
                    .await?
            }
            _ => return Err(AccountsError::Input("provider")),
        };
        self.publish()?;
        rate_limit_state(&state)
    }

    pub(crate) async fn refresh_grok(&self) -> Result<RateLimitState, AccountsError> {
        let state = self
            .rate_limits
            .refresh_grok(&self.settings.account_document())
            .await?;
        self.publish()?;
        rate_limit_state(&state)
    }

    pub(crate) async fn refresh_inactive(&self, provider: &str) -> Result<(), AccountsError> {
        self.rate_limits
            .refresh_inactive(provider, &self.settings.account_document())
            .await?;
        self.publish()?;
        Ok(())
    }

    pub(crate) async fn select(
        &self,
        provider: &str,
        account_id: Option<&str>,
        runtime: Option<&str>,
        wsl_distro: Option<&str>,
    ) -> Result<ProviderAccountRoster, AccountsError> {
        let _guard = self.mutation_gate.lock().await;
        let document = self.settings.account_document();
        let account = account_id
            .map(|id| find_account(&document, provider, id))
            .transpose()?;
        let account_runtime = account.and_then(|account| provider_runtime(account, provider));
        let target_runtime = runtime.or(account_runtime).unwrap_or("host");
        if !matches!(target_runtime, "host" | "wsl") {
            return Err(AccountsError::Input("runtime"));
        }
        let effective_distro = wsl_distro
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .or_else(|| {
                account.and_then(|account| account.get("wslDistro").and_then(Value::as_str))
            });
        if let Some(account) = account {
            let account_runtime = provider_runtime(account, provider).unwrap_or("host");
            let account_distro = account.get("wslDistro").and_then(Value::as_str);
            if account_runtime != target_runtime
                || target_runtime == "wsl"
                    && effective_distro.is_some()
                    && effective_distro != account_distro
            {
                return Err(AccountsError::RuntimeMismatch);
            }
        }
        let updates = selection_update(
            &document,
            provider,
            account_id,
            target_runtime,
            effective_distro,
        )?;
        if provider == "codex" {
            self.codex_runtime
                .preserve_before_change(codex_target(target_runtime, effective_distro))
                .await;
        }
        self.settings.update_account_document(updates).await?;
        if provider == "codex" {
            self.codex_runtime
                .sync_after_change(codex_target(target_runtime, effective_distro), None)
                .await;
        }
        let settings = self.settings.account_document();
        let target = Some((target_runtime, effective_distro));
        match provider {
            "claude" => {
                self.rate_limits.refresh_claude(&settings, target).await?;
            }
            "codex" => {
                let home = self
                    .codex_runtime
                    .prepare_for_rate_limit(codex_target(target_runtime, effective_distro))
                    .await
                    .map_err(|error| {
                        eprintln!(
                            "[codex-runtime-home] rate-limit home preparation failed: {error}"
                        );
                        AccountsError::InvalidState
                    })?;
                self.rate_limits
                    .refresh_codex_home(&settings, home, target)
                    .await?;
            }
            _ => return Err(AccountsError::Input("provider")),
        }
        self.publish()?;
        if provider == "claude" {
            self.list_cached_claude().map(ProviderAccountRoster::Claude)
        } else {
            self.list_cached_codex().map(ProviderAccountRoster::Codex)
        }
    }

    pub(crate) async fn remove(
        &self,
        provider: &str,
        account_id: &str,
    ) -> Result<ProviderAccountRoster, AccountsError> {
        let _guard = self.mutation_gate.lock().await;
        let document = self.settings.account_document();
        let account = find_account(&document, provider, account_id)?.clone();
        let runtime = provider_runtime(&account, provider).unwrap_or("host");
        let distro = account.get("wslDistro").and_then(Value::as_str);
        if provider == "codex" {
            self.codex_runtime
                .preserve_before_change(codex_target(runtime, distro))
                .await;
        }
        let account_key = if provider == "claude" {
            "claudeManagedAccounts"
        } else {
            "codexManagedAccounts"
        };
        let accounts = document
            .get(account_key)
            .and_then(Value::as_array)
            .ok_or(AccountsError::InvalidState)?;
        let next = accounts
            .iter()
            .filter(|entry| entry.get("id").and_then(Value::as_str) != Some(account_id))
            .cloned()
            .collect::<Vec<_>>();
        let mut updates = Map::from_iter([(account_key.to_owned(), Value::Array(next))]);
        clear_account_from_selection(&document, provider, account_id, &mut updates)?;
        self.settings.update_account_document(updates).await?;
        let removal = async {
            remove_managed_storage(&self.root, provider, &account, account_id).await?;
            if provider == "claude"
                && account
                    .get("managedAuthRuntime")
                    .and_then(Value::as_str)
                    .unwrap_or("host")
                    == "host"
            {
                delete_managed_claude_keychain(account_id).await?;
            }
            Ok::<(), AccountsError>(())
        }
        .await;
        if let Err(error) = removal {
            self.settings
                .update_account_document(account_restore_document(&document, provider))
                .await?;
            self.publish()?;
            return Err(error);
        }
        let settings = self.settings.account_document();
        if provider == "claude" {
            self.rate_limits
                .refresh_claude(&settings, Some((runtime, distro)))
                .await?;
        } else {
            self.codex_runtime
                .sync_after_change(codex_target(runtime, distro), None)
                .await;
            let home = self
                .codex_runtime
                .prepare_for_rate_limit(codex_target(runtime, distro))
                .await
                .map_err(|error| {
                    eprintln!("[codex-runtime-home] rate-limit home preparation failed: {error}");
                    AccountsError::InvalidState
                })?;
            self.rate_limits
                .refresh_codex_home(&settings, home, Some((runtime, distro)))
                .await?;
        }
        self.publish()?;
        if provider == "claude" {
            self.list_cached_claude().map(ProviderAccountRoster::Claude)
        } else {
            self.list_cached_codex().map(ProviderAccountRoster::Codex)
        }
    }

    pub(crate) fn subscribe(
        &self,
        connection_id: &str,
    ) -> Result<AccountsSubscription, AccountsError> {
        let id = self.events.next_id.fetch_add(1, Ordering::Relaxed) + 1;
        let subscription_id = format!("accounts-{connection_id}-{id}");
        let (sender, snapshots) = watch::channel(None);
        let (cancel, cancellation) = watch::channel(false);
        let mut subscribers = lock(&self.events.subscribers);
        let ready_snapshot = self.snapshot()?;
        subscribers.insert(
            id,
            AccountSubscriber {
                cancellation: cancel,
                sender,
                subscription_id: subscription_id.clone(),
            },
        );
        drop(subscribers);
        Ok(AccountsSubscription {
            cancellation,
            events: Arc::downgrade(&self.events),
            id,
            ready: Some((subscription_id, ready_snapshot)),
            snapshots,
        })
    }

    pub(crate) fn unsubscribe(&self, subscription_id: &str) -> bool {
        let mut subscribers = lock(&self.events.subscribers);
        let id = subscribers.iter().find_map(|(id, subscriber)| {
            (subscriber.subscription_id == subscription_id).then_some(*id)
        });
        let Some(id) = id else { return false };
        let Some(subscriber) = subscribers.remove(&id) else {
            return false;
        };
        let _ = subscriber.cancellation.send(true);
        true
    }

    pub(crate) fn grok_status(&self) -> Result<GrokAccountStatus, AccountsError> {
        GrokAccountStatus::from_json(&self.rate_limits.grok_status())
            .ok_or(AccountsError::InvalidState)
    }

    pub(super) fn publish(&self) -> Result<(), AccountsError> {
        let mut subscribers = lock(&self.events.subscribers);
        let snapshot = self.snapshot()?;
        subscribers.retain(|_, subscriber| subscriber.sender.send(Some(snapshot.clone())).is_ok());
        Ok(())
    }

    fn rate_limits_are_stale(&self) -> bool {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_or(0.0, |duration| duration.as_secs_f64() * 1_000.0);
        let Some(snapshot) = RateLimitState::from_json(&self.rate_limits.snapshot()) else {
            return true;
        };
        [
            AccountProvider::Claude,
            AccountProvider::Codex,
            AccountProvider::Cursor,
            AccountProvider::Kimi,
            AccountProvider::Grok,
        ]
        .into_iter()
        .any(|provider| {
            snapshot
                .provider_updated_at(provider)
                .is_none_or(|updated| {
                    !updated.is_finite()
                        || now < updated
                        || now - updated >= SUBSCRIBER_REFRESH_STALE_MS
                })
        })
    }
}

fn codex_target(runtime: &str, distro: Option<&str>) -> CodexRuntimeTarget {
    if runtime == "wsl" {
        return CodexRuntimeTarget::Wsl {
            distro: distro.unwrap_or_default().trim().to_owned(),
        };
    }
    CodexRuntimeTarget::Host
}

impl AccountsSubscription {
    pub(crate) async fn next(&mut self) -> Option<AccountsSubscriptionEvent> {
        if let Some((subscription_id, snapshot)) = self.ready.take() {
            return Some(AccountsSubscriptionEvent::Ready {
                subscription_id,
                snapshot,
            });
        }
        tokio::select! {
            changed = self.snapshots.changed() => match changed {
                Ok(()) => self.snapshots.borrow_and_update().clone().map(|snapshot| {
                    AccountsSubscriptionEvent::Snapshot { snapshot }
                }),
                Err(_) => Some(AccountsSubscriptionEvent::End),
            },
            changed = self.cancellation.changed() => {
                let _ = changed;
                Some(AccountsSubscriptionEvent::End)
            }
        }
    }
}

impl Drop for AccountsSubscription {
    fn drop(&mut self) {
        if let Some(events) = self.events.upgrade() {
            lock(&events.subscribers).remove(&self.id);
        }
    }
}

fn claude_state(document: &Map<String, Value>) -> Result<ClaudeAccountRoster, AccountsError> {
    let accounts = claude_account_summaries(document)?;
    let selection = normalized_selection(document, "claude", &accounts);
    Ok(ClaudeAccountRoster {
        active_account_id: selection.host.clone(),
        active_account_ids_by_runtime: selection,
        accounts,
    })
}

fn codex_state(document: &Map<String, Value>) -> Result<CodexAccountRoster, AccountsError> {
    let accounts = codex_account_summaries(document)?;
    let selection = normalized_selection(document, "codex", &accounts);
    let system_default = CodexSystemIdentity::from_json(&codex_system_identity())
        .ok_or(AccountsError::InvalidState)?;
    Ok(CodexAccountRoster {
        active_account_id: selection.host.clone(),
        active_account_ids_by_runtime: selection,
        accounts,
        system_default,
    })
}

fn claude_account_summaries(
    document: &Map<String, Value>,
) -> Result<Vec<ClaudeManagedAccount>, AccountsError> {
    let mut accounts = account_values(document, "claudeManagedAccounts")?
        .iter()
        .filter_map(claude_account_summary)
        .collect::<Vec<_>>();
    sort_accounts(&mut accounts);
    Ok(accounts)
}

fn codex_account_summaries(
    document: &Map<String, Value>,
) -> Result<Vec<CodexManagedAccount>, AccountsError> {
    let mut accounts = account_values(document, "codexManagedAccounts")?
        .iter()
        .filter_map(codex_account_summary)
        .collect::<Vec<_>>();
    sort_accounts(&mut accounts);
    Ok(accounts)
}

fn account_values<'a>(
    document: &'a Map<String, Value>,
    key: &str,
) -> Result<&'a [Value], AccountsError> {
    let Some(accounts) = document.get(key) else {
        return Ok(&[]);
    };
    accounts
        .as_array()
        .map(Vec::as_slice)
        .ok_or(AccountsError::InvalidState)
}

fn claude_account_summary(value: &Value) -> Option<ClaudeManagedAccount> {
    let object = value.as_object()?;
    let base = account_summary_fields(object)?;
    Some(ClaudeManagedAccount {
        id: base.id,
        email: base.email,
        managed_auth_runtime: managed_runtime(object, "managedAuthRuntime"),
        wsl_distro: optional_string(object, "wslDistro"),
        auth_method: match object.get("authMethod").and_then(Value::as_str) {
            Some("subscription-oauth") => ClaudeAuthMethod::SubscriptionOauth,
            _ => ClaudeAuthMethod::Unknown,
        },
        organization_uuid: optional_string(object, "organizationUuid"),
        organization_name: optional_string(object, "organizationName"),
        created_at: base.created_at,
        updated_at: base.updated_at,
        last_authenticated_at: base.last_authenticated_at,
    })
}

fn codex_account_summary(value: &Value) -> Option<CodexManagedAccount> {
    let object = value.as_object()?;
    let base = account_summary_fields(object)?;
    Some(CodexManagedAccount {
        id: base.id,
        email: base.email,
        managed_home_runtime: managed_runtime(object, "managedHomeRuntime"),
        wsl_distro: optional_string(object, "wslDistro"),
        provider_account_id: optional_string(object, "providerAccountId"),
        workspace_label: optional_string(object, "workspaceLabel"),
        workspace_account_id: optional_string(object, "workspaceAccountId"),
        created_at: base.created_at,
        updated_at: base.updated_at,
        last_authenticated_at: base.last_authenticated_at,
    })
}

struct AccountSummaryFields {
    id: String,
    email: String,
    created_at: f64,
    updated_at: f64,
    last_authenticated_at: f64,
}

fn account_summary_fields(object: &Map<String, Value>) -> Option<AccountSummaryFields> {
    let id = object.get("id")?.as_str()?.to_owned();
    let email = object.get("email")?.as_str()?.to_owned();
    if id.is_empty() || email.is_empty() {
        return None;
    }
    Some(AccountSummaryFields {
        id,
        email,
        created_at: required_finite(object, "createdAt")?,
        updated_at: required_finite(object, "updatedAt")?,
        last_authenticated_at: required_finite(object, "lastAuthenticatedAt")?,
    })
}

fn sort_accounts<T: ManagedAccountSummary>(accounts: &mut [T]) {
    accounts.sort_by(|left, right| right.updated_at().total_cmp(&left.updated_at()));
}

fn managed_runtime(object: &Map<String, Value>, field: &str) -> ManagedRuntime {
    match object.get(field).and_then(Value::as_str) {
        Some("wsl") => ManagedRuntime::Wsl,
        _ => ManagedRuntime::Host,
    }
}

fn optional_string(object: &Map<String, Value>, field: &str) -> Option<String> {
    object.get(field).and_then(Value::as_str).map(str::to_owned)
}

fn required_finite(object: &Map<String, Value>, field: &str) -> Option<f64> {
    object
        .get(field)
        .and_then(Value::as_f64)
        .filter(|value| value.is_finite())
}

fn normalized_selection<T: ManagedAccountSummary>(
    document: &Map<String, Value>,
    provider: &str,
    accounts: &[T],
) -> ManagedAccountSelection {
    let prefix = if provider == "claude" {
        "Claude"
    } else {
        "Codex"
    };
    let valid = |id: &str, runtime: &str, distro: Option<&str>| {
        accounts.iter().any(|account| {
            account.id() == id
                && account.runtime().name() == runtime
                && (runtime != "wsl" || account.wsl_distro() == distro)
        })
    };
    let host = document
        .get(&format!("active{prefix}ManagedAccountIdsByRuntime"))
        .and_then(|value| value.get("host"))
        .and_then(Value::as_str)
        .or_else(|| {
            document
                .get(&format!("active{prefix}ManagedAccountId"))
                .and_then(Value::as_str)
        })
        .filter(|id| valid(id, "host", None))
        .map(str::to_owned);
    let wsl = document
        .get(&format!("active{prefix}ManagedAccountIdsByRuntime"))
        .and_then(|value| value.get("wsl"))
        .and_then(Value::as_object)
        .map(|values| {
            values
                .iter()
                .map(|(distro, id)| {
                    let selected = id
                        .as_str()
                        .filter(|id| {
                            valid(
                                id,
                                "wsl",
                                (distro != "__default__").then_some(distro.as_str()),
                            )
                        })
                        .map(str::to_owned);
                    (distro.clone(), selected)
                })
                .collect()
        })
        .unwrap_or_default();
    ManagedAccountSelection { host, wsl }
}

pub(super) fn find_account<'a>(
    document: &'a Map<String, Value>,
    provider: &str,
    id: &str,
) -> Result<&'a Map<String, Value>, AccountsError> {
    let key = if provider == "claude" {
        "claudeManagedAccounts"
    } else if provider == "codex" {
        "codexManagedAccounts"
    } else {
        return Err(AccountsError::Input("provider"));
    };
    document
        .get(key)
        .and_then(Value::as_array)
        .and_then(|accounts| {
            accounts
                .iter()
                .find(|account| account.get("id").and_then(Value::as_str) == Some(id))
        })
        .and_then(Value::as_object)
        .ok_or(AccountsError::NotFound)
}

fn provider_runtime<'a>(account: &'a Map<String, Value>, provider: &str) -> Option<&'a str> {
    account
        .get(if provider == "claude" {
            "managedAuthRuntime"
        } else {
            "managedHomeRuntime"
        })
        .and_then(Value::as_str)
}

fn selection_update(
    document: &Map<String, Value>,
    provider: &str,
    account_id: Option<&str>,
    runtime: &str,
    distro: Option<&str>,
) -> Result<Map<String, Value>, AccountsError> {
    let prefix = if provider == "claude" {
        "Claude"
    } else if provider == "codex" {
        "Codex"
    } else {
        return Err(AccountsError::Input("provider"));
    };
    let selection_key = format!("active{prefix}ManagedAccountIdsByRuntime");
    let legacy_key = format!("active{prefix}ManagedAccountId");
    let mut selection = provider_selection(document, provider)?;
    let value = account_id.map(str::to_owned);
    if runtime == "host" {
        selection.host.clone_from(&value);
    } else {
        let distro = distro.map(str::trim).filter(|value| !value.is_empty());
        if account_id.is_none() && distro.is_none() {
            for selected in selection.wsl.values_mut() {
                *selected = None;
            }
        } else {
            selection
                .wsl
                .insert(distro.unwrap_or("__default__").to_owned(), value);
        }
    }
    let host = selection
        .host
        .clone()
        .map(Value::String)
        .unwrap_or(Value::Null);
    Ok(Map::from_iter([
        (legacy_key, host),
        (selection_key, typed_json(&selection)?),
    ]))
}

fn clear_account_from_selection(
    document: &Map<String, Value>,
    provider: &str,
    account_id: &str,
    updates: &mut Map<String, Value>,
) -> Result<(), AccountsError> {
    let prefix = if provider == "claude" {
        "Claude"
    } else {
        "Codex"
    };
    let mut selection = provider_selection(document, provider)?;
    if selection.host.as_deref() == Some(account_id) {
        selection.host = None;
    }
    for value in selection.wsl.values_mut() {
        if value.as_deref() == Some(account_id) {
            *value = None;
        }
    }
    updates.insert(
        format!("active{prefix}ManagedAccountId"),
        selection
            .host
            .clone()
            .map(Value::String)
            .unwrap_or(Value::Null),
    );
    updates.insert(
        format!("active{prefix}ManagedAccountIdsByRuntime"),
        typed_json(&selection)?,
    );
    Ok(())
}

fn provider_selection(
    document: &Map<String, Value>,
    provider: &str,
) -> Result<ManagedAccountSelection, AccountsError> {
    match provider {
        "claude" => {
            let accounts = claude_account_summaries(document)?;
            Ok(normalized_selection(document, provider, &accounts))
        }
        "codex" => {
            let accounts = codex_account_summaries(document)?;
            Ok(normalized_selection(document, provider, &accounts))
        }
        _ => Err(AccountsError::Input("provider")),
    }
}

fn rate_limit_state(value: &Value) -> Result<RateLimitState, AccountsError> {
    RateLimitState::from_json(value).ok_or(AccountsError::InvalidState)
}

fn typed_json(value: &impl serde::Serialize) -> Result<Value, AccountsError> {
    serde_json::to_value(value).map_err(|_| AccountsError::InvalidState)
}

fn account_restore_document(document: &Map<String, Value>, provider: &str) -> Map<String, Value> {
    let prefix = if provider == "claude" {
        "Claude"
    } else {
        "Codex"
    };
    let accounts_key = format!("{}ManagedAccounts", provider);
    [
        accounts_key,
        format!("active{prefix}ManagedAccountId"),
        format!("active{prefix}ManagedAccountIdsByRuntime"),
    ]
    .into_iter()
    .filter_map(|key| document.get(&key).cloned().map(|value| (key, value)))
    .collect()
}

pub(super) async fn remove_managed_storage(
    root: &std::path::Path,
    provider: &str,
    account: &Map<String, Value>,
    account_id: &str,
) -> Result<(), AccountsError> {
    if provider_runtime(account, provider) == Some("wsl") {
        return remove_wsl_managed_storage(provider, account, account_id).await;
    }
    let (base, path_key, leaf, marker) = if provider == "claude" {
        (
            root.join("claude-accounts"),
            "managedAuthPath",
            "auth",
            ".yiru-managed-claude-auth",
        )
    } else {
        (
            root.join("codex-accounts"),
            "managedHomePath",
            "home",
            ".yiru-managed-home",
        )
    };
    let Some(candidate) = account
        .get(path_key)
        .and_then(Value::as_str)
        .map(PathBuf::from)
    else {
        return Ok(());
    };
    let expected = base.join(account_id).join(leaf);
    let canonical_base = match tokio::fs::canonicalize(&base).await {
        Ok(path) => path,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error.into()),
    };
    let canonical = match tokio::fs::canonicalize(&candidate).await {
        Ok(path) => path,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error.into()),
    };
    let canonical_expected = tokio::fs::canonicalize(&expected).await?;
    if canonical != canonical_expected || !canonical.starts_with(&canonical_base) {
        return Err(AccountsError::InvalidState);
    }
    let marker_value = tokio::fs::read_to_string(canonical.join(marker)).await?;
    if marker_value.trim() != account_id {
        return Err(AccountsError::InvalidState);
    }
    tokio::fs::remove_dir_all(canonical.parent().ok_or(AccountsError::InvalidState)?).await?;
    Ok(())
}

#[cfg(target_os = "windows")]
async fn remove_wsl_managed_storage(
    provider: &str,
    account: &Map<String, Value>,
    account_id: &str,
) -> Result<(), AccountsError> {
    let distro = account
        .get("wslDistro")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .ok_or(AccountsError::InvalidState)?;
    let (folder, leaf, marker) = if provider == "claude" {
        ("claude-accounts", "auth", ".yiru-managed-claude-auth")
    } else {
        ("codex-accounts", "home", ".yiru-managed-home")
    };
    let script = format!(
        "set -eu; base=\"$HOME/.local/share/yiru/{folder}/$1\"; candidate=\"$base/{leaf}\"; marker=\"$candidate/{marker}\"; [ -f \"$marker\" ] || exit 42; [ \"$(cat \"$marker\")\" = \"$1\" ] || exit 43; rm -rf -- \"$base\""
    );
    let output = tokio::time::timeout(
        std::time::Duration::from_secs(5),
        tokio::process::Command::new("wsl.exe")
            .args([
                "-d",
                distro,
                "--",
                "sh",
                "-c",
                &script,
                "yiru-remove",
                account_id,
            ])
            .kill_on_drop(true)
            .output(),
    )
    .await
    .map_err(|_| std::io::Error::other("WSL managed account removal timed out"))??;
    if output.status.success() {
        Ok(())
    } else {
        Err(AccountsError::InvalidState)
    }
}

#[cfg(not(target_os = "windows"))]
async fn remove_wsl_managed_storage(
    _provider: &str,
    _account: &Map<String, Value>,
    _account_id: &str,
) -> Result<(), AccountsError> {
    Err(AccountsError::RuntimeMismatch)
}

#[cfg(target_os = "macos")]
pub(super) async fn delete_managed_claude_keychain(account_id: &str) -> Result<(), AccountsError> {
    let output = tokio::time::timeout(
        std::time::Duration::from_secs(3),
        tokio::process::Command::new("security")
            .args([
                "delete-generic-password",
                "-s",
                "Yiru Claude Code Managed Credentials",
                "-a",
                account_id,
            ])
            .kill_on_drop(true)
            .output(),
    )
    .await
    .map_err(|_| std::io::Error::other("macOS Keychain deletion timed out"))??;
    if output.status.success() || output.status.code() == Some(44) {
        Ok(())
    } else {
        Err(std::io::Error::other("macOS Keychain deletion failed").into())
    }
}

#[cfg(not(target_os = "macos"))]
pub(super) async fn delete_managed_claude_keychain(_account_id: &str) -> Result<(), AccountsError> {
    Ok(())
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

use std::collections::BTreeMap;

use serde::Serialize;
use serde_json::{Map, Value};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AccountsSnapshot {
    pub(crate) claude: ClaudeAccountRoster,
    pub(crate) codex: CodexAccountRoster,
    pub(crate) rate_limits: RateLimitState,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ClaudeAccountRoster {
    pub(crate) accounts: Vec<ClaudeManagedAccount>,
    pub(crate) active_account_id: Option<String>,
    pub(crate) active_account_ids_by_runtime: ManagedAccountSelection,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CodexAccountRoster {
    pub(crate) accounts: Vec<CodexManagedAccount>,
    pub(crate) active_account_id: Option<String>,
    pub(crate) active_account_ids_by_runtime: ManagedAccountSelection,
    pub(crate) system_default: CodexSystemIdentity,
}

#[derive(Clone, Debug, Serialize)]
#[serde(untagged)]
pub(crate) enum ProviderAccountRoster {
    Claude(ClaudeAccountRoster),
    Codex(CodexAccountRoster),
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ManagedAccountSelection {
    pub(crate) host: Option<String>,
    pub(crate) wsl: BTreeMap<String, Option<String>>,
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum ManagedRuntime {
    Host,
    Wsl,
}

impl ManagedRuntime {
    pub(crate) fn name(self) -> &'static str {
        match self {
            Self::Host => "host",
            Self::Wsl => "wsl",
        }
    }
}

#[derive(Clone, Copy, Debug, Serialize)]
pub(crate) enum ClaudeAuthMethod {
    #[serde(rename = "subscription-oauth")]
    SubscriptionOauth,
    #[serde(rename = "unknown")]
    Unknown,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ClaudeManagedAccount {
    pub(crate) id: String,
    pub(crate) email: String,
    pub(crate) managed_auth_runtime: ManagedRuntime,
    pub(crate) wsl_distro: Option<String>,
    pub(crate) auth_method: ClaudeAuthMethod,
    pub(crate) organization_uuid: Option<String>,
    pub(crate) organization_name: Option<String>,
    pub(crate) created_at: f64,
    pub(crate) updated_at: f64,
    pub(crate) last_authenticated_at: f64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CodexManagedAccount {
    pub(crate) id: String,
    pub(crate) email: String,
    pub(crate) managed_home_runtime: ManagedRuntime,
    pub(crate) wsl_distro: Option<String>,
    pub(crate) provider_account_id: Option<String>,
    pub(crate) workspace_label: Option<String>,
    pub(crate) workspace_account_id: Option<String>,
    pub(crate) created_at: f64,
    pub(crate) updated_at: f64,
    pub(crate) last_authenticated_at: f64,
}

pub(crate) trait ManagedAccountSummary {
    fn id(&self) -> &str;
    fn runtime(&self) -> ManagedRuntime;
    fn updated_at(&self) -> f64;
    fn wsl_distro(&self) -> Option<&str>;
}

impl ManagedAccountSummary for ClaudeManagedAccount {
    fn id(&self) -> &str {
        &self.id
    }

    fn runtime(&self) -> ManagedRuntime {
        self.managed_auth_runtime
    }

    fn updated_at(&self) -> f64 {
        self.updated_at
    }

    fn wsl_distro(&self) -> Option<&str> {
        self.wsl_distro.as_deref()
    }
}

impl ManagedAccountSummary for CodexManagedAccount {
    fn id(&self) -> &str {
        &self.id
    }

    fn runtime(&self) -> ManagedRuntime {
        self.managed_home_runtime
    }

    fn updated_at(&self) -> f64 {
        self.updated_at
    }

    fn wsl_distro(&self) -> Option<&str> {
        self.wsl_distro.as_deref()
    }
}

#[derive(Clone, Copy, Debug, Serialize)]
pub(crate) enum CodexAuthKind {
    #[serde(rename = "oauth")]
    Oauth,
    #[serde(rename = "api-key")]
    ApiKey,
    #[serde(rename = "none")]
    None,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CodexSystemIdentity {
    pub(crate) has_auth: bool,
    pub(crate) auth_kind: CodexAuthKind,
    pub(crate) email: Option<String>,
    pub(crate) provider_account_id: Option<String>,
    pub(crate) workspace_label: Option<String>,
}

impl CodexSystemIdentity {
    pub(crate) fn from_json(value: &Value) -> Option<Self> {
        let object = value.as_object()?;
        Some(Self {
            has_auth: required_bool(object, "hasAuth")?,
            auth_kind: match required_string(object, "authKind")? {
                "oauth" => CodexAuthKind::Oauth,
                "api-key" => CodexAuthKind::ApiKey,
                "none" => CodexAuthKind::None,
                _ => return None,
            },
            email: required_nullable_string(object, "email")?,
            provider_account_id: required_nullable_string(object, "providerAccountId")?,
            workspace_label: required_nullable_string(object, "workspaceLabel")?,
        })
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
pub(crate) enum AccountProvider {
    #[serde(rename = "claude")]
    Claude,
    #[serde(rename = "codex")]
    Codex,
    #[serde(rename = "cursor")]
    Cursor,
    #[serde(rename = "gemini")]
    Gemini,
    #[serde(rename = "opencode-go")]
    OpenCodeGo,
    #[serde(rename = "kimi")]
    Kimi,
    #[serde(rename = "antigravity")]
    Antigravity,
    #[serde(rename = "minimax")]
    Minimax,
    #[serde(rename = "grok")]
    Grok,
}

impl AccountProvider {
    fn from_name(value: &str) -> Option<Self> {
        match value {
            "claude" => Some(Self::Claude),
            "codex" => Some(Self::Codex),
            "cursor" => Some(Self::Cursor),
            "gemini" => Some(Self::Gemini),
            "opencode-go" => Some(Self::OpenCodeGo),
            "kimi" => Some(Self::Kimi),
            "antigravity" => Some(Self::Antigravity),
            "minimax" => Some(Self::Minimax),
            "grok" => Some(Self::Grok),
            _ => None,
        }
    }
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum AccountUsageStatus {
    Idle,
    Fetching,
    Ok,
    Error,
    Unavailable,
}

impl AccountUsageStatus {
    fn from_name(value: &str) -> Option<Self> {
        match value {
            "idle" => Some(Self::Idle),
            "fetching" => Some(Self::Fetching),
            "ok" => Some(Self::Ok),
            "error" => Some(Self::Error),
            "unavailable" => Some(Self::Unavailable),
            _ => None,
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RateLimitWindow {
    pub(crate) used_percent: f64,
    pub(crate) window_minutes: f64,
    pub(crate) resets_at: Option<f64>,
    pub(crate) reset_description: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RateLimitBucket {
    pub(crate) name: String,
    #[serde(flatten)]
    pub(crate) window: RateLimitWindow,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RateLimitResetCredit {
    pub(crate) status: String,
    pub(crate) expires_at: Option<f64>,
    pub(crate) granted_at: Option<f64>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RateLimitResetCredits {
    pub(crate) available_count: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) total_earned_count: Option<u64>,
    pub(crate) next_expires_at: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) credits: Option<Vec<RateLimitResetCredit>>,
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum UsageRateLimitSource {
    Oauth,
    Cli,
    Web,
}

impl UsageRateLimitSource {
    fn from_name(value: &str) -> Option<Self> {
        match value {
            "oauth" => Some(Self::Oauth),
            "cli" => Some(Self::Cli),
            "web" => Some(Self::Web),
            _ => None,
        }
    }
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum UsageRateLimitFailureKind {
    MissingCredentials,
    StaleToken,
    RefreshableCredentialsWithoutToken,
    DelegatedRefreshRequired,
    DeferredByLiveSession,
    KeychainUnavailable,
    MissingScope,
    Network,
    Server,
    Parse,
    RateLimited,
    CliUnavailable,
    UsageUnavailable,
    Unknown,
}

impl UsageRateLimitFailureKind {
    fn from_name(value: &str) -> Option<Self> {
        match value {
            "missing-credentials" => Some(Self::MissingCredentials),
            "stale-token" => Some(Self::StaleToken),
            "refreshable-credentials-without-token" => {
                Some(Self::RefreshableCredentialsWithoutToken)
            }
            "delegated-refresh-required" => Some(Self::DelegatedRefreshRequired),
            "deferred-by-live-session" => Some(Self::DeferredByLiveSession),
            "keychain-unavailable" => Some(Self::KeychainUnavailable),
            "missing-scope" => Some(Self::MissingScope),
            "network" => Some(Self::Network),
            "server" => Some(Self::Server),
            "parse" => Some(Self::Parse),
            "rate-limited" => Some(Self::RateLimited),
            "cli-unavailable" => Some(Self::CliUnavailable),
            "usage-unavailable" => Some(Self::UsageUnavailable),
            "unknown" => Some(Self::Unknown),
            _ => None,
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UsageRateLimitMetadata {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) source: Option<UsageRateLimitSource>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) attempted_sources: Option<Vec<UsageRateLimitSource>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) failure_kind: Option<UsageRateLimitFailureKind>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) credential_source: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) auth_provenance: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) deferred_by_live_claude_session: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) last_successful_source: Option<UsageRateLimitSource>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProviderRateLimits {
    pub(crate) provider: AccountProvider,
    pub(crate) session: Option<RateLimitWindow>,
    pub(crate) weekly: Option<RateLimitWindow>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) fable_weekly: Option<Option<RateLimitWindow>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) monthly: Option<Option<RateLimitWindow>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) buckets: Option<Vec<RateLimitBucket>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) rate_limit_reset_credits: Option<Option<RateLimitResetCredits>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) plan_type: Option<Option<String>>,
    pub(crate) updated_at: f64,
    pub(crate) error: Option<String>,
    pub(crate) status: AccountUsageStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) usage_metadata: Option<UsageRateLimitMetadata>,
}

impl ProviderRateLimits {
    fn from_json(value: &Value, expected_provider: AccountProvider) -> Option<Self> {
        let object = value.as_object()?;
        let provider = AccountProvider::from_name(required_string(object, "provider")?)?;
        if provider != expected_provider {
            return None;
        }
        let updated_at = required_finite(object, "updatedAt")?;
        if updated_at < 0.0 {
            return None;
        }
        Some(Self {
            provider,
            session: required_nullable_window(object, "session")?,
            weekly: required_nullable_window(object, "weekly")?,
            fable_weekly: optional_nullable_window(object, "fableWeekly")?,
            monthly: optional_nullable_window(object, "monthly")?,
            buckets: optional_buckets(object, "buckets")?,
            rate_limit_reset_credits: optional_reset_credits(object, "rateLimitResetCredits")?,
            plan_type: optional_nullable_string(object, "planType")?,
            updated_at,
            error: required_nullable_string(object, "error")?,
            status: AccountUsageStatus::from_name(required_string(object, "status")?)?,
            usage_metadata: optional_metadata(object, "usageMetadata")?,
        })
    }
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum RateLimitRuntime {
    Host,
    Wsl,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RateLimitTarget {
    pub(crate) runtime: RateLimitRuntime,
    pub(crate) wsl_distro: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct InactiveAccountUsage {
    pub(crate) account_id: String,
    pub(crate) rate_limits: Option<ProviderRateLimits>,
    pub(crate) updated_at: f64,
    pub(crate) is_fetching: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RateLimitState {
    pub(crate) claude: Option<ProviderRateLimits>,
    pub(crate) codex: Option<ProviderRateLimits>,
    pub(crate) cursor: Option<ProviderRateLimits>,
    pub(crate) gemini: Option<ProviderRateLimits>,
    pub(crate) open_code_go: Option<ProviderRateLimits>,
    pub(crate) kimi: Option<ProviderRateLimits>,
    pub(crate) antigravity: Option<ProviderRateLimits>,
    pub(crate) minimax: Option<ProviderRateLimits>,
    pub(crate) grok: Option<ProviderRateLimits>,
    pub(crate) minimax_cookie_configured: bool,
    pub(crate) grok_auth_configured: bool,
    pub(crate) claude_target: RateLimitTarget,
    pub(crate) codex_target: RateLimitTarget,
    pub(crate) inactive_claude_accounts: Vec<InactiveAccountUsage>,
    pub(crate) inactive_codex_accounts: Vec<InactiveAccountUsage>,
}

impl RateLimitState {
    pub(crate) fn from_json(value: &Value) -> Option<Self> {
        let object = value.as_object()?;
        Some(Self {
            claude: provider_member(object, "claude", AccountProvider::Claude)?,
            codex: provider_member(object, "codex", AccountProvider::Codex)?,
            cursor: provider_member(object, "cursor", AccountProvider::Cursor)?,
            gemini: provider_member(object, "gemini", AccountProvider::Gemini)?,
            open_code_go: provider_member(object, "opencodeGo", AccountProvider::OpenCodeGo)?,
            kimi: provider_member(object, "kimi", AccountProvider::Kimi)?,
            antigravity: provider_member(object, "antigravity", AccountProvider::Antigravity)?,
            minimax: provider_member(object, "minimax", AccountProvider::Minimax)?,
            grok: provider_member(object, "grok", AccountProvider::Grok)?,
            minimax_cookie_configured: required_bool(object, "minimaxCookieConfigured")?,
            grok_auth_configured: required_bool(object, "grokAuthConfigured")?,
            claude_target: rate_limit_target(object, "claudeTarget")?,
            codex_target: rate_limit_target(object, "codexTarget")?,
            inactive_claude_accounts: inactive_accounts(
                object,
                "inactiveClaudeAccounts",
                AccountProvider::Claude,
            )?,
            inactive_codex_accounts: inactive_accounts(
                object,
                "inactiveCodexAccounts",
                AccountProvider::Codex,
            )?,
        })
    }

    pub(crate) fn provider_updated_at(&self, provider: AccountProvider) -> Option<f64> {
        let limits = match provider {
            AccountProvider::Claude => self.claude.as_ref(),
            AccountProvider::Codex => self.codex.as_ref(),
            AccountProvider::Cursor => self.cursor.as_ref(),
            AccountProvider::Gemini => self.gemini.as_ref(),
            AccountProvider::OpenCodeGo => self.open_code_go.as_ref(),
            AccountProvider::Kimi => self.kimi.as_ref(),
            AccountProvider::Antigravity => self.antigravity.as_ref(),
            AccountProvider::Minimax => self.minimax.as_ref(),
            AccountProvider::Grok => self.grok.as_ref(),
        }?;
        Some(limits.updated_at)
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub(crate) enum AccountsSubscriptionEvent {
    Ready {
        subscription_id: String,
        snapshot: AccountsSnapshot,
    },
    Snapshot {
        snapshot: AccountsSnapshot,
    },
    End,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GrokAccountStatus {
    pub(crate) signed_in: bool,
    pub(crate) email: Option<String>,
    pub(crate) team_id: Option<String>,
    pub(crate) token_fresh: bool,
    pub(crate) error: Option<String>,
}

impl GrokAccountStatus {
    pub(crate) fn from_json(value: &Value) -> Option<Self> {
        let object = value.as_object()?;
        Some(Self {
            signed_in: required_bool(object, "signedIn")?,
            email: required_nullable_string(object, "email")?,
            team_id: required_nullable_string(object, "teamId")?,
            token_fresh: required_bool(object, "tokenFresh")?,
            error: required_nullable_string(object, "error")?,
        })
    }
}

fn provider_member(
    object: &Map<String, Value>,
    field: &str,
    provider: AccountProvider,
) -> Option<Option<ProviderRateLimits>> {
    match object.get(field)? {
        Value::Null => Some(None),
        value => ProviderRateLimits::from_json(value, provider).map(Some),
    }
}

fn rate_limit_target(object: &Map<String, Value>, field: &str) -> Option<RateLimitTarget> {
    let target = object.get(field)?.as_object()?;
    Some(RateLimitTarget {
        runtime: match required_string(target, "runtime")? {
            "host" => RateLimitRuntime::Host,
            "wsl" => RateLimitRuntime::Wsl,
            _ => return None,
        },
        wsl_distro: required_nullable_string(target, "wslDistro")?,
    })
}

fn inactive_accounts(
    object: &Map<String, Value>,
    field: &str,
    provider: AccountProvider,
) -> Option<Vec<InactiveAccountUsage>> {
    object
        .get(field)?
        .as_array()?
        .iter()
        .map(|value| {
            let account = value.as_object()?;
            let account_id = required_string(account, "accountId")?.to_owned();
            if account_id.trim().is_empty() {
                return None;
            }
            let rate_limits = match account.get("rateLimits")? {
                Value::Null => None,
                value => Some(ProviderRateLimits::from_json(value, provider)?),
            };
            let updated_at = required_finite(account, "updatedAt")?;
            if updated_at < 0.0 {
                return None;
            }
            Some(InactiveAccountUsage {
                account_id,
                rate_limits,
                updated_at,
                is_fetching: required_bool(account, "isFetching")?,
            })
        })
        .collect()
}

fn required_nullable_window(
    object: &Map<String, Value>,
    field: &str,
) -> Option<Option<RateLimitWindow>> {
    match object.get(field)? {
        Value::Null => Some(None),
        value => rate_limit_window(value).map(Some),
    }
}

fn optional_nullable_window(
    object: &Map<String, Value>,
    field: &str,
) -> Option<Option<Option<RateLimitWindow>>> {
    match object.get(field) {
        None => Some(None),
        Some(Value::Null) => Some(Some(None)),
        Some(value) => rate_limit_window(value).map(|window| Some(Some(window))),
    }
}

fn rate_limit_window(value: &Value) -> Option<RateLimitWindow> {
    let object = value.as_object()?;
    let used_percent = required_finite(object, "usedPercent")?;
    let window_minutes = required_finite(object, "windowMinutes")?;
    let resets_at = required_nullable_finite(object, "resetsAt")?;
    if !(0.0..=100.0).contains(&used_percent)
        || window_minutes <= 0.0
        || resets_at.is_some_and(|value| value < 0.0)
    {
        return None;
    }
    Some(RateLimitWindow {
        used_percent,
        window_minutes,
        resets_at,
        reset_description: required_nullable_string(object, "resetDescription")?,
    })
}

fn optional_buckets(
    object: &Map<String, Value>,
    field: &str,
) -> Option<Option<Vec<RateLimitBucket>>> {
    let Some(value) = object.get(field) else {
        return Some(None);
    };
    value
        .as_array()?
        .iter()
        .map(|value| {
            let bucket = value.as_object()?;
            let name = required_string(bucket, "name")?.to_owned();
            if name.trim().is_empty() {
                return None;
            }
            Some(RateLimitBucket {
                name,
                window: rate_limit_window(value)?,
            })
        })
        .collect::<Option<Vec<_>>>()
        .map(Some)
}

fn optional_reset_credits(
    object: &Map<String, Value>,
    field: &str,
) -> Option<Option<Option<RateLimitResetCredits>>> {
    let Some(value) = object.get(field) else {
        return Some(None);
    };
    if value.is_null() {
        return Some(Some(None));
    }
    let credits = value.as_object()?;
    let available_count = credits.get("availableCount")?.as_u64()?;
    let total_earned_count = match credits.get("totalEarnedCount") {
        None => None,
        Some(value) => Some(value.as_u64()?),
    };
    let next_expires_at = required_nullable_finite(credits, "nextExpiresAt")?;
    let entries = match credits.get("credits") {
        None => None,
        Some(value) => Some(
            value
                .as_array()?
                .iter()
                .map(|value| {
                    let credit = value.as_object()?;
                    Some(RateLimitResetCredit {
                        status: required_string(credit, "status")?.to_owned(),
                        expires_at: required_nullable_finite(credit, "expiresAt")?,
                        granted_at: required_nullable_finite(credit, "grantedAt")?,
                    })
                })
                .collect::<Option<Vec<_>>>()?,
        ),
    };
    Some(Some(Some(RateLimitResetCredits {
        available_count,
        total_earned_count,
        next_expires_at,
        credits: entries,
    })))
}

fn optional_metadata(
    object: &Map<String, Value>,
    field: &str,
) -> Option<Option<UsageRateLimitMetadata>> {
    let Some(value) = object.get(field) else {
        return Some(None);
    };
    let metadata = value.as_object()?;
    Some(Some(UsageRateLimitMetadata {
        source: optional_string(metadata, "source")?
            .map(UsageRateLimitSource::from_name)
            .transpose_option()?,
        attempted_sources: match metadata.get("attemptedSources") {
            None => None,
            Some(value) => Some(
                value
                    .as_array()?
                    .iter()
                    .map(|source| UsageRateLimitSource::from_name(source.as_str()?))
                    .collect::<Option<Vec<_>>>()?,
            ),
        },
        failure_kind: optional_string(metadata, "failureKind")?
            .map(UsageRateLimitFailureKind::from_name)
            .transpose_option()?,
        credential_source: optional_string(metadata, "credentialSource")?.map(str::to_owned),
        auth_provenance: optional_string(metadata, "authProvenance")?.map(str::to_owned),
        deferred_by_live_claude_session: optional_bool(metadata, "deferredByLiveClaudeSession")?,
        last_successful_source: optional_string(metadata, "lastSuccessfulSource")?
            .map(UsageRateLimitSource::from_name)
            .transpose_option()?,
    }))
}

trait TransposeOption<T> {
    fn transpose_option(self) -> Option<Option<T>>;
}

impl<T> TransposeOption<T> for Option<Option<T>> {
    fn transpose_option(self) -> Option<Option<T>> {
        match self {
            Some(Some(value)) => Some(Some(value)),
            Some(None) => None,
            None => Some(None),
        }
    }
}

fn optional_nullable_string(
    object: &Map<String, Value>,
    field: &str,
) -> Option<Option<Option<String>>> {
    match object.get(field) {
        None => Some(None),
        Some(Value::Null) => Some(Some(None)),
        Some(Value::String(value)) => Some(Some(Some(value.clone()))),
        Some(_) => None,
    }
}

fn required_nullable_string(object: &Map<String, Value>, field: &str) -> Option<Option<String>> {
    match object.get(field)? {
        Value::Null => Some(None),
        Value::String(value) => Some(Some(value.clone())),
        _ => None,
    }
}

fn optional_string<'a>(object: &'a Map<String, Value>, field: &str) -> Option<Option<&'a str>> {
    match object.get(field) {
        None => Some(None),
        Some(Value::String(value)) => Some(Some(value)),
        Some(_) => None,
    }
}

fn optional_bool(object: &Map<String, Value>, field: &str) -> Option<Option<bool>> {
    match object.get(field) {
        None => Some(None),
        Some(Value::Bool(value)) => Some(Some(*value)),
        Some(_) => None,
    }
}

fn required_string<'a>(object: &'a Map<String, Value>, field: &str) -> Option<&'a str> {
    object.get(field)?.as_str()
}

fn required_bool(object: &Map<String, Value>, field: &str) -> Option<bool> {
    object.get(field)?.as_bool()
}

fn required_finite(object: &Map<String, Value>, field: &str) -> Option<f64> {
    object
        .get(field)?
        .as_f64()
        .filter(|value| value.is_finite())
}

fn required_nullable_finite(object: &Map<String, Value>, field: &str) -> Option<Option<f64>> {
    match object.get(field)? {
        Value::Null => Some(None),
        Value::Number(value) => value.as_f64().filter(|value| value.is_finite()).map(Some),
        _ => None,
    }
}

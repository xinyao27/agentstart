use agentstart_protocol::protocol::v1::{Status, StatusCode};
use agentstart_protocol::runtime::v1::accounts_service_subscribe_response::Event;
use agentstart_protocol::runtime::v1::{
    AccountProvider as ProtocolAccountProvider, AccountRateLimitState, AccountRoster,
    AccountUsageStatus as ProtocolAccountUsageStatus, AccountsServiceAddRequest,
    AccountsServiceAddResponse, AccountsServiceCancelPendingLoginRequest,
    AccountsServiceCancelPendingLoginResponse, AccountsServiceClearMiniMaxCookieRequest,
    AccountsServiceClearMiniMaxCookieResponse, AccountsServiceConsumeCodexResetCreditRequest,
    AccountsServiceConsumeCodexResetCreditResponse, AccountsServiceGetGrokStatusRequest,
    AccountsServiceGetGrokStatusResponse, AccountsServiceGetMiniMaxCredentialsRequest,
    AccountsServiceGetMiniMaxCredentialsResponse, AccountsServiceListCachedClaudeRequest,
    AccountsServiceListCachedClaudeResponse, AccountsServiceListCachedCodexRequest,
    AccountsServiceListCachedCodexResponse, AccountsServiceListRequest,
    AccountsServiceListResponse, AccountsServiceReauthenticateRequest,
    AccountsServiceReauthenticateResponse, AccountsServiceRefreshGrokRateLimitsRequest,
    AccountsServiceRefreshGrokRateLimitsResponse, AccountsServiceRefreshInactiveAccountsRequest,
    AccountsServiceRefreshInactiveAccountsResponse,
    AccountsServiceRefreshRateLimitsForTargetRequest,
    AccountsServiceRefreshRateLimitsForTargetResponse, AccountsServiceRefreshRateLimitsRequest,
    AccountsServiceRefreshRateLimitsResponse, AccountsServiceRemoveRequest,
    AccountsServiceRemoveResponse, AccountsServiceSaveMiniMaxCookieRequest,
    AccountsServiceSaveMiniMaxCookieResponse, AccountsServiceSelectRequest,
    AccountsServiceSelectResponse, AccountsServiceSubscribeRequest,
    AccountsServiceSubscribeResponse, AccountsServiceUnsubscribeRequest,
    AccountsServiceUnsubscribeResponse, AccountsSnapshot as ProtocolAccountsSnapshot,
    AccountsSubscriptionEnd, AccountsSubscriptionReady, ClaudeManagedAuthMethod,
    CodexRateLimitResetOutcome, CodexRateLimitResetResult, CodexSystemAuthKind,
    CodexSystemIdentity as ProtocolCodexSystemIdentity, InactiveAccountUsage, ManagedAccount,
    ManagedAccountRuntime, ManagedAccountSelection, ManagedAccountWslSelection, ProviderRateLimits,
    RateLimitBucket as ProtocolRateLimitBucket,
    RateLimitResetCredit as ProtocolRateLimitResetCredit,
    RateLimitResetCredits as ProtocolRateLimitResetCredits,
    RateLimitRuntimeTarget as ProtocolRateLimitRuntimeTarget,
    RateLimitWindow as ProtocolRateLimitWindow,
    UsageRateLimitFailureKind as ProtocolUsageRateLimitFailureKind,
    UsageRateLimitMetadata as ProtocolUsageRateLimitMetadata,
    UsageRateLimitSource as ProtocolUsageRateLimitSource,
};
use agentstart_protocol::transport::{decode, encode};

use crate::account_usage::{
    AccountProvider, AccountUsageStatus, AccountsError, AccountsSnapshot,
    AccountsSubscriptionEvent, AuthenticationProvider, AuthenticationTarget, ClaudeAccountRoster,
    ClaudeAuthMethod, CodexAccountRoster, CodexAuthKind, CodexSystemIdentity, CursorRefreshContext,
    InactiveAccountUsage as DomainInactiveAccountUsage, ManagedAccountSelection as DomainSelection,
    ManagedRuntime, ProviderAccountRoster, ProviderRateLimits as DomainProviderRateLimits,
    RateLimitBucket, RateLimitResetCredit, RateLimitResetCredits, RateLimitRuntime, RateLimitState,
    RateLimitTarget, RateLimitWindow, UsageRateLimitFailureKind, UsageRateLimitMetadata,
    UsageRateLimitSource, clear_minimax_cookie, minimax_status, save_minimax_cookie,
};

use super::AccountsRpc;
use crate::rpc::protocol_call::ProtocolCallContext;

pub(in crate::rpc) async fn list(rpc: &AccountsRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let _ = decode::<AccountsServiceListRequest>(payload)?;
    let snapshot = rpc.authority.list().await.map_err(accounts_status)?;
    Ok(encode(&AccountsServiceListResponse {
        snapshot: Some(protocol_snapshot(&snapshot)),
    }))
}

pub(in crate::rpc) fn list_cached_claude(
    rpc: &AccountsRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let _ = decode::<AccountsServiceListCachedClaudeRequest>(payload)?;
    let roster = rpc
        .authority
        .list_cached_claude()
        .map_err(accounts_status)?;
    Ok(encode(&AccountsServiceListCachedClaudeResponse {
        roster: Some(protocol_claude_roster(&roster)),
    }))
}

pub(in crate::rpc) fn list_cached_codex(
    rpc: &AccountsRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let _ = decode::<AccountsServiceListCachedCodexRequest>(payload)?;
    let roster = rpc.authority.list_cached_codex().map_err(accounts_status)?;
    Ok(encode(&AccountsServiceListCachedCodexResponse {
        roster: Some(protocol_codex_roster(&roster)),
    }))
}

pub(in crate::rpc) async fn select(rpc: &AccountsRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<AccountsServiceSelectRequest>(payload)?;
    let provider = selectable_provider(request.provider)?;
    if request
        .account_id
        .as_ref()
        .is_some_and(|account_id| account_id.trim().is_empty())
    {
        return Err(status(
            StatusCode::InvalidArgument,
            "Account identifier must not be empty",
        ));
    }
    let runtime = optional_runtime(request.runtime)?;
    let distro = normalized_optional_distro(runtime, request.wsl_distro.as_deref())?;
    let roster = rpc
        .authority
        .select(
            provider.name(),
            request.account_id.as_deref(),
            runtime,
            distro,
        )
        .await
        .map_err(accounts_status)?;
    Ok(encode(&AccountsServiceSelectResponse {
        roster: Some(protocol_selected_roster(&roster, provider)?),
    }))
}

pub(in crate::rpc) async fn remove(rpc: &AccountsRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<AccountsServiceRemoveRequest>(payload)?;
    let provider = selectable_provider(request.provider)?;
    let account_id = required_account_id(&request.account_id)?;
    let roster = rpc
        .authority
        .remove(provider.name(), account_id)
        .await
        .map_err(accounts_status)?;
    Ok(encode(&AccountsServiceRemoveResponse {
        roster: Some(protocol_selected_roster(&roster, provider)?),
    }))
}

pub(in crate::rpc) fn unsubscribe(rpc: &AccountsRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<AccountsServiceUnsubscribeRequest>(payload)?;
    let subscription_id = required_subscription_id(&request.subscription_id)?;
    rpc.authority.unsubscribe(subscription_id);
    Ok(encode(&AccountsServiceUnsubscribeResponse {
        unsubscribed: true,
    }))
}

pub(in crate::rpc) async fn refresh_rate_limits(
    rpc: &AccountsRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<AccountsServiceRefreshRateLimitsRequest>(payload)?;
    if let Some(context) = request.cursor_context.as_ref()
        && context.execution_host_id.is_empty()
    {
        return Err(status(
            StatusCode::InvalidArgument,
            "Cursor execution host is invalid",
        ));
    }
    let cursor_context = request
        .cursor_context
        .as_ref()
        .map(|context| CursorRefreshContext {
            execution_host_id: &context.execution_host_id,
            workspace_id: context.workspace_id.as_deref(),
        });
    let snapshot = rpc
        .authority
        .refresh(cursor_context)
        .await
        .map_err(accounts_status)?;
    Ok(encode(&AccountsServiceRefreshRateLimitsResponse {
        rate_limits: Some(protocol_rate_limit_state(&snapshot.rate_limits)),
    }))
}

pub(in crate::rpc) async fn refresh_rate_limits_for_target(
    rpc: &AccountsRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<AccountsServiceRefreshRateLimitsForTargetRequest>(payload)?;
    let provider = selectable_provider(request.provider)?;
    let target = request
        .target
        .ok_or_else(|| status(StatusCode::InvalidArgument, "Rate-limit target is required"))?;
    let runtime = authentication_runtime(target.runtime)?;
    let distro = normalized_distro(runtime, target.wsl_distro.as_deref())?;
    let state = rpc
        .authority
        .refresh_target(provider.name(), runtime, distro)
        .await
        .map_err(accounts_status)?;
    Ok(encode(&AccountsServiceRefreshRateLimitsForTargetResponse {
        rate_limits: Some(protocol_rate_limit_state(&state)),
    }))
}

pub(in crate::rpc) async fn consume_codex_reset_credit(
    rpc: &AccountsRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let _ = decode::<AccountsServiceConsumeCodexResetCreditRequest>(payload)?;
    let value = rpc
        .authority
        .rate_limits()
        .consume_codex_reset_credit(&rpc.authority.settings_document())
        .await
        .map_err(|error| accounts_status(AccountsError::RateLimit(error)))?;
    let outcome = value
        .get("outcome")
        .and_then(serde_json::Value::as_str)
        .and_then(protocol_reset_outcome)
        .ok_or_else(|| data_loss("Codex reset response has an invalid outcome"))?;
    let state = value
        .get("state")
        .and_then(RateLimitState::from_json)
        .ok_or_else(|| data_loss("Codex reset response has an invalid rate-limit state"))?;
    Ok(encode(&AccountsServiceConsumeCodexResetCreditResponse {
        result: Some(CodexRateLimitResetResult {
            outcome: outcome as i32,
            rate_limits: Some(protocol_rate_limit_state(&state)),
        }),
    }))
}

pub(in crate::rpc) async fn refresh_inactive_accounts(
    rpc: &AccountsRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<AccountsServiceRefreshInactiveAccountsRequest>(payload)?;
    let provider = selectable_provider(request.provider)?;
    rpc.authority
        .refresh_inactive(provider.name())
        .await
        .map_err(accounts_status)?;
    Ok(encode(&AccountsServiceRefreshInactiveAccountsResponse {}))
}

pub(in crate::rpc) async fn refresh_grok_rate_limits(
    rpc: &AccountsRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let _ = decode::<AccountsServiceRefreshGrokRateLimitsRequest>(payload)?;
    let state = rpc
        .authority
        .refresh_grok()
        .await
        .map_err(accounts_status)?;
    Ok(encode(&AccountsServiceRefreshGrokRateLimitsResponse {
        rate_limits: Some(protocol_rate_limit_state(&state)),
    }))
}

pub(in crate::rpc) fn get_grok_status(
    rpc: &AccountsRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let _ = decode::<AccountsServiceGetGrokStatusRequest>(payload)?;
    let value = rpc.authority.grok_status().map_err(accounts_status)?;
    Ok(encode(&AccountsServiceGetGrokStatusResponse {
        status: Some(agentstart_protocol::runtime::v1::GrokAccountStatus {
            signed_in: value.signed_in,
            email: value.email,
            team_id: value.team_id,
            token_fresh: value.token_fresh,
            error: value.error,
        }),
    }))
}

pub(in crate::rpc) async fn add(
    rpc: &AccountsRpc,
    payload: &[u8],
    context: &ProtocolCallContext,
) -> Result<Vec<u8>, Status> {
    let request = decode::<AccountsServiceAddRequest>(payload)?;
    let provider = authentication_provider(request.provider)?;
    let runtime = authentication_runtime(request.runtime)?;
    let distro = normalized_distro(runtime, request.wsl_distro.as_deref())?;
    let roster = rpc
        .authority
        .add_authenticated(
            provider,
            AuthenticationTarget {
                runtime,
                wsl_distro: distro,
            },
            context.cancelled(),
        )
        .await
        .map_err(accounts_status)?;
    Ok(encode(&AccountsServiceAddResponse {
        roster: Some(protocol_roster(&roster, provider)?),
    }))
}

pub(in crate::rpc) async fn reauthenticate(
    rpc: &AccountsRpc,
    payload: &[u8],
    context: &ProtocolCallContext,
) -> Result<Vec<u8>, Status> {
    let request = decode::<AccountsServiceReauthenticateRequest>(payload)?;
    let provider = authentication_provider(request.provider)?;
    let account_id = required_account_id(&request.account_id)?;
    let roster = rpc
        .authority
        .reauthenticate(provider, account_id, context.cancelled())
        .await
        .map_err(accounts_status)?;
    Ok(encode(&AccountsServiceReauthenticateResponse {
        roster: Some(protocol_roster(&roster, provider)?),
    }))
}

pub(in crate::rpc) fn cancel_pending_login(
    rpc: &AccountsRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let _ = decode::<AccountsServiceCancelPendingLoginRequest>(payload)?;
    Ok(encode(&AccountsServiceCancelPendingLoginResponse {
        cancelled: rpc.authority.cancel_pending_claude_login(),
    }))
}

pub(in crate::rpc) fn get_minimax_credentials(payload: &[u8]) -> Result<Vec<u8>, Status> {
    let _ = decode::<AccountsServiceGetMiniMaxCredentialsRequest>(payload)?;
    Ok(encode(&AccountsServiceGetMiniMaxCredentialsResponse {
        configured: minimax_status().map_err(accounts_status)?,
    }))
}

pub(in crate::rpc) fn save_minimax_credentials(payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<AccountsServiceSaveMiniMaxCookieRequest>(payload)?;
    Ok(encode(&AccountsServiceSaveMiniMaxCookieResponse {
        configured: save_minimax_cookie(&request.cookie).map_err(accounts_status)?,
    }))
}

pub(in crate::rpc) fn clear_minimax_credentials(payload: &[u8]) -> Result<Vec<u8>, Status> {
    let _ = decode::<AccountsServiceClearMiniMaxCookieRequest>(payload)?;
    Ok(encode(&AccountsServiceClearMiniMaxCookieResponse {
        configured: clear_minimax_cookie().map_err(accounts_status)?,
    }))
}

pub(in crate::rpc) async fn subscribe(
    rpc: &AccountsRpc,
    payload: &[u8],
    connection_id: &str,
    context: &ProtocolCallContext,
) -> Result<(), Status> {
    let _ = decode::<AccountsServiceSubscribeRequest>(payload)?;
    let mut subscription = rpc
        .authority
        .subscribe(connection_id)
        .map_err(accounts_status)?;
    let authority = rpc.authority.clone();
    tokio::spawn(async move {
        let _ = authority.refresh_for_subscriber().await;
    });

    let first = subscription.next().await.ok_or_else(|| {
        status(
            StatusCode::DataLoss,
            "Accounts subscription closed before its ready snapshot",
        )
    })?;
    let AccountsSubscriptionEvent::Ready {
        subscription_id,
        snapshot,
    } = first
    else {
        return Err(data_loss(
            "Accounts subscription did not start with a ready snapshot",
        ));
    };
    context
        .send_stream_payload(encode(&AccountsServiceSubscribeResponse {
            event: Some(Event::Ready(AccountsSubscriptionReady {
                subscription_id,
                snapshot: Some(protocol_snapshot(&snapshot)),
            })),
        }))
        .await?;

    while let Some(event) = subscription.next().await {
        match event {
            AccountsSubscriptionEvent::Snapshot { snapshot } => {
                context
                    .send_stream_payload(encode(&AccountsServiceSubscribeResponse {
                        event: Some(Event::Snapshot(protocol_snapshot(&snapshot))),
                    }))
                    .await?;
            }
            AccountsSubscriptionEvent::End => {
                context
                    .send_stream_payload(encode(&AccountsServiceSubscribeResponse {
                        event: Some(Event::End(AccountsSubscriptionEnd {})),
                    }))
                    .await?;
                return Ok(());
            }
            AccountsSubscriptionEvent::Ready { .. } => {
                return Err(status(
                    StatusCode::DataLoss,
                    "Accounts subscription produced an invalid event",
                ));
            }
        }
    }
    Ok(())
}

#[derive(Clone, Copy)]
enum SelectableProvider {
    Claude,
    Codex,
}

impl SelectableProvider {
    fn name(self) -> &'static str {
        match self {
            Self::Claude => "claude",
            Self::Codex => "codex",
        }
    }
}

fn selectable_provider(provider: i32) -> Result<SelectableProvider, Status> {
    match ProtocolAccountProvider::try_from(provider) {
        Ok(ProtocolAccountProvider::Claude) => Ok(SelectableProvider::Claude),
        Ok(ProtocolAccountProvider::Codex) => Ok(SelectableProvider::Codex),
        Ok(
            ProtocolAccountProvider::Unspecified
            | ProtocolAccountProvider::Cursor
            | ProtocolAccountProvider::Gemini
            | ProtocolAccountProvider::OpenCodeGo
            | ProtocolAccountProvider::Kimi
            | ProtocolAccountProvider::Antigravity
            | ProtocolAccountProvider::Minimax
            | ProtocolAccountProvider::Grok,
        )
        | Err(_) => Err(status(
            StatusCode::InvalidArgument,
            "Account provider does not support selection",
        )),
    }
}

fn protocol_snapshot(snapshot: &AccountsSnapshot) -> ProtocolAccountsSnapshot {
    ProtocolAccountsSnapshot {
        claude: Some(protocol_claude_roster(&snapshot.claude)),
        codex: Some(protocol_codex_roster(&snapshot.codex)),
        rate_limits: Some(protocol_rate_limit_state(&snapshot.rate_limits)),
    }
}

fn protocol_selected_roster(
    roster: &ProviderAccountRoster,
    expected_provider: SelectableProvider,
) -> Result<AccountRoster, Status> {
    match (roster, expected_provider) {
        (ProviderAccountRoster::Claude(roster), SelectableProvider::Claude) => {
            Ok(protocol_claude_roster(roster))
        }
        (ProviderAccountRoster::Codex(roster), SelectableProvider::Codex) => {
            Ok(protocol_codex_roster(roster))
        }
        _ => Err(data_loss("Selected account roster has the wrong provider")),
    }
}

fn protocol_claude_roster(roster: &ClaudeAccountRoster) -> AccountRoster {
    AccountRoster {
        accounts: roster
            .accounts
            .iter()
            .map(|account| ManagedAccount {
                id: account.id.clone(),
                email: account.email.clone(),
                organization_name: account.organization_name.clone(),
                workspace_label: None,
                runtime: protocol_runtime(account.managed_auth_runtime) as i32,
                wsl_distro: account.wsl_distro.clone(),
                claude_auth_method: protocol_claude_auth(account.auth_method) as i32,
                organization_uuid: account.organization_uuid.clone(),
                provider_account_id: None,
                workspace_account_id: None,
                created_at_ms: account.created_at,
                updated_at_ms: account.updated_at,
                last_authenticated_at_ms: account.last_authenticated_at,
            })
            .collect(),
        active_account_id: roster.active_account_id.clone(),
        active_account_ids_by_runtime: Some(protocol_selection(
            &roster.active_account_ids_by_runtime,
        )),
        system_default: None,
    }
}

fn protocol_codex_roster(roster: &CodexAccountRoster) -> AccountRoster {
    AccountRoster {
        accounts: roster
            .accounts
            .iter()
            .map(|account| ManagedAccount {
                id: account.id.clone(),
                email: account.email.clone(),
                organization_name: None,
                workspace_label: account.workspace_label.clone(),
                runtime: protocol_runtime(account.managed_home_runtime) as i32,
                wsl_distro: account.wsl_distro.clone(),
                claude_auth_method: ClaudeManagedAuthMethod::Unspecified as i32,
                organization_uuid: None,
                provider_account_id: account.provider_account_id.clone(),
                workspace_account_id: account.workspace_account_id.clone(),
                created_at_ms: account.created_at,
                updated_at_ms: account.updated_at,
                last_authenticated_at_ms: account.last_authenticated_at,
            })
            .collect(),
        active_account_id: roster.active_account_id.clone(),
        active_account_ids_by_runtime: Some(protocol_selection(
            &roster.active_account_ids_by_runtime,
        )),
        system_default: Some(protocol_system_identity(&roster.system_default)),
    }
}

fn protocol_roster(
    roster: &ProviderAccountRoster,
    provider: AuthenticationProvider,
) -> Result<AccountRoster, Status> {
    match (roster, provider) {
        (ProviderAccountRoster::Claude(roster), AuthenticationProvider::Claude) => {
            Ok(protocol_claude_roster(roster))
        }
        (ProviderAccountRoster::Codex(roster), AuthenticationProvider::Codex) => {
            Ok(protocol_codex_roster(roster))
        }
        _ => Err(data_loss(
            "Authenticated account roster has the wrong provider",
        )),
    }
}

fn protocol_selection(selection: &DomainSelection) -> ManagedAccountSelection {
    ManagedAccountSelection {
        host: selection.host.clone(),
        wsl: selection
            .wsl
            .iter()
            .map(|(distro, account_id)| ManagedAccountWslSelection {
                distro: distro.clone(),
                account_id: account_id.clone(),
            })
            .collect(),
    }
}

fn protocol_runtime(runtime: ManagedRuntime) -> ManagedAccountRuntime {
    match runtime {
        ManagedRuntime::Host => ManagedAccountRuntime::Host,
        ManagedRuntime::Wsl => ManagedAccountRuntime::Wsl,
    }
}

fn protocol_claude_auth(method: ClaudeAuthMethod) -> ClaudeManagedAuthMethod {
    match method {
        ClaudeAuthMethod::SubscriptionOauth => ClaudeManagedAuthMethod::SubscriptionOauth,
        ClaudeAuthMethod::Unknown => ClaudeManagedAuthMethod::Unknown,
    }
}

fn protocol_system_identity(identity: &CodexSystemIdentity) -> ProtocolCodexSystemIdentity {
    ProtocolCodexSystemIdentity {
        has_auth: identity.has_auth,
        auth_kind: match identity.auth_kind {
            CodexAuthKind::Oauth => CodexSystemAuthKind::Oauth,
            CodexAuthKind::ApiKey => CodexSystemAuthKind::ApiKey,
            CodexAuthKind::None => CodexSystemAuthKind::None,
        } as i32,
        email: identity.email.clone(),
        provider_account_id: identity.provider_account_id.clone(),
        workspace_label: identity.workspace_label.clone(),
    }
}

fn authentication_provider(value: i32) -> Result<AuthenticationProvider, Status> {
    match ProtocolAccountProvider::try_from(value) {
        Ok(ProtocolAccountProvider::Claude) => Ok(AuthenticationProvider::Claude),
        Ok(ProtocolAccountProvider::Codex) => Ok(AuthenticationProvider::Codex),
        _ => Err(status(
            StatusCode::InvalidArgument,
            "Account provider does not support authentication",
        )),
    }
}

fn authentication_runtime(value: i32) -> Result<&'static str, Status> {
    match ManagedAccountRuntime::try_from(value) {
        Ok(ManagedAccountRuntime::Host) => Ok("host"),
        Ok(ManagedAccountRuntime::Wsl) => Ok("wsl"),
        _ => Err(status(
            StatusCode::InvalidArgument,
            "Managed account runtime is invalid",
        )),
    }
}

fn optional_runtime(value: i32) -> Result<Option<&'static str>, Status> {
    match ManagedAccountRuntime::try_from(value) {
        Ok(ManagedAccountRuntime::Unspecified) => Ok(None),
        Ok(ManagedAccountRuntime::Host) => Ok(Some("host")),
        Ok(ManagedAccountRuntime::Wsl) => Ok(Some("wsl")),
        Err(_) => Err(status(
            StatusCode::InvalidArgument,
            "Managed account runtime is invalid",
        )),
    }
}

fn normalized_optional_distro<'a>(
    runtime: Option<&str>,
    distro: Option<&'a str>,
) -> Result<Option<&'a str>, Status> {
    let distro = distro.map(str::trim).filter(|value| !value.is_empty());
    if runtime == Some("host") && distro.is_some()
        || distro.is_some_and(|value| value.len() > 128 || value.chars().any(char::is_control))
    {
        return Err(status(
            StatusCode::InvalidArgument,
            "WSL distribution is invalid",
        ));
    }
    Ok(distro)
}

fn normalized_distro<'a>(
    runtime: &str,
    distro: Option<&'a str>,
) -> Result<Option<&'a str>, Status> {
    let distro = distro.map(str::trim).filter(|value| !value.is_empty());
    if runtime == "host" && distro.is_some()
        || distro.is_some_and(|value| value.len() > 128 || value.chars().any(char::is_control))
    {
        return Err(status(
            StatusCode::InvalidArgument,
            "WSL distribution is invalid",
        ));
    }
    Ok(distro)
}

fn required_account_id(account_id: &str) -> Result<&str, Status> {
    let account_id = account_id.trim();
    if account_id.is_empty() || account_id.len() > 128 || account_id.chars().any(char::is_control) {
        return Err(status(
            StatusCode::InvalidArgument,
            "Account identifier is invalid",
        ));
    }
    Ok(account_id)
}

fn required_subscription_id(subscription_id: &str) -> Result<&str, Status> {
    required_short_value(subscription_id, "Accounts subscription identifier")
}

fn required_short_value<'a>(value: &'a str, field: &str) -> Result<&'a str, Status> {
    let value = value.trim();
    if value.is_empty() || value.len() > 256 || value.chars().any(char::is_control) {
        return Err(status(
            StatusCode::InvalidArgument,
            &format!("{field} is invalid"),
        ));
    }
    Ok(value)
}

fn protocol_rate_limit_state(state: &RateLimitState) -> AccountRateLimitState {
    AccountRateLimitState {
        claude: state.claude.as_ref().map(protocol_provider_rate_limits),
        codex: state.codex.as_ref().map(protocol_provider_rate_limits),
        cursor: state.cursor.as_ref().map(protocol_provider_rate_limits),
        gemini: state.gemini.as_ref().map(protocol_provider_rate_limits),
        open_code_go: state
            .open_code_go
            .as_ref()
            .map(protocol_provider_rate_limits),
        kimi: state.kimi.as_ref().map(protocol_provider_rate_limits),
        antigravity: state
            .antigravity
            .as_ref()
            .map(protocol_provider_rate_limits),
        minimax: state.minimax.as_ref().map(protocol_provider_rate_limits),
        grok: state.grok.as_ref().map(protocol_provider_rate_limits),
        inactive_claude_accounts: state
            .inactive_claude_accounts
            .iter()
            .map(protocol_inactive_account)
            .collect(),
        inactive_codex_accounts: state
            .inactive_codex_accounts
            .iter()
            .map(protocol_inactive_account)
            .collect(),
        minimax_cookie_configured: state.minimax_cookie_configured,
        grok_auth_configured: state.grok_auth_configured,
        claude_target: Some(protocol_rate_limit_target(&state.claude_target)),
        codex_target: Some(protocol_rate_limit_target(&state.codex_target)),
    }
}

fn protocol_provider_rate_limits(limits: &DomainProviderRateLimits) -> ProviderRateLimits {
    ProviderRateLimits {
        provider: protocol_provider(limits.provider) as i32,
        session: limits.session.as_ref().map(protocol_window),
        weekly: limits.weekly.as_ref().map(protocol_window),
        fable_weekly: limits
            .fable_weekly
            .as_ref()
            .and_then(Option::as_ref)
            .map(protocol_window),
        monthly: limits
            .monthly
            .as_ref()
            .and_then(Option::as_ref)
            .map(protocol_window),
        buckets: limits
            .buckets
            .as_deref()
            .unwrap_or_default()
            .iter()
            .map(protocol_bucket)
            .collect(),
        plan_type: limits.plan_type.clone().flatten(),
        updated_at_ms: limits.updated_at,
        error: limits.error.clone(),
        status: protocol_usage_status(limits.status) as i32,
        rate_limit_reset_credits: limits
            .rate_limit_reset_credits
            .as_ref()
            .and_then(Option::as_ref)
            .map(protocol_reset_credits),
        usage_metadata: limits.usage_metadata.as_ref().map(protocol_usage_metadata),
        has_fable_weekly: limits.fable_weekly.is_some(),
        has_monthly: limits.monthly.is_some(),
        has_buckets: limits.buckets.is_some(),
        has_rate_limit_reset_credits: limits.rate_limit_reset_credits.is_some(),
        has_plan_type: limits.plan_type.is_some(),
    }
}

fn protocol_rate_limit_target(target: &RateLimitTarget) -> ProtocolRateLimitRuntimeTarget {
    ProtocolRateLimitRuntimeTarget {
        runtime: match target.runtime {
            RateLimitRuntime::Host => ManagedAccountRuntime::Host,
            RateLimitRuntime::Wsl => ManagedAccountRuntime::Wsl,
        } as i32,
        wsl_distro: target.wsl_distro.clone(),
    }
}

fn protocol_reset_credits(credits: &RateLimitResetCredits) -> ProtocolRateLimitResetCredits {
    ProtocolRateLimitResetCredits {
        available_count: credits.available_count,
        total_earned_count: credits.total_earned_count,
        next_expires_at_ms: credits.next_expires_at,
        credits: credits
            .credits
            .as_deref()
            .unwrap_or_default()
            .iter()
            .map(protocol_reset_credit)
            .collect(),
        has_credits: credits.credits.is_some(),
    }
}

fn protocol_reset_credit(credit: &RateLimitResetCredit) -> ProtocolRateLimitResetCredit {
    ProtocolRateLimitResetCredit {
        status: credit.status.clone(),
        expires_at_ms: credit.expires_at,
        granted_at_ms: credit.granted_at,
    }
}

fn protocol_usage_metadata(metadata: &UsageRateLimitMetadata) -> ProtocolUsageRateLimitMetadata {
    ProtocolUsageRateLimitMetadata {
        source: metadata
            .source
            .map(protocol_usage_source)
            .unwrap_or_default() as i32,
        attempted_sources: metadata
            .attempted_sources
            .as_deref()
            .unwrap_or_default()
            .iter()
            .copied()
            .map(|source| protocol_usage_source(source) as i32)
            .collect(),
        failure_kind: metadata
            .failure_kind
            .map(protocol_usage_failure)
            .unwrap_or_default() as i32,
        credential_source: metadata.credential_source.clone(),
        auth_provenance: metadata.auth_provenance.clone(),
        deferred_by_live_claude_session: metadata.deferred_by_live_claude_session,
        last_successful_source: metadata
            .last_successful_source
            .map(protocol_usage_source)
            .unwrap_or_default() as i32,
        has_attempted_sources: metadata.attempted_sources.is_some(),
    }
}

fn protocol_usage_source(source: UsageRateLimitSource) -> ProtocolUsageRateLimitSource {
    match source {
        UsageRateLimitSource::Oauth => ProtocolUsageRateLimitSource::Oauth,
        UsageRateLimitSource::Cli => ProtocolUsageRateLimitSource::Cli,
        UsageRateLimitSource::Web => ProtocolUsageRateLimitSource::Web,
    }
}

fn protocol_usage_failure(failure: UsageRateLimitFailureKind) -> ProtocolUsageRateLimitFailureKind {
    match failure {
        UsageRateLimitFailureKind::MissingCredentials => {
            ProtocolUsageRateLimitFailureKind::MissingCredentials
        }
        UsageRateLimitFailureKind::StaleToken => ProtocolUsageRateLimitFailureKind::StaleToken,
        UsageRateLimitFailureKind::RefreshableCredentialsWithoutToken => {
            ProtocolUsageRateLimitFailureKind::RefreshableCredentialsWithoutToken
        }
        UsageRateLimitFailureKind::DelegatedRefreshRequired => {
            ProtocolUsageRateLimitFailureKind::DelegatedRefreshRequired
        }
        UsageRateLimitFailureKind::DeferredByLiveSession => {
            ProtocolUsageRateLimitFailureKind::DeferredByLiveSession
        }
        UsageRateLimitFailureKind::KeychainUnavailable => {
            ProtocolUsageRateLimitFailureKind::KeychainUnavailable
        }
        UsageRateLimitFailureKind::MissingScope => ProtocolUsageRateLimitFailureKind::MissingScope,
        UsageRateLimitFailureKind::Network => ProtocolUsageRateLimitFailureKind::Network,
        UsageRateLimitFailureKind::Server => ProtocolUsageRateLimitFailureKind::Server,
        UsageRateLimitFailureKind::Parse => ProtocolUsageRateLimitFailureKind::Parse,
        UsageRateLimitFailureKind::RateLimited => ProtocolUsageRateLimitFailureKind::RateLimited,
        UsageRateLimitFailureKind::CliUnavailable => {
            ProtocolUsageRateLimitFailureKind::CliUnavailable
        }
        UsageRateLimitFailureKind::UsageUnavailable => {
            ProtocolUsageRateLimitFailureKind::UsageUnavailable
        }
        UsageRateLimitFailureKind::Unknown => ProtocolUsageRateLimitFailureKind::Unknown,
    }
}

fn protocol_reset_outcome(value: &str) -> Option<CodexRateLimitResetOutcome> {
    match value {
        "reset" => Some(CodexRateLimitResetOutcome::Reset),
        "nothingToReset" => Some(CodexRateLimitResetOutcome::NothingToReset),
        "noCredit" => Some(CodexRateLimitResetOutcome::NoCredit),
        "alreadyRedeemed" => Some(CodexRateLimitResetOutcome::AlreadyRedeemed),
        _ => None,
    }
}

fn protocol_window(window: &RateLimitWindow) -> ProtocolRateLimitWindow {
    ProtocolRateLimitWindow {
        used_percent: window.used_percent,
        window_minutes: window.window_minutes,
        resets_at_ms: window.resets_at,
        reset_description: window.reset_description.clone(),
    }
}

fn protocol_bucket(bucket: &RateLimitBucket) -> ProtocolRateLimitBucket {
    ProtocolRateLimitBucket {
        name: bucket.name.clone(),
        window: Some(protocol_window(&bucket.window)),
    }
}

fn protocol_inactive_account(account: &DomainInactiveAccountUsage) -> InactiveAccountUsage {
    InactiveAccountUsage {
        account_id: account.account_id.clone(),
        rate_limits: account
            .rate_limits
            .as_ref()
            .map(protocol_provider_rate_limits),
        updated_at_ms: account.updated_at,
        is_fetching: account.is_fetching,
    }
}

fn protocol_provider(provider: AccountProvider) -> ProtocolAccountProvider {
    match provider {
        AccountProvider::Claude => ProtocolAccountProvider::Claude,
        AccountProvider::Codex => ProtocolAccountProvider::Codex,
        AccountProvider::Cursor => ProtocolAccountProvider::Cursor,
        AccountProvider::Gemini => ProtocolAccountProvider::Gemini,
        AccountProvider::OpenCodeGo => ProtocolAccountProvider::OpenCodeGo,
        AccountProvider::Kimi => ProtocolAccountProvider::Kimi,
        AccountProvider::Antigravity => ProtocolAccountProvider::Antigravity,
        AccountProvider::Minimax => ProtocolAccountProvider::Minimax,
        AccountProvider::Grok => ProtocolAccountProvider::Grok,
    }
}

fn protocol_usage_status(status: AccountUsageStatus) -> ProtocolAccountUsageStatus {
    match status {
        AccountUsageStatus::Idle => ProtocolAccountUsageStatus::Idle,
        AccountUsageStatus::Fetching => ProtocolAccountUsageStatus::Fetching,
        AccountUsageStatus::Ok => ProtocolAccountUsageStatus::Ok,
        AccountUsageStatus::Error => ProtocolAccountUsageStatus::Error,
        AccountUsageStatus::Unavailable => ProtocolAccountUsageStatus::Unavailable,
    }
}

fn accounts_status(error: AccountsError) -> Status {
    let code = match error {
        AccountsError::Input(_) | AccountsError::RuntimeMismatch => StatusCode::InvalidArgument,
        AccountsError::NotFound => StatusCode::NotFound,
        AccountsError::AlreadyExists => StatusCode::AlreadyExists,
        AccountsError::LoginBusy => StatusCode::FailedPrecondition,
        AccountsError::LoginCancelled => StatusCode::Cancelled,
        AccountsError::LoginTimedOut => StatusCode::DeadlineExceeded,
        AccountsError::LoginUnavailable => StatusCode::Unavailable,
        AccountsError::CustomProvider => StatusCode::FailedPrecondition,
        AccountsError::IdentityUnavailable | AccountsError::InvalidState => StatusCode::DataLoss,
        AccountsError::LoginFailed
        | AccountsError::RateLimit(_)
        | AccountsError::Settings(_)
        | AccountsError::SecureFile(_)
        | AccountsError::Io(_) => StatusCode::Internal,
    };
    let message = match code {
        StatusCode::Cancelled => "Account login was cancelled",
        StatusCode::DeadlineExceeded => "Account login timed out",
        StatusCode::AlreadyExists => "This account is already managed by AgentStart",
        StatusCode::FailedPrecondition => "Account login cannot start in the current configuration",
        StatusCode::Unavailable => "Account login command is unavailable",
        _ => "Accounts request could not be completed",
    };
    status(code, message)
}

fn data_loss(message: &str) -> Status {
    status(StatusCode::DataLoss, message)
}

fn status(code: StatusCode, message: &str) -> Status {
    Status {
        code: code as i32,
        message: message.to_owned(),
        details: Vec::new(),
    }
}

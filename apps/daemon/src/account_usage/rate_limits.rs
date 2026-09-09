use std::path::PathBuf;
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use base64::Engine as _;
use serde_json::{Map, Value, json};
use thiserror::Error;

use crate::host_registry::HostRegistry;

use proxy::network_client;

mod cursor;
mod gemini;
mod minimax;
mod opencode_go;
mod proxy;

const MAX_CREDENTIAL_BYTES: u64 = 2 * 1024 * 1024;
const CODEX_SESSION_MINUTES: u64 = 300;
const CODEX_WEEKLY_MINUTES: u64 = 10_080;

#[derive(Clone, Copy)]
pub(crate) struct CursorRefreshContext<'a> {
    pub(crate) execution_host_id: &'a str,
    pub(crate) workspace_id: Option<&'a str>,
}

#[derive(Clone)]
pub(crate) struct RateLimitAuthority {
    hosts: HostRegistry,
    root: PathBuf,
    state: Arc<Mutex<Value>>,
}

#[derive(Debug, Error)]
pub(crate) enum RateLimitError {
    #[error("rate-limit credentials could not be read")]
    CredentialRead,
    #[error("rate-limit request failed: {0}")]
    Request(#[from] reqwest::Error),
    #[error("rate-limit response is invalid")]
    InvalidResponse,
    #[error("rate-limit clock failed: {0}")]
    Clock(#[from] std::time::SystemTimeError),
    #[error("rate-limit identifier generation failed: {0}")]
    Random(#[from] getrandom::Error),
}

impl RateLimitAuthority {
    pub(crate) fn new(root: PathBuf, hosts: HostRegistry) -> Result<Self, RateLimitError> {
        Ok(Self {
            hosts,
            root,
            state: Arc::new(Mutex::new(default_state())),
        })
    }

    pub(crate) fn snapshot(&self) -> Value {
        lock(&self.state).clone()
    }

    pub(crate) async fn refresh_all(
        &self,
        settings: &Map<String, Value>,
        codex_home: Option<PathBuf>,
        cursor_context: Option<CursorRefreshContext<'_>>,
    ) -> Result<Value, RateLimitError> {
        let client = network_client(settings)?;
        let snapshot = self.snapshot();
        let claude_target = state_target(&snapshot, "claudeTarget");
        let gemini_enabled = settings
            .get("geminiCliOAuthEnabled")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        let open_code_cookie = settings
            .get("opencodeSessionCookie")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let open_code_workspace = settings.get("opencodeWorkspaceId").and_then(Value::as_str);
        let minimax_cookie = super::read_minimax_cookie();
        let minimax_cookie_configured = super::minimax_status().unwrap_or(false);
        let minimax_group = settings.get("minimaxGroupId").and_then(Value::as_str);
        let minimax_models = settings.get("minimaxUsageModels").and_then(Value::as_str);
        let minimax_fetch = async {
            match minimax_cookie.as_ref() {
                Ok(cookie) => {
                    minimax::fetch(&client, cookie.as_deref(), minimax_group, minimax_models).await
                }
                Err(_) => minimax::credential_error(),
            }
        };
        let (claude, codex, cursor, gemini, open_code_go, kimi, minimax, grok) = tokio::join!(
            self.fetch_claude(
                &client,
                settings,
                Some((claude_target.0.as_str(), claude_target.1.as_deref())),
            ),
            self.fetch_codex_home(&client, codex_home),
            cursor::fetch(&self.hosts, &self.root, cursor_context),
            gemini::fetch(&client, gemini_enabled),
            opencode_go::fetch(&client, open_code_cookie, open_code_workspace),
            self.fetch_kimi(&client),
            minimax_fetch,
            self.fetch_grok(&client)
        );
        let mut state = lock(&self.state);
        let object = state
            .as_object_mut()
            .ok_or(RateLimitError::InvalidResponse)?;
        object.insert("claude".to_owned(), claude);
        object.insert("codex".to_owned(), codex);
        object.insert("cursor".to_owned(), cursor);
        let mut antigravity = gemini.clone();
        if let Some(antigravity) = antigravity.as_object_mut() {
            antigravity.insert(
                "provider".to_owned(),
                Value::String("antigravity".to_owned()),
            );
        }
        object.insert("gemini".to_owned(), gemini);
        object.insert("antigravity".to_owned(), antigravity);
        object.insert("opencodeGo".to_owned(), open_code_go);
        object.insert("kimi".to_owned(), kimi);
        object.insert("minimax".to_owned(), minimax);
        object.insert("grok".to_owned(), grok);
        object.insert(
            "minimaxCookieConfigured".to_owned(),
            Value::Bool(minimax_cookie_configured),
        );
        object.insert(
            "grokAuthConfigured".to_owned(),
            Value::Bool(grok_auth_path().is_some_and(|path| path.exists())),
        );
        Ok(state.clone())
    }

    pub(crate) fn codex_target(&self) -> (String, Option<String>) {
        state_target(&self.snapshot(), "codexTarget")
    }

    pub(crate) async fn refresh_claude(
        &self,
        settings: &Map<String, Value>,
        target: Option<(&str, Option<&str>)>,
    ) -> Result<Value, RateLimitError> {
        let client = network_client(settings)?;
        let result = self.fetch_claude(&client, settings, target).await;
        lock(&self.state)
            .as_object_mut()
            .ok_or(RateLimitError::InvalidResponse)?
            .insert("claude".to_owned(), result);
        lock(&self.state)
            .as_object_mut()
            .ok_or(RateLimitError::InvalidResponse)?
            .insert("claudeTarget".to_owned(), rate_limit_target(target));
        Ok(self.snapshot())
    }

    pub(crate) async fn refresh_codex(
        &self,
        settings: &Map<String, Value>,
        target: Option<(&str, Option<&str>)>,
    ) -> Result<Value, RateLimitError> {
        let client = network_client(settings)?;
        let result = self.fetch_codex(&client, settings, target).await;
        lock(&self.state)
            .as_object_mut()
            .ok_or(RateLimitError::InvalidResponse)?
            .insert("codex".to_owned(), result);
        lock(&self.state)
            .as_object_mut()
            .ok_or(RateLimitError::InvalidResponse)?
            .insert("codexTarget".to_owned(), rate_limit_target(target));
        Ok(self.snapshot())
    }

    pub(crate) async fn refresh_codex_home(
        &self,
        settings: &Map<String, Value>,
        home: Option<PathBuf>,
        target: Option<(&str, Option<&str>)>,
    ) -> Result<Value, RateLimitError> {
        let client = network_client(settings)?;
        let result = self.fetch_codex_home(&client, home).await;
        let mut state = lock(&self.state);
        let object = state
            .as_object_mut()
            .ok_or(RateLimitError::InvalidResponse)?;
        object.insert("codex".to_owned(), result);
        object.insert("codexTarget".to_owned(), rate_limit_target(target));
        Ok(state.clone())
    }

    pub(crate) async fn refresh_grok(
        &self,
        settings: &Map<String, Value>,
    ) -> Result<Value, RateLimitError> {
        let client = network_client(settings)?;
        let result = self.fetch_grok(&client).await;
        let configured = grok_auth_path().is_some_and(|path| path.exists());
        let mut state = lock(&self.state);
        let object = state
            .as_object_mut()
            .ok_or(RateLimitError::InvalidResponse)?;
        object.insert("grok".to_owned(), result);
        object.insert("grokAuthConfigured".to_owned(), Value::Bool(configured));
        Ok(state.clone())
    }

    pub(crate) async fn refresh_inactive(
        &self,
        provider: &str,
        settings: &Map<String, Value>,
    ) -> Result<Value, RateLimitError> {
        let client = network_client(settings)?;
        let (accounts_key, state_key) = match provider {
            "claude" => ("claudeManagedAccounts", "inactiveClaudeAccounts"),
            "codex" => ("codexManagedAccounts", "inactiveCodexAccounts"),
            _ => return Err(RateLimitError::InvalidResponse),
        };
        let active = active_account_ids(settings, provider);
        let mut output = Vec::new();
        for account in settings
            .get(accounts_key)
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            let Some(object) = account.as_object() else {
                continue;
            };
            let Some(account_id) = object
                .get("id")
                .and_then(Value::as_str)
                .filter(|value| !value.is_empty())
            else {
                continue;
            };
            if active.iter().any(|active| active == account_id) {
                continue;
            }
            let rate_limits = if provider == "claude" {
                let credentials = self
                    .read_managed_claude_credentials(object)
                    .await
                    .map(|value| {
                        (
                            value,
                            "managed-credentials",
                            format!("managed:{account_id}:inactive-preview"),
                        )
                    });
                self.fetch_claude_credentials(&client, credentials).await
            } else {
                let home = self.owned_managed_path(object, "codex").await;
                self.fetch_codex_home(&client, home).await
            };
            output.push(json!({
                "accountId": account_id,
                "rateLimits": rate_limits,
                "updatedAt": now_ms_lossy(),
                "isFetching": false
            }));
        }
        lock(&self.state)
            .as_object_mut()
            .ok_or(RateLimitError::InvalidResponse)?
            .insert(state_key.to_owned(), Value::Array(output));
        Ok(self.snapshot())
    }

    pub(crate) async fn consume_codex_reset_credit(
        &self,
        settings: &Map<String, Value>,
    ) -> Result<Value, RateLimitError> {
        let client = network_client(settings)?;
        let home = match selected_account(settings, "codex", None) {
            Some(account) => self.owned_managed_path(account, "codex").await,
            None => system_codex_home(),
        }
        .ok_or(RateLimitError::CredentialRead)?;
        let auth = read_json_file(home.join("auth.json"))
            .await
            .ok_or(RateLimitError::CredentialRead)?;
        let tokens = auth
            .get("tokens")
            .and_then(Value::as_object)
            .ok_or(RateLimitError::CredentialRead)?;
        let token = tokens
            .get("access_token")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .ok_or(RateLimitError::CredentialRead)?;
        let mut request = client
            .post("https://chatgpt.com/backend-api/wham/rate-limit-reset-credits/consume")
            .bearer_auth(token)
            .header("User-Agent", "codex-cli")
            .header("OpenAI-Beta", "codex-1")
            .header("originator", "Codex Desktop")
            .json(&json!({ "redeem_request_id": random_uuid()? }));
        if let Some(account_id) = tokens.get("account_id").and_then(Value::as_str) {
            request = request.header("ChatGPT-Account-Id", account_id);
        }
        let response = request.send().await?;
        if !response.status().is_success() {
            return Err(RateLimitError::InvalidResponse);
        }
        let code = response
            .json::<Value>()
            .await?
            .get("code")
            .and_then(Value::as_str)
            .ok_or(RateLimitError::InvalidResponse)?
            .to_owned();
        let outcome = match code.as_str() {
            "reset" => "reset",
            "nothing_to_reset" => "nothingToReset",
            "no_credit" => "noCredit",
            "already_redeemed" => "alreadyRedeemed",
            _ => return Err(RateLimitError::InvalidResponse),
        };
        let state = self.refresh_codex(settings, None).await?;
        Ok(json!({ "outcome": outcome, "state": state }))
    }

    pub(crate) fn grok_status(&self) -> Value {
        let Some(path) = grok_auth_path() else {
            return grok_signed_out();
        };
        let document = match read_json_file_sync(&path) {
            Some(Value::Object(document)) => document,
            Some(_) => return grok_status_error("Grok auth file is invalid"),
            None if path.exists() => return grok_status_error("Unable to read Grok auth file"),
            None => return grok_signed_out(),
        };
        let session = preferred_grok_session(&document);
        let Some(session) = session else {
            return grok_signed_out();
        };
        let expires = session
            .get("expires_at")
            .and_then(Value::as_str)
            .and_then(parse_timestamp);
        let fresh = expires.is_none_or(|expires| expires - now_ms_lossy() > 5.0 * 60.0 * 1_000.0);
        json!({
            "signedIn": true,
            "email": session.get("email").and_then(Value::as_str),
            "teamId": session.get("team_id").and_then(Value::as_str),
            "tokenFresh": fresh,
            "error": null
        })
    }

    async fn fetch_codex(
        &self,
        client: &reqwest::Client,
        settings: &Map<String, Value>,
        target: Option<(&str, Option<&str>)>,
    ) -> Value {
        let home = match selected_account(settings, "codex", target) {
            Some(account) => self.owned_managed_path(account, "codex").await,
            None if target.is_none_or(|value| value.0 != "wsl") => system_codex_home(),
            None => None,
        };
        self.fetch_codex_home(client, home).await
    }

    async fn fetch_codex_home(&self, client: &reqwest::Client, home: Option<PathBuf>) -> Value {
        let Some(home) = home else {
            return unavailable_lossy(
                "codex",
                "Codex credentials not found",
                "missing-credentials",
                "oauth",
            );
        };
        let auth = match read_json_file(home.join("auth.json")).await {
            Some(auth) => auth,
            None => {
                return unavailable_lossy(
                    "codex",
                    "Codex credentials not found",
                    "missing-credentials",
                    "oauth",
                );
            }
        };
        let tokens = auth.get("tokens").and_then(Value::as_object);
        let Some(token) = tokens
            .and_then(|tokens| tokens.get("access_token"))
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
        else {
            return unavailable_lossy(
                "codex",
                "Codex OAuth access token not found",
                "missing-credentials",
                "oauth",
            );
        };
        let mut request = client
            .get("https://chatgpt.com/backend-api/wham/usage")
            .bearer_auth(token)
            .header("User-Agent", "codex-cli")
            .header("OpenAI-Beta", "codex-1")
            .header("originator", "Codex Desktop");
        if let Some(account_id) = tokens
            .and_then(|tokens| tokens.get("account_id"))
            .and_then(Value::as_str)
        {
            request = request.header("ChatGPT-Account-Id", account_id);
        }
        let response = match request.send().await {
            Ok(response) => response,
            Err(error) => return request_error("codex", error),
        };
        if !response.status().is_success() {
            return http_error("codex", response.status().as_u16());
        }
        let payload = match response.json::<Value>().await {
            Ok(payload) => payload,
            Err(_) => return parse_error("codex"),
        };
        let Some(plan_type) = payload.get("plan_type").and_then(Value::as_str) else {
            return parse_error("codex");
        };
        let limits = payload.get("rate_limit").and_then(Value::as_object);
        let (session, weekly) = classify_codex_windows(
            limits.and_then(|value| value.get("primary_window")),
            limits.and_then(|value| value.get("secondary_window")),
        );
        json!({
            "provider": "codex",
            "session": session,
            "weekly": weekly,
            "planType": plan_type,
            "rateLimitResetCredits": map_reset_credits(payload.get("rate_limit_reset_credits")),
            "updatedAt": now_ms_lossy(), "error": null, "status": "ok"
        })
    }

    async fn fetch_claude(
        &self,
        client: &reqwest::Client,
        settings: &Map<String, Value>,
        target: Option<(&str, Option<&str>)>,
    ) -> Value {
        let managed = selected_account(settings, "claude", target);
        let credentials = match managed {
            Some(account) => self
                .read_managed_claude_credentials(account)
                .await
                .map(|value| {
                    (
                        value,
                        "managed-credentials",
                        format!(
                            "managed:{}",
                            account
                                .get("id")
                                .and_then(Value::as_str)
                                .unwrap_or("unknown")
                        ),
                    )
                }),
            None if target.is_none_or(|value| value.0 != "wsl") => read_system_claude_credentials()
                .await
                .map(|(value, source)| (value, source, "system".to_owned())),
            None => None,
        };
        self.fetch_claude_credentials(client, credentials).await
    }

    async fn fetch_claude_credentials(
        &self,
        client: &reqwest::Client,
        credentials: Option<(Value, &'static str, String)>,
    ) -> Value {
        let (credentials, credential_source, provenance) =
            credentials.unwrap_or_else(|| (Value::Null, "none", "system".to_owned()));
        let token = credentials
            .get("claudeAiOauth")
            .and_then(Value::as_object)
            .and_then(|oauth| oauth.get("accessToken"))
            .and_then(Value::as_str)
            .map(str::to_owned);
        let Some(token) = token.filter(|value| !value.is_empty()) else {
            return unavailable_lossy(
                "claude",
                "Claude OAuth credentials not found",
                "missing-credentials",
                "oauth",
            );
        };
        let response = match client
            .get("https://api.anthropic.com/api/oauth/usage")
            .bearer_auth(token)
            .header("anthropic-beta", "oauth-2025-04-20")
            .header("User-Agent", "claude-code/2.1.0")
            .send()
            .await
        {
            Ok(response) => response,
            Err(error) => return request_error("claude", error),
        };
        if !response.status().is_success() {
            return http_error("claude", response.status().as_u16());
        }
        let payload = match response.json::<Value>().await {
            Ok(payload) => payload,
            Err(_) => return parse_error("claude"),
        };
        let fable = fable_window(&payload);
        json!({
            "provider": "claude",
            "session": oauth_window(payload.get("five_hour"), 300),
            "weekly": oauth_window(payload.get("seven_day"), 10_080),
            "fableWeekly": fable,
            "updatedAt": now_ms_lossy(), "error": null, "status": "ok",
            "usageMetadata": { "source": "oauth", "attemptedSources": ["oauth"], "credentialSource": credential_source, "authProvenance": provenance }
        })
    }

    async fn read_managed_claude_credentials(&self, account: &Map<String, Value>) -> Option<Value> {
        let id = account
            .get("id")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())?;
        let path = self.owned_managed_path(account, "claude").await?;
        #[cfg(target_os = "macos")]
        if managed_runtime(account, "claude") == "host" {
            if let Some(credentials) =
                read_macos_keychain("Yiru Claude Code Managed Credentials", id).await
            {
                return Some(credentials);
            }
            use sha2::{Digest as _, Sha256};
            let user = std::env::var("USER")
                .or_else(|_| std::env::var("USERNAME"))
                .unwrap_or_else(|_| "user".to_owned());
            let suffix = format!("{:x}", Sha256::digest(path.to_string_lossy().as_bytes()));
            let service = format!("Claude Code-credentials-{}", &suffix[..8]);
            if let Some(credentials) = read_macos_keychain(&service, &user).await {
                return Some(credentials);
            }
        }
        read_json_file(path.join(".credentials.json")).await
    }

    async fn owned_managed_path(
        &self,
        account: &Map<String, Value>,
        provider: &str,
    ) -> Option<PathBuf> {
        let id = account
            .get("id")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())?;
        let (path_key, folder, leaf, marker) = if provider == "claude" {
            (
                "managedAuthPath",
                "claude-accounts",
                "auth",
                ".yiru-managed-claude-auth",
            )
        } else if provider == "codex" {
            (
                "managedHomePath",
                "codex-accounts",
                "home",
                ".yiru-managed-home",
            )
        } else {
            return None;
        };
        let candidate = account
            .get(path_key)
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .map(PathBuf::from)?;
        if managed_runtime(account, provider) == "wsl" {
            return validate_wsl_managed_path(account, provider, id, candidate, marker).await;
        }
        let expected = self.root.join(folder).join(id).join(leaf);
        let metadata = tokio::fs::symlink_metadata(&candidate).await.ok()?;
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            return None;
        }
        let canonical_root = tokio::fs::canonicalize(self.root.join(folder)).await.ok()?;
        let canonical_expected = tokio::fs::canonicalize(expected).await.ok()?;
        let canonical_candidate = tokio::fs::canonicalize(candidate).await.ok()?;
        if canonical_candidate != canonical_expected
            || !canonical_candidate.starts_with(&canonical_root)
        {
            return None;
        }
        valid_marker(&canonical_candidate, marker, id)
            .await
            .then_some(canonical_candidate)
    }

    async fn fetch_kimi(&self, client: &reqwest::Client) -> Value {
        let Some(home) = std::env::var_os("KIMI_CODE_HOME")
            .map(PathBuf::from)
            .or_else(|| {
                crate::paths::resolve_local_home_path().map(|path| path.join(".kimi-code"))
            })
        else {
            return unavailable_lossy(
                "kimi",
                "Kimi credentials path is unavailable",
                "missing-credentials",
                "oauth",
            );
        };
        let credentials = read_json_file(home.join("credentials").join("kimi-code.json")).await;
        let Some(credentials) = credentials else {
            return unavailable_lossy(
                "kimi",
                "Not signed in to Kimi Code",
                "missing-credentials",
                "oauth",
            );
        };
        let Some(token) = credentials
            .get("access_token")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
        else {
            return parse_error("kimi");
        };
        let token_is_fresh = credentials
            .get("expires_at")
            .and_then(Value::as_f64)
            .filter(|value| value.is_finite())
            .is_some_and(|expires| expires - now_seconds_lossy() > 5.0);
        if !token_is_fresh {
            return error_result(
                "kimi",
                "Kimi session expired — run kimi on the computer running Yiru, then retry usage.",
                "delegated-refresh-required",
                "oauth",
            );
        }
        let base = std::env::var("KIMI_CODE_BASE_URL")
            .unwrap_or_else(|_| "https://api.kimi.com/coding/v1".to_owned());
        let response = match client
            .get(format!("{}/usages", base.trim_end_matches('/')))
            .bearer_auth(token)
            .header("User-Agent", "KimiCLI")
            .send()
            .await
        {
            Ok(response) => response,
            Err(error) => return request_error("kimi", error),
        };
        if !response.status().is_success() {
            return http_error("kimi", response.status().as_u16());
        }
        let payload = match response.json::<Value>().await {
            Ok(payload) => payload,
            Err(_) => return parse_error("kimi"),
        };
        let weekly = kimi_window(payload.get("usage"), CODEX_WEEKLY_MINUTES);
        let session = payload
            .get("limits")
            .and_then(Value::as_array)
            .and_then(|limits| {
                limits
                    .iter()
                    .filter_map(|limit| {
                        let minutes = kimi_minutes(limit.get("window"))?;
                        kimi_window(limit.get("detail"), minutes)
                            .map(|window| (minutes.abs_diff(CODEX_SESSION_MINUTES), window))
                    })
                    .min_by_key(|entry| entry.0)
                    .map(|entry| entry.1)
            });
        let status = if weekly.is_some() || session.is_some() {
            "ok"
        } else {
            "error"
        };
        json!({ "provider": "kimi", "session": session, "weekly": weekly, "updatedAt": now_ms_lossy(), "error": if status == "ok" { Value::Null } else { json!("Kimi usage response did not include quota windows") }, "status": status })
    }

    async fn fetch_grok(&self, client: &reqwest::Client) -> Value {
        let status = self.grok_status();
        if status.get("signedIn").and_then(Value::as_bool) != Some(true) {
            return unavailable_lossy(
                "grok",
                "Not signed in to Grok — run grok login",
                "missing-credentials",
                "oauth",
            );
        }
        if status.get("tokenFresh").and_then(Value::as_bool) != Some(true) {
            return unavailable_lossy(
                "grok",
                "Grok sign-in expired — run grok to refresh it",
                "delegated-refresh-required",
                "oauth",
            );
        }
        let path = match grok_auth_path() {
            Some(path) => path,
            None => return parse_error("grok"),
        };
        let document = read_json_file_sync(&path).and_then(|value| value.as_object().cloned());
        let Some(document) = document else {
            return parse_error("grok");
        };
        let Some(session) = preferred_grok_session(&document) else {
            return parse_error("grok");
        };
        let Some(token) = session.get("key").and_then(Value::as_str) else {
            return parse_error("grok");
        };
        let base = std::env::var("GROK_CLI_CHAT_PROXY_BASE_URL")
            .unwrap_or_else(|_| "https://cli-chat-proxy.grok.com/v1".to_owned());
        let mut request = client
            .get(format!(
                "{}/billing?format=credits",
                base.trim_end_matches('/')
            ))
            .bearer_auth(token)
            .header("X-XAI-Token-Auth", "xai-grok-cli")
            .header("Accept", "application/json");
        if let Some(user) = session.get("user_id").and_then(Value::as_str) {
            request = request.header("x-userid", user);
        }
        let response = match request.send().await {
            Ok(response) => response,
            Err(error) => return request_error("grok", error),
        };
        if !response.status().is_success() {
            return http_error("grok", response.status().as_u16());
        }
        let payload = match response.json::<Value>().await {
            Ok(payload) => payload,
            Err(_) => return parse_error("grok"),
        };
        let config = payload.get("config").unwrap_or(&payload);
        let weekly = grok_weekly(config);
        json!({ "provider": "grok", "session": null, "weekly": weekly, "planType": config.get("subscriptionTier").and_then(Value::as_str), "updatedAt": now_ms_lossy(), "error": if weekly.is_some() { Value::Null } else { json!("Grok billing response did not include credit usage") }, "status": if weekly.is_some() { "ok" } else { "unavailable" }, "usageMetadata": { "source": "oauth" } })
    }
}

fn default_state() -> Value {
    let minimax_cookie_configured = super::authentication::minimax_status().unwrap_or(false);
    json!({
        "claude": null, "codex": null, "cursor": null, "gemini": null,
        "opencodeGo": null, "kimi": null, "antigravity": null, "minimax": null,
        "grok": null, "minimaxCookieConfigured": minimax_cookie_configured, "grokAuthConfigured": false,
        "claudeTarget": { "runtime": "host", "wslDistro": null },
        "codexTarget": { "runtime": "host", "wslDistro": null },
        "inactiveClaudeAccounts": [], "inactiveCodexAccounts": []
    })
}

fn rate_limit_target(target: Option<(&str, Option<&str>)>) -> Value {
    let runtime = target.map_or("host", |value| value.0);
    json!({
        "runtime": runtime,
        "wslDistro": if runtime == "wsl" {
            target.and_then(|value| value.1).map(Value::from).unwrap_or(Value::Null)
        } else {
            Value::Null
        }
    })
}

fn state_target(state: &Value, key: &str) -> (String, Option<String>) {
    let target = state.get(key);
    let runtime = target
        .and_then(|target| target.get("runtime"))
        .and_then(Value::as_str)
        .filter(|runtime| matches!(*runtime, "host" | "wsl"))
        .unwrap_or("host")
        .to_owned();
    let distro = target
        .and_then(|target| target.get("wslDistro"))
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .map(str::to_owned);
    (runtime, distro)
}

fn selected_account<'a>(
    settings: &'a Map<String, Value>,
    provider: &str,
    target: Option<(&str, Option<&str>)>,
) -> Option<&'a Map<String, Value>> {
    let prefix = if provider == "claude" {
        "Claude"
    } else {
        "Codex"
    };
    let active = if target.is_some_and(|target| target.0 == "wsl") {
        let wsl = settings
            .get(&format!("active{prefix}ManagedAccountIdsByRuntime"))?
            .get("wsl")?
            .as_object()?;
        match target.and_then(|target| target.1) {
            Some(distro) => wsl.get(distro).and_then(Value::as_str),
            None => wsl.get("__default__").and_then(Value::as_str).or_else(|| {
                let selected = wsl.values().filter_map(Value::as_str).collect::<Vec<_>>();
                (selected.len() == 1).then(|| selected[0])
            }),
        }
    } else {
        settings
            .get(&format!("active{prefix}ManagedAccountId"))
            .and_then(Value::as_str)
    }?;
    settings
        .get(&format!("{}ManagedAccounts", provider))?
        .as_array()?
        .iter()
        .find_map(|account| {
            let object = account.as_object()?;
            (object.get("id").and_then(Value::as_str) == Some(active)).then_some(object)
        })
}

fn active_account_ids(settings: &Map<String, Value>, provider: &str) -> Vec<String> {
    let prefix = if provider == "claude" {
        "Claude"
    } else {
        "Codex"
    };
    let mut ids = Vec::new();
    if let Some(id) = settings
        .get(&format!("active{prefix}ManagedAccountId"))
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
    {
        ids.push(id.to_owned());
    }
    if let Some(selection) = settings
        .get(&format!("active{prefix}ManagedAccountIdsByRuntime"))
        .and_then(Value::as_object)
    {
        if let Some(id) = selection
            .get("host")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            && !ids.iter().any(|existing| existing == id)
        {
            ids.push(id.to_owned());
        }
        for id in selection
            .get("wsl")
            .and_then(Value::as_object)
            .into_iter()
            .flat_map(Map::values)
            .filter_map(Value::as_str)
            .filter(|value| !value.is_empty())
        {
            if !ids.iter().any(|existing| existing == id) {
                ids.push(id.to_owned());
            }
        }
    }
    ids
}

fn managed_runtime<'a>(account: &'a Map<String, Value>, provider: &str) -> &'a str {
    account
        .get(if provider == "claude" {
            "managedAuthRuntime"
        } else {
            "managedHomeRuntime"
        })
        .and_then(Value::as_str)
        .unwrap_or("host")
}

async fn valid_marker(path: &std::path::Path, marker: &str, account_id: &str) -> bool {
    let marker_path = path.join(marker);
    let Some(metadata) = tokio::fs::symlink_metadata(&marker_path).await.ok() else {
        return false;
    };
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return false;
    }
    tokio::fs::read_to_string(marker_path)
        .await
        .is_ok_and(|value| value.trim() == account_id)
}

#[cfg(target_os = "windows")]
async fn validate_wsl_managed_path(
    account: &Map<String, Value>,
    provider: &str,
    account_id: &str,
    candidate: PathBuf,
    marker: &str,
) -> Option<PathBuf> {
    let (linux_key, folder, leaf) = if provider == "claude" {
        ("wslLinuxAuthPath", "claude-accounts", "auth")
    } else {
        ("wslLinuxHomePath", "codex-accounts", "home")
    };
    let linux_path = account.get(linux_key).and_then(Value::as_str)?;
    let expected_suffix = format!("/.local/share/yiru/{folder}/{account_id}/{leaf}");
    if !linux_path.ends_with(&expected_suffix)
        || account
            .get("wslDistro")
            .and_then(Value::as_str)
            .is_none_or(|value| value.trim().is_empty())
    {
        return None;
    }
    let metadata = tokio::fs::symlink_metadata(&candidate).await.ok()?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return None;
    }
    let canonical = tokio::fs::canonicalize(candidate).await.ok()?;
    valid_marker(&canonical, marker, account_id)
        .await
        .then_some(canonical)
}

#[cfg(not(target_os = "windows"))]
async fn validate_wsl_managed_path(
    _account: &Map<String, Value>,
    _provider: &str,
    _account_id: &str,
    _candidate: PathBuf,
    _marker: &str,
) -> Option<PathBuf> {
    None
}

async fn read_system_claude_credentials() -> Option<(Value, &'static str)> {
    let config_dir = std::env::var_os("CLAUDE_CONFIG_DIR")
        .map(PathBuf::from)
        .or_else(|| crate::paths::resolve_local_home_path().map(|path| path.join(".claude")))?;
    #[cfg(target_os = "macos")]
    {
        use sha2::{Digest as _, Sha256};

        let user = std::env::var("USER")
            .or_else(|_| std::env::var("USERNAME"))
            .unwrap_or_else(|_| "user".to_owned());
        let suffix = format!(
            "{:x}",
            Sha256::digest(config_dir.to_string_lossy().as_bytes())
        );
        let scoped = format!("Claude Code-credentials-{}", &suffix[..8]);
        if let Some(value) = read_macos_keychain(&scoped, &user).await {
            return Some((value, "scoped-keychain"));
        }
        if let Some(value) = read_macos_keychain("Claude Code-credentials", &user).await {
            return Some((value, "legacy-keychain"));
        }
    }
    read_json_file(config_dir.join(".credentials.json"))
        .await
        .map(|value| (value, "credentials-file"))
}

async fn read_json_file(path: PathBuf) -> Option<Value> {
    if tokio::fs::metadata(&path).await.ok()?.len() > MAX_CREDENTIAL_BYTES {
        return None;
    }
    tokio::fs::read(path)
        .await
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
}

fn read_json_file_sync(path: &std::path::Path) -> Option<Value> {
    if std::fs::metadata(path).ok()?.len() > MAX_CREDENTIAL_BYTES {
        return None;
    }
    std::fs::read(path)
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
}

#[cfg(target_os = "macos")]
async fn read_macos_keychain(service: &str, account: &str) -> Option<Value> {
    let result = tokio::time::timeout(
        Duration::from_secs(3),
        tokio::process::Command::new("security")
            .args(["find-generic-password", "-s", service, "-a", account, "-w"])
            .kill_on_drop(true)
            .output(),
    )
    .await
    .ok()?
    .ok()?;
    if !result.status.success() {
        return None;
    }
    serde_json::from_slice(&result.stdout).ok()
}

fn system_codex_home() -> Option<PathBuf> {
    std::env::var_os("CODEX_HOME")
        .map(PathBuf::from)
        .or_else(|| crate::paths::resolve_local_home_path().map(|path| path.join(".codex")))
}
fn grok_auth_path() -> Option<PathBuf> {
    std::env::var_os("GROK_HOME")
        .map(PathBuf::from)
        .or_else(|| crate::paths::resolve_local_home_path().map(|path| path.join(".grok")))
        .map(|path| path.join("auth.json"))
}

fn codex_window(value: &Value, fallback: u64) -> Option<Value> {
    let object = value.as_object()?;
    let used = finite(object.get("used_percent"))?;
    let seconds = finite(object.get("limit_window_seconds"));
    let minutes = seconds
        .filter(|value| *value > 0.0)
        .map_or(fallback, |value| (value / 60.0).ceil() as u64);
    let resets = finite(object.get("reset_at"))
        .filter(|value| *value > 0.0)
        .map(|value| value * 1_000.0);
    Some(window(used, minutes, resets))
}
fn classify_codex_windows(primary: Option<&Value>, secondary: Option<&Value>) -> (Value, Value) {
    let primary = primary.and_then(|value| codex_window(value, CODEX_SESSION_MINUTES));
    let secondary = secondary.and_then(|value| codex_window(value, CODEX_WEEKLY_MINUTES));
    let mut session = None;
    let mut weekly = None;
    for candidate in [&primary, &secondary].into_iter().flatten() {
        match candidate.get("windowMinutes").and_then(Value::as_u64) {
            Some(minutes) if minutes.abs_diff(CODEX_SESSION_MINUTES) <= 1 => {
                session.get_or_insert_with(|| candidate.clone());
            }
            Some(minutes) if minutes.abs_diff(CODEX_WEEKLY_MINUTES) <= 1 => {
                weekly.get_or_insert_with(|| candidate.clone());
            }
            _ => {}
        }
    }
    if session.is_none()
        && primary.as_ref().is_some_and(|value| {
            !is_codex_known_window(value.get("windowMinutes").and_then(Value::as_u64))
        })
    {
        session.clone_from(&primary);
    }
    if weekly.is_none()
        && secondary.as_ref().is_some_and(|value| {
            !is_codex_known_window(value.get("windowMinutes").and_then(Value::as_u64))
        })
    {
        weekly.clone_from(&secondary);
    }
    (
        session.unwrap_or(Value::Null),
        weekly.unwrap_or(Value::Null),
    )
}
fn is_codex_known_window(minutes: Option<u64>) -> bool {
    minutes.is_some_and(|minutes| {
        minutes.abs_diff(CODEX_SESSION_MINUTES) <= 1 || minutes.abs_diff(CODEX_WEEKLY_MINUTES) <= 1
    })
}
fn oauth_window(value: Option<&Value>, minutes: u64) -> Option<Value> {
    let object = value?.as_object()?;
    let used =
        finite(object.get("utilization")).or_else(|| finite(object.get("used_percentage")))?;
    let resets = object.get("resets_at").and_then(reset_timestamp);
    Some(window(used, minutes, resets))
}
fn fable_window(payload: &Value) -> Option<Value> {
    payload
        .get("limits")
        .and_then(Value::as_array)
        .and_then(|values| {
            values.iter().find(|value| {
                value.get("kind").and_then(Value::as_str) == Some("weekly_scoped")
                    && value.get("is_active").and_then(Value::as_bool) != Some(false)
                    && value
                        .pointer("/scope/model/display_name")
                        .and_then(Value::as_str)
                        .is_some_and(|name| name.eq_ignore_ascii_case("fable"))
            })
        })
        .and_then(|value| {
            let used = finite(value.get("percent"))?;
            Some(window(
                used,
                CODEX_WEEKLY_MINUTES,
                value.get("resets_at").and_then(reset_timestamp),
            ))
        })
        .or_else(|| {
            ["fable_weekly", "fable_seven_day", "seven_day_fable"]
                .into_iter()
                .find_map(|key| oauth_window(payload.get(key), CODEX_WEEKLY_MINUTES))
        })
}
fn kimi_window(value: Option<&Value>, minutes: u64) -> Option<Value> {
    let object = value?.as_object()?;
    let limit = flexible_number(object.get("limit"))?;
    let used = flexible_number(object.get("used"))
        .or_else(|| Some(limit - flexible_number(object.get("remaining"))?))?;
    if limit <= 0.0 {
        return None;
    }
    let reset = object
        .get("resetTime")
        .or_else(|| object.get("resetAt"))
        .and_then(reset_timestamp);
    Some(window((used / limit) * 100.0, minutes, reset))
}
fn kimi_minutes(value: Option<&Value>) -> Option<u64> {
    let object = value?.as_object()?;
    let duration = flexible_number(object.get("duration"))?;
    let multiplier = match object
        .get("timeUnit")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_ascii_uppercase()
    {
        value if value.contains("SECOND") => 1.0 / 60.0,
        value if value.contains("HOUR") => 60.0,
        value if value.contains("DAY") => 1_440.0,
        _ => 1.0,
    };
    Some((duration * multiplier).round().max(1.0) as u64)
}
fn grok_weekly(value: &Value) -> Option<Value> {
    let object = value.as_object()?;
    let used = finite(object.get("creditUsagePercent"))?;
    let reset = object
        .get("currentPeriod")
        .and_then(|value| value.get("end"))
        .or_else(|| object.get("billingPeriodEnd"))
        .and_then(reset_timestamp);
    Some(window(used, CODEX_WEEKLY_MINUTES, reset))
}
fn window(used: f64, minutes: u64, resets: Option<f64>) -> Value {
    json!({ "usedPercent": used.clamp(0.0, 100.0), "windowMinutes": minutes, "resetsAt": resets, "resetDescription": resets.and_then(format_reset) })
}
fn format_reset(milliseconds: f64) -> Option<String> {
    chrono::DateTime::from_timestamp_millis(milliseconds as i64).map(|value| {
        value
            .with_timezone(&chrono::Local)
            .format("%a %H:%M")
            .to_string()
    })
}
fn reset_timestamp(value: &Value) -> Option<f64> {
    if let Some(number) = flexible_number(Some(value)) {
        return Some(if number > 10_000_000_000.0 {
            number
        } else {
            number * 1_000.0
        });
    }
    value.as_str().and_then(parse_timestamp)
}
fn parse_timestamp(value: &str) -> Option<f64> {
    chrono::DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|value| value.timestamp_millis() as f64)
}
fn finite(value: Option<&Value>) -> Option<f64> {
    value
        .and_then(Value::as_f64)
        .filter(|value| value.is_finite())
}
fn flexible_number(value: Option<&Value>) -> Option<f64> {
    let value = value?;
    finite(Some(value)).or_else(|| {
        value
            .as_str()
            .and_then(|value| value.parse::<f64>().ok())
            .filter(|value| value.is_finite())
    })
}

fn map_reset_credits(value: Option<&Value>) -> Value {
    let Some(object) = value.and_then(Value::as_object) else {
        return Value::Null;
    };
    let credits = object.get("credits").and_then(Value::as_array).map(|credits| {
        credits
            .iter()
            .map(|credit| {
                json!({
                    "status": credit.get("status").and_then(Value::as_str).unwrap_or("unknown").to_ascii_lowercase(),
                    "expiresAt": credit.get("expires_at").or_else(|| credit.get("expiresAt")).and_then(reset_timestamp),
                    "grantedAt": credit.get("granted_at").or_else(|| credit.get("grantedAt")).and_then(reset_timestamp)
                })
            })
            .collect::<Vec<_>>()
    });
    let available = flexible_number(
        object
            .get("available_count")
            .or_else(|| object.get("availableCount")),
    )
    .map(|value| value.floor().max(0.0) as u64)
    .or_else(|| {
        credits.as_ref().map(|credits| {
            credits
                .iter()
                .filter(|credit| credit.get("status").and_then(Value::as_str) == Some("available"))
                .count() as u64
        })
    });
    let Some(available) = available else {
        return Value::Null;
    };
    let total = flexible_number(
        object
            .get("total_earned_count")
            .or_else(|| object.get("totalEarnedCount")),
    )
    .map(|value| value.floor().max(0.0) as u64);
    let next = object
        .get("next_expires_at")
        .or_else(|| object.get("nextExpiresAt"))
        .and_then(reset_timestamp)
        .or_else(|| next_available_credit_expiry(credits.as_deref()));
    let mut mapped = Map::from_iter([
        ("availableCount".to_owned(), json!(available)),
        ("nextExpiresAt".to_owned(), json!(next)),
    ]);
    if let Some(total) = total {
        mapped.insert("totalEarnedCount".to_owned(), json!(total));
    }
    if let Some(credits) = credits {
        mapped.insert("credits".to_owned(), Value::Array(credits));
    }
    Value::Object(mapped)
}
fn next_available_credit_expiry(credits: Option<&[Value]>) -> Option<f64> {
    credits?
        .iter()
        .filter(|credit| credit.get("status").and_then(Value::as_str) == Some("available"))
        .filter_map(|credit| credit.get("expiresAt").and_then(Value::as_f64))
        .min_by(f64::total_cmp)
}
fn request_error(provider: &str, _error: reqwest::Error) -> Value {
    error_result(
        provider,
        &format!("{provider} usage request failed"),
        "network",
        "oauth",
    )
}
fn http_error(provider: &str, status: u16) -> Value {
    error_result(
        provider,
        &format!("{provider} usage request failed (HTTP {status})"),
        if status == 429 {
            "rate-limited"
        } else if status >= 500 {
            "server"
        } else {
            "stale-token"
        },
        "oauth",
    )
}
fn parse_error(provider: &str) -> Value {
    error_result(
        provider,
        &format!("{provider} usage response is invalid"),
        "parse",
        "oauth",
    )
}
fn error_result(provider: &str, message: &str, failure: &str, source: &str) -> Value {
    json!({ "provider": provider, "session": null, "weekly": null, "updatedAt": now_ms_lossy(), "error": message, "status": "error", "usageMetadata": { "failureKind": failure, "source": source } })
}
fn unavailable_lossy(provider: &str, message: &str, failure: &str, source: &str) -> Value {
    json!({ "provider": provider, "session": null, "weekly": null, "updatedAt": now_ms_lossy(), "error": message, "status": "unavailable", "usageMetadata": { "failureKind": failure, "source": source } })
}
fn now_ms_lossy() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0.0, |duration| duration.as_secs_f64() * 1_000.0)
}

fn now_seconds_lossy() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0.0, |duration| duration.as_secs_f64())
}

fn random_uuid() -> Result<String, getrandom::Error> {
    let mut bytes = [0_u8; 16];
    getrandom::fill(&mut bytes)?;
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

fn system_codex_identity() -> Value {
    let Some(path) = system_codex_home().map(|path| path.join("auth.json")) else {
        return json!({ "hasAuth": false, "authKind": "none", "email": null, "providerAccountId": null, "workspaceLabel": null });
    };
    let auth = read_json_file_sync(&path);
    let Some(auth) = auth else {
        let has_api_key =
            std::env::var("OPENAI_API_KEY").is_ok_and(|value| !value.trim().is_empty());
        return json!({ "hasAuth": has_api_key, "authKind": if has_api_key { "api-key" } else { "none" }, "email": null, "providerAccountId": null, "workspaceLabel": null });
    };
    if auth
        .get("OPENAI_API_KEY")
        .and_then(Value::as_str)
        .is_some_and(|value| !value.trim().is_empty())
    {
        return json!({ "hasAuth": true, "authKind": "api-key", "email": null, "providerAccountId": null, "workspaceLabel": null });
    }
    let tokens = auth.get("tokens").and_then(Value::as_object);
    let has_oauth = tokens.is_some_and(|tokens| {
        tokens
            .get("access_token")
            .or_else(|| tokens.get("id_token"))
            .or_else(|| tokens.get("idToken"))
            .and_then(Value::as_str)
            .is_some_and(|value| !value.trim().is_empty())
    });
    if !has_oauth {
        let has_api_key =
            std::env::var("OPENAI_API_KEY").is_ok_and(|value| !value.trim().is_empty());
        return json!({ "hasAuth": has_api_key, "authKind": if has_api_key { "api-key" } else { "none" }, "email": null, "providerAccountId": null, "workspaceLabel": null });
    }
    let payload = tokens
        .and_then(|tokens| tokens.get("id_token").or_else(|| tokens.get("idToken")))
        .and_then(Value::as_str)
        .and_then(jwt_payload);
    json!({ "hasAuth": true, "authKind": "oauth", "email": payload.as_ref().and_then(|value| value.get("email")).and_then(Value::as_str), "providerAccountId": tokens.and_then(|value| value.get("account_id")).and_then(Value::as_str).or_else(|| payload.as_ref().and_then(|value| value.pointer("/https:~1~1api.openai.com~1auth/chatgpt_account_id")).and_then(Value::as_str)), "workspaceLabel": payload.as_ref().and_then(|value| value.pointer("/https:~1~1api.openai.com~1auth/workspace_name")).and_then(Value::as_str) })
}

pub(crate) fn codex_system_identity() -> Value {
    system_codex_identity()
}
fn jwt_payload(token: &str) -> Option<Value> {
    if token.len() > 64 * 1024 {
        return None;
    }
    let segment = token.split('.').nth(1)?;
    let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(segment)
        .or_else(|_| base64::engine::general_purpose::URL_SAFE.decode(segment))
        .ok()?;
    serde_json::from_slice(&bytes).ok()
}
fn preferred_grok_session(document: &Map<String, Value>) -> Option<&Map<String, Value>> {
    document
        .iter()
        .filter_map(|(issuer, value)| value.as_object().map(|session| (issuer, session)))
        .find(|(issuer, session)| {
            issuer.starts_with("https://auth.x.ai")
                && session
                    .get("key")
                    .and_then(Value::as_str)
                    .is_some_and(|key| !key.is_empty())
        })
        .or_else(|| {
            document
                .iter()
                .filter_map(|(issuer, value)| value.as_object().map(|session| (issuer, session)))
                .find(|(_, session)| {
                    session
                        .get("key")
                        .and_then(Value::as_str)
                        .is_some_and(|key| !key.is_empty())
                })
        })
        .map(|(_, session)| session)
}
fn grok_signed_out() -> Value {
    json!({ "signedIn": false, "email": null, "teamId": null, "tokenFresh": false, "error": null })
}
fn grok_status_error(message: &str) -> Value {
    json!({ "signedIn": false, "email": null, "teamId": null, "tokenFresh": false, "error": message })
}
fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

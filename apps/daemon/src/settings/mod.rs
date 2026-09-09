mod agents;
mod defaults;
mod fonts;
mod ghostty;
mod global_update;
mod notifications;
mod persistence;
pub(crate) mod quick_commands;
mod telemetry;
mod warp;

use std::path::Path;
use std::sync::{Arc, Mutex as SyncMutex, MutexGuard};

use serde_json::{Map, Value, json};
use thiserror::Error;
use tokio::sync::Mutex;

use crate::agent_status_hooks::AgentStatusHooksAuthority;

pub(crate) use notifications::NotificationSettings;
use persistence::SettingsPersistence;
pub(crate) use telemetry::{TelemetryPreferences, TelemetrySettings};

pub(crate) fn is_tui_agent(value: &str) -> bool {
    agents::is_agent(value)
}

pub(crate) fn parse_warp_theme_entry(
    content: &str,
    file_label: &str,
    id_discriminator: Option<&str>,
    id_suffix: Option<&str>,
    imported_at: Option<&str>,
    source_label: Option<&str>,
) -> Result<Value, String> {
    let imported_at = imported_at.map_or_else(warp::timestamp, str::to_owned);
    warp::parse_entry(
        content,
        file_label,
        id_discriminator.unwrap_or_default(),
        id_suffix,
        source_label.unwrap_or(file_label),
        &imported_at,
    )
}

#[derive(Clone)]
pub(crate) struct SettingsAuthority {
    inner: Arc<SettingsInner>,
}

pub(crate) struct AgentLaunchSettings {
    pub(crate) args: String,
    pub(crate) command_override: Option<String>,
    pub(crate) disabled: bool,
    pub(crate) environment: Vec<(String, String)>,
    pub(crate) terminal_windows_shell: Option<String>,
}

pub(crate) struct ActiveRuntimeEnvironmentCleanup<'a> {
    _update_guard: tokio::sync::MutexGuard<'a, ()>,
}

pub(super) struct SettingsInner {
    agent_status_hooks: AgentStatusHooksAuthority,
    persistence: SettingsPersistence,
    state: SyncMutex<State>,
    update_gate: Mutex<()>,
}

pub(super) struct State {
    document: Map<String, Value>,
    revision: u64,
}

#[derive(Debug, Error)]
pub(crate) enum SettingsError {
    #[error("Quick command cannot be normalized")]
    QuickCommandInvalid,
    #[error("Quick command limit reached")]
    QuickCommandLimit,
    #[error("settings random identifier generation failed: {0}")]
    Random(#[from] getrandom::Error),
    #[error("settings persistence worker is unavailable")]
    PersistenceUnavailable,
    #[error("settings state file has no parent directory")]
    StoragePath,
    #[error("settings state file must contain a JSON object")]
    InvalidDocument,
    #[error("settings I/O failed: {0}")]
    Io(#[from] std::io::Error),
    #[error("settings JSON failed: {0}")]
    Json(#[from] serde_json::Error),
    #[error("settings worker failed: {0}")]
    Worker(#[from] tokio::task::JoinError),
}

impl SettingsAuthority {
    pub(crate) async fn open(
        user_data_path: &Path,
        agent_status_hooks: AgentStatusHooksAuthority,
    ) -> Result<Self, SettingsError> {
        let (persistence, document, existed) = SettingsPersistence::open(user_data_path).await?;
        let home_path =
            crate::paths::resolve_local_home_path().ok_or(SettingsError::StoragePath)?;
        let document = tokio::task::spawn_blocking(move || {
            let mut complete = defaults::document(&home_path);
            complete.extend(document);
            let mut document = complete;
            agents::normalize(&mut document);
            telemetry::initialize(&mut document, existed)?;
            let commands = quick_commands::normalize(document.get("terminalQuickCommands"));
            document.insert("terminalQuickCommands".to_owned(), Value::Array(commands));
            Ok::<_, SettingsError>(document)
        })
        .await??;
        let authority = Self {
            inner: Arc::new(SettingsInner {
                agent_status_hooks,
                persistence,
                state: SyncMutex::new(State {
                    document,
                    revision: 0,
                }),
                update_gate: Mutex::new(()),
            }),
        };
        {
            let mut state = lock(&authority.inner.state);
            commit(&authority.inner, &mut state, None)?;
        }
        Ok(authority)
    }

    pub(crate) fn get(&self) -> Value {
        client_settings(&lock(&self.inner.state).document)
    }

    pub(crate) fn notification_settings(&self) -> NotificationSettings {
        NotificationSettings::from_document(&lock(&self.inner.state).document)
    }

    pub(crate) fn terminal_windows_shell(&self) -> Option<String> {
        lock(&self.inner.state)
            .document
            .get("terminalWindowsShell")
            .and_then(Value::as_str)
            .map(str::to_owned)
    }

    pub(crate) async fn update_global(
        &self,
        updates: Map<String, Value>,
    ) -> Result<Value, SettingsError> {
        let _update_guard = self.inner.update_gate.lock().await;
        let (settings, hooks_enabled) = {
            let mut state = lock(&self.inner.state);
            let mut changed = Map::new();
            for (key, value) in global_update::normalize(&state.document, updates) {
                if state.document.get(&key) != Some(&value) {
                    state.document.insert(key.clone(), value.clone());
                    changed.insert(key, value);
                }
            }
            let hooks_enabled = changed
                .get("agentStatusHooksEnabled")
                .and_then(Value::as_bool);
            if !changed.is_empty() {
                commit(&self.inner, &mut state, Some(changed))?;
            }
            Ok::<_, SettingsError>((client_settings(&state.document), hooks_enabled))
        }?;
        if let Some(enabled) = hooks_enabled {
            self.inner.agent_status_hooks.apply_local(enabled).await;
        }
        Ok(settings)
    }

    pub(crate) fn account_document(&self) -> Map<String, Value> {
        let state = lock(&self.inner.state);
        [
            "claudeManagedAccounts",
            "activeClaudeManagedAccountId",
            "activeClaudeManagedAccountIdsByRuntime",
            "codexManagedAccounts",
            "activeCodexManagedAccountId",
            "activeCodexManagedAccountIdsByRuntime",
            "geminiCliOAuthEnabled",
            "minimaxGroupId",
            "minimaxUsageModels",
        ]
        .into_iter()
        .filter_map(|key| {
            state
                .document
                .get(key)
                .cloned()
                .map(|value| (key.to_owned(), value))
        })
        .collect()
    }

    pub(crate) async fn update_account_document(
        &self,
        updates: Map<String, Value>,
    ) -> Result<(), SettingsError> {
        let _update_guard = self.inner.update_gate.lock().await;
        let mut state = lock(&self.inner.state);
        let mut changed = Map::new();
        for (key, value) in updates {
            if !matches!(
                key.as_str(),
                "claudeManagedAccounts"
                    | "activeClaudeManagedAccountId"
                    | "activeClaudeManagedAccountIdsByRuntime"
                    | "codexManagedAccounts"
                    | "activeCodexManagedAccountId"
                    | "activeCodexManagedAccountIdsByRuntime"
            ) {
                continue;
            }
            if state.document.get(&key) != Some(&value) {
                state.document.insert(key.clone(), value.clone());
                changed.insert(key, value);
            }
        }
        if !changed.is_empty() {
            commit(&self.inner, &mut state, Some(changed))?;
        }
        Ok(())
    }

    pub(crate) fn agent_launch_settings(&self, agent: &str) -> AgentLaunchSettings {
        let state = lock(&self.inner.state);
        let document = &state.document;
        let command_override = agents::string_map(document.get("agentCmdOverrides"), false)
            .remove(agent)
            .filter(|value| !value.is_empty());
        let args = agents::string_map(document.get("agentDefaultArgs"), true)
            .remove(agent)
            .unwrap_or_default();
        let mut environment = agents::env_map(document.get("agentDefaultEnv"))
            .remove(agent)
            .and_then(|value| value.as_object().cloned())
            .into_iter()
            .flatten()
            .filter_map(|(name, value)| value.as_str().map(|value| (name, value.to_owned())))
            .collect::<Vec<_>>();
        if let Some((name, value)) = selected_managed_account_environment(document, agent) {
            environment.retain(|(candidate, _)| candidate != name);
            environment.push((name.to_owned(), value));
        }
        AgentLaunchSettings {
            args,
            command_override,
            disabled: agents::string_list(document.get("disabledTuiAgents"))
                .iter()
                .any(|value| value == agent),
            environment,
            terminal_windows_shell: document
                .get("terminalWindowsShell")
                .and_then(Value::as_str)
                .map(str::to_owned),
        }
    }

    pub(crate) fn legacy_keybindings(&self) -> Option<Value> {
        lock(&self.inner.state).document.get("keybindings").cloned()
    }

    pub(crate) fn mobile_auto_restore_fit_ms(&self) -> Option<f64> {
        normalize_mobile_auto_restore_fit_ms(
            lock(&self.inner.state)
                .document
                .get("mobileAutoRestoreFitMs"),
        )
    }

    pub(crate) async fn set_mobile_auto_restore_fit_ms(
        &self,
        milliseconds: Option<f64>,
    ) -> Result<Option<f64>, SettingsError> {
        let _update_guard = self.inner.update_gate.lock().await;
        let normalized = milliseconds.map(|value| {
            value.clamp(
                MOBILE_AUTO_RESTORE_FIT_MIN_MS,
                MOBILE_AUTO_RESTORE_FIT_MAX_MS,
            )
        });
        let value = normalized
            .and_then(serde_json::Number::from_f64)
            .map_or(Value::Null, Value::Number);
        let mut state = lock(&self.inner.state);
        if state.document.get("mobileAutoRestoreFitMs") != Some(&value) {
            state
                .document
                .insert("mobileAutoRestoreFitMs".to_owned(), value.clone());
            commit(
                &self.inner,
                &mut state,
                Some(Map::from_iter([(
                    "mobileAutoRestoreFitMs".to_owned(),
                    value,
                )])),
            )?;
        }
        Ok(normalized)
    }

    pub(crate) async fn update(&self, updates: Map<String, Value>) -> Result<Value, SettingsError> {
        let _update_guard = self.inner.update_gate.lock().await;
        let (settings, hooks_enabled) = {
            let mut state = lock(&self.inner.state);
            let mut changed = Map::new();
            for (key, value) in normalize_updates(updates) {
                if state.document.get(&key) != Some(&value) {
                    state.document.insert(key.clone(), value.clone());
                    changed.insert(key, value);
                }
            }
            let hooks_enabled = changed
                .get("agentStatusHooksEnabled")
                .and_then(Value::as_bool);
            if !changed.is_empty() {
                commit(&self.inner, &mut state, Some(changed))?;
            }
            Ok::<_, SettingsError>((client_settings(&state.document), hooks_enabled))
        }?;
        if let Some(enabled) = hooks_enabled {
            self.inner.agent_status_hooks.apply_local(enabled).await;
        }
        Ok(settings)
    }

    pub(crate) fn terminal_quick_commands(&self) -> Vec<Value> {
        quick_commands::normalize(
            lock(&self.inner.state)
                .document
                .get("terminalQuickCommands"),
        )
    }

    pub(crate) fn update_terminal_quick_commands(
        &self,
        mutation: &Map<String, Value>,
    ) -> Result<Vec<Value>, SettingsError> {
        let mut state = lock(&self.inner.state);
        let current = quick_commands::normalize(state.document.get("terminalQuickCommands"));
        let next = quick_commands::apply(&current, mutation)?;
        if next != current {
            state.document.insert(
                "terminalQuickCommands".to_owned(),
                Value::Array(next.clone()),
            );
            commit(
                &self.inner,
                &mut state,
                Some(Map::from_iter([(
                    "terminalQuickCommands".to_owned(),
                    Value::Array(next.clone()),
                )])),
            )?;
        }
        Ok(next)
    }

    pub(crate) fn update_pr_bot_author(
        &self,
        author: &str,
        is_bot: bool,
    ) -> Result<Value, SettingsError> {
        let mut state = lock(&self.inner.state);
        let current = normalize_authors(state.document.get("prBotAuthorOverrides"));
        let normalized = normalize_author(author);
        let mut next = current.clone();
        if !normalized.is_empty() {
            if is_bot && !next.contains(&normalized) && next.len() < 500 {
                next.push(normalized);
            } else if !is_bot {
                next.retain(|candidate| candidate != &normalized);
            }
        }
        next.sort();
        if next != current {
            let value = Value::Array(next.into_iter().map(Value::String).collect());
            state
                .document
                .insert("prBotAuthorOverrides".to_owned(), value.clone());
            commit(
                &self.inner,
                &mut state,
                Some(Map::from_iter([("prBotAuthorOverrides".to_owned(), value)])),
            )?;
        }
        Ok(client_settings(&state.document))
    }

    pub(crate) fn telemetry_preferences(&self) -> TelemetryPreferences {
        TelemetryPreferences::new(self.inner.clone())
    }

    pub(crate) async fn list_fonts(&self) -> Vec<String> {
        fonts::list().await
    }

    pub(crate) async fn preview_ghostty(&self) -> Value {
        let document = lock(&self.inner.state).document.clone();
        ghostty::preview(&document).await
    }

    pub(crate) async fn preview_warp(&self, kind: &str) -> Value {
        warp::preview(kind).await
    }

    pub(crate) async fn flush(&self) -> Result<(), SettingsError> {
        self.inner.persistence.flush().await
    }

    pub(crate) async fn clear_active_runtime_environments(
        &self,
        environment_ids: &[String],
    ) -> Result<ActiveRuntimeEnvironmentCleanup<'_>, SettingsError> {
        let update_guard = self.inner.update_gate.lock().await;
        {
            let mut state = lock(&self.inner.state);
            if state
                .document
                .get("activeRuntimeEnvironmentId")
                .and_then(Value::as_str)
                .is_some_and(|active| {
                    environment_ids
                        .iter()
                        .any(|environment_id| environment_id == active)
                })
            {
                state
                    .document
                    .insert("activeRuntimeEnvironmentId".to_owned(), Value::Null);
                commit(
                    &self.inner,
                    &mut state,
                    Some(Map::from_iter([(
                        "activeRuntimeEnvironmentId".to_owned(),
                        Value::Null,
                    )])),
                )?;
            }
        }
        self.inner.persistence.flush().await?;
        Ok(ActiveRuntimeEnvironmentCleanup {
            _update_guard: update_guard,
        })
    }
}

fn selected_managed_account_environment(
    document: &Map<String, Value>,
    agent: &str,
) -> Option<(&'static str, String)> {
    let (active_key, accounts_key, path_key, environment_name) = match agent {
        "claude" | "openclaude" => (
            "activeClaudeManagedAccountId",
            "claudeManagedAccounts",
            "managedAuthPath",
            "CLAUDE_CONFIG_DIR",
        ),
        _ => return None,
    };
    let active_id = document.get(active_key).and_then(Value::as_str)?;
    let account = document
        .get(accounts_key)
        .and_then(Value::as_array)?
        .iter()
        .find(|account| account.get("id").and_then(Value::as_str) == Some(active_id))?;
    let path = account.get(path_key).and_then(Value::as_str)?.trim();
    (!path.is_empty()).then(|| (environment_name, path.to_owned()))
}

pub(super) fn commit(
    inner: &SettingsInner,
    state: &mut State,
    _changed: Option<Map<String, Value>>,
) -> Result<(), SettingsError> {
    state.revision = state.revision.saturating_add(1);
    inner
        .persistence
        .schedule(state.document.clone(), state.revision)?;
    Ok(())
}

fn client_settings(document: &Map<String, Value>) -> Value {
    let mut settings = document.clone();
    settings.insert(
        "defaultTuiAgent".to_owned(),
        document
            .get("defaultTuiAgent")
            .filter(|value| {
                value.is_null()
                    || value
                        .as_str()
                        .is_some_and(|value| value == "blank" || agents::is_agent(value))
            })
            .cloned()
            .unwrap_or(Value::Null),
    );
    settings.insert(
        "disabledTuiAgents".to_owned(),
        json!(agents::string_list(document.get("disabledTuiAgents"))),
    );
    settings.insert(
        "agentCmdOverrides".to_owned(),
        json!(agents::string_map(document.get("agentCmdOverrides"), false)),
    );
    settings.insert(
        "agentDefaultArgs".to_owned(),
        json!(agents::string_map(document.get("agentDefaultArgs"), true)),
    );
    settings.insert(
        "agentDefaultEnv".to_owned(),
        Value::Object(agents::env_map(document.get("agentDefaultEnv"))),
    );
    settings.insert(
        "agentStatusHooksEnabled".to_owned(),
        Value::Bool(
            document
                .get("agentStatusHooksEnabled")
                .and_then(Value::as_bool)
                != Some(false),
        ),
    );
    settings.insert(
        "minimaxGroupId".to_owned(),
        Value::String(
            document
                .get("minimaxGroupId")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_owned(),
        ),
    );
    settings.insert(
        "minimaxUsageModels".to_owned(),
        Value::String(
            document
                .get("minimaxUsageModels")
                .and_then(Value::as_str)
                .unwrap_or("general")
                .to_owned(),
        ),
    );
    settings.insert(
        "prBotAuthorOverrides".to_owned(),
        json!(normalize_authors(document.get("prBotAuthorOverrides"))),
    );
    Value::Object(settings)
}

fn normalize_authors(value: Option<&Value>) -> Vec<String> {
    let mut values = value
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .take(500)
        .filter_map(Value::as_str)
        .map(normalize_author)
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();
    values.sort();
    values.dedup();
    values
}

const MOBILE_AUTO_RESTORE_FIT_MIN_MS: f64 = 5_000.0;
const MOBILE_AUTO_RESTORE_FIT_MAX_MS: f64 = 60.0 * 60.0 * 1_000.0;

fn normalize_mobile_auto_restore_fit_ms(value: Option<&Value>) -> Option<f64> {
    value
        .and_then(Value::as_f64)
        .filter(|value| value.is_finite())
        .map(|value| {
            value.clamp(
                MOBILE_AUTO_RESTORE_FIT_MIN_MS,
                MOBILE_AUTO_RESTORE_FIT_MAX_MS,
            )
        })
}

fn normalize_updates(updates: Map<String, Value>) -> Map<String, Value> {
    let mut output = Map::new();
    for (key, value) in updates {
        let value = match key.as_str() {
            "defaultTuiAgent"
                if value.is_null()
                    || value
                        .as_str()
                        .is_some_and(|value| value == "blank" || agents::is_agent(value)) =>
            {
                value
            }
            "disabledTuiAgents" => json!(agents::string_list(Some(&value))),
            "agentDefaultArgs" => json!(agents::string_map(Some(&value), true)),
            "agentDefaultEnv" => Value::Object(agents::env_map(Some(&value))),
            "agentStatusHooksEnabled" if value.is_boolean() => value,
            "minimaxGroupId" | "minimaxUsageModels" if value.is_string() => value,
            "prBotAuthorOverrides" => json!(normalize_authors(Some(&value))),
            _ => continue,
        };
        output.insert(key, value);
    }
    output
}

fn normalize_author(value: &str) -> String {
    if value.encode_utf16().count() > 255 {
        String::new()
    } else {
        value.trim().to_lowercase()
    }
}

fn lock<T>(mutex: &SyncMutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

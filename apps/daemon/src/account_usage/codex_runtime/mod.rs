mod auth;
mod config;
mod file_metadata;
mod managed_files;
mod resources;

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;

use serde_json::{Map, Value};
use thiserror::Error;
use tokio::process::Command;

use crate::settings::SettingsAuthority;
use crate::transport::secure_file;

use super::authentication::ManagedLocation;

#[derive(Clone)]
pub(crate) struct CodexRuntimeHome {
    inner: Arc<RuntimeInner>,
}

struct RuntimeInner {
    root: PathBuf,
    settings: SettingsAuthority,
    state: Mutex<RuntimeState>,
    user_data_path: PathBuf,
}

#[derive(Default)]
struct RuntimeState {
    skipped_read_back: HashSet<String>,
    wsl: HashMap<String, WslLane>,
}

#[derive(Clone)]
struct WslLane {
    host_home: PathBuf,
    last_account_id: Option<String>,
    last_written_auth: Option<String>,
    system_auth_path: PathBuf,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) enum CodexRuntimeTarget {
    Host,
    Remote,
    Wsl { distro: String },
}

#[derive(Clone)]
pub(crate) struct PreparedCodexHome {
    account_id: String,
    pub(crate) launch_path: String,
}

#[derive(Clone)]
pub(super) struct ManagedCodexAccount {
    email: Option<String>,
    host_path: PathBuf,
    id: String,
    linux_path: Option<String>,
    provider_account_id: Option<String>,
    runtime: String,
    workspace_account_id: Option<String>,
    wsl_distro: Option<String>,
}

#[derive(Debug, Error)]
pub(crate) enum CodexRuntimeError {
    #[error("custom Codex providers cannot use managed OAuth accounts")]
    CustomProvider,
    #[error("Codex auth is invalid")]
    InvalidAuth,
    #[error("Codex config is invalid")]
    InvalidConfig,
    #[error("managed Codex home is invalid")]
    InvalidManagedHome,
    #[error("WSL Codex home is unavailable")]
    WslHomeUnavailable,
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    SecureFile(#[from] secure_file::SecureFileError),
}

impl CodexRuntimeHome {
    pub(crate) fn new(user_data_path: PathBuf, settings: SettingsAuthority) -> Self {
        Self {
            inner: Arc::new(RuntimeInner {
                root: user_data_path.clone(),
                settings,
                state: Mutex::new(RuntimeState::default()),
                user_data_path,
            }),
        }
    }

    pub(crate) async fn initialize(&self) {
        self.sync_all_configs().await;
        if let Err(error) = self.prepare_for_launch(CodexRuntimeTarget::Host).await {
            eprintln!("[codex-runtime-home] failed to initialize host selection: {error}");
        }
    }

    pub(crate) async fn prepare_for_launch(
        &self,
        target: CodexRuntimeTarget,
    ) -> Result<Option<PreparedCodexHome>, CodexRuntimeError> {
        let selected_id = selected_account_id(&self.inner.settings.account_document(), &target);
        let (prepared, active_id) = match target.clone() {
            CodexRuntimeTarget::Host => {
                let this = self.clone();
                let prepared = tokio::task::spawn_blocking(move || this.prepare_host())
                    .await
                    .map_err(|error| std::io::Error::other(error.to_string()))??;
                let active = prepared.as_ref().map(|home| home.account_id.clone());
                (prepared, active)
            }
            CodexRuntimeTarget::Remote => (None, None),
            CodexRuntimeTarget::Wsl { distro } => {
                let home = wsl_home(&distro).await?;
                let this = self.clone();
                tokio::task::spawn_blocking(move || this.prepare_wsl(&distro, &home))
                    .await
                    .map_err(|error| std::io::Error::other(error.to_string()))??
            }
        };
        if let Some(selected_id) =
            selected_id.filter(|selected| active_id.as_deref() != Some(selected.as_str()))
        {
            self.clear_invalid_selection(&target, &selected_id).await;
        }
        Ok(prepared)
    }

    pub(crate) async fn prepare_for_rate_limit(
        &self,
        target: CodexRuntimeTarget,
    ) -> Result<Option<PathBuf>, CodexRuntimeError> {
        match target.clone() {
            CodexRuntimeTarget::Host => Ok(self
                .prepare_for_launch(target)
                .await?
                .map(|home| PathBuf::from(home.launch_path))
                .or_else(|| {
                    crate::paths::resolve_local_home_path().map(|home| home.join(".codex"))
                })),
            CodexRuntimeTarget::Remote => Ok(None),
            CodexRuntimeTarget::Wsl { distro } => {
                let home = wsl_home(&distro).await?;
                let prepared = self.prepare_for_launch(target.clone()).await?;
                if selected_account_id(&self.inner.settings.account_document(), &target).is_none() {
                    return Ok(Some(PathBuf::from(format!(
                        "//wsl.localhost/{distro}{}/.codex",
                        home.trim_end_matches('/')
                    ))));
                }
                Ok(prepared.map(|_| {
                    PathBuf::from(format!(
                        "//wsl.localhost/{distro}{}/.local/share/yiru/codex-runtime-home/home",
                        home.trim_end_matches('/')
                    ))
                }))
            }
        }
    }

    pub(crate) async fn sync_after_change(
        &self,
        target: CodexRuntimeTarget,
        fresh_account_id: Option<&str>,
    ) {
        if let Some(account_id) = fresh_account_id {
            lock(&self.inner.state)
                .skipped_read_back
                .insert(account_id.to_owned());
        }
        self.sync_all_configs().await;
        if let Err(error) = self.prepare_for_launch(target).await {
            eprintln!("[codex-runtime-home] failed to sync selected runtime home: {error}");
        }
    }

    pub(crate) async fn preserve_before_change(&self, target: CodexRuntimeTarget) {
        if let Err(error) = self.prepare_for_launch(target).await {
            eprintln!("[codex-runtime-home] failed to preserve runtime auth: {error}");
        }
    }

    pub(in crate::account_usage) async fn sync_login_location(
        &self,
        location: &ManagedLocation,
        reject_custom_provider: bool,
    ) -> Result<(), CodexRuntimeError> {
        let account = ManagedCodexAccount {
            email: None,
            host_path: location.host_path.clone(),
            id: location.account_id.clone(),
            linux_path: location.linux_path.clone(),
            provider_account_id: None,
            runtime: location.runtime.to_owned(),
            workspace_account_id: None,
            wsl_distro: location.wsl_distro.clone(),
        };
        let root = self.inner.root.clone();
        let user_data_path = self.inner.user_data_path.clone();
        tokio::task::spawn_blocking(move || {
            config::sync_account(&root, &user_data_path, &account, reject_custom_provider)
        })
        .await
        .map_err(|error| std::io::Error::other(error.to_string()))?
    }

    pub(crate) async fn sync_before_shutdown(&self) {
        let this = self.clone();
        if let Err(error) = tokio::task::spawn_blocking(move || this.read_back_all_wsl()).await {
            eprintln!("[codex-runtime-home] shutdown read-back worker failed: {error}");
        }
    }

    async fn sync_all_configs(&self) {
        let accounts = match self.accounts() {
            Ok(accounts) => accounts,
            Err(error) => {
                eprintln!("[codex-accounts] failed to read managed homes: {error}");
                return;
            }
        };
        let root = self.inner.root.clone();
        let user_data_path = self.inner.user_data_path.clone();
        if let Err(error) = tokio::task::spawn_blocking(move || {
            config::sync_all(&root, &user_data_path, &accounts);
            if let Some(home) = crate::paths::resolve_local_home_path() {
                let source = home.join(".codex");
                for account in &accounts {
                    if account.runtime == "host" && account.validate(&root).is_ok() {
                        resources::sync_host(&source, &account.host_path);
                    }
                }
            }
        })
        .await
        {
            eprintln!("[codex-accounts] config sync worker failed: {error}");
        }
    }

    fn prepare_host(&self) -> Result<Option<PreparedCodexHome>, CodexRuntimeError> {
        let account = match self.selected_account(&CodexRuntimeTarget::Host) {
            Ok(account) => account,
            Err(CodexRuntimeError::InvalidManagedHome) => return Ok(None),
            Err(error) => return Err(error),
        };
        let Some(account) = account else {
            // System-default Codex deliberately stays on the user's real home.
            return Ok(None);
        };
        if let Err(error) = account.validate(&self.inner.root) {
            eprintln!("[codex-runtime-home] refusing untrusted managed account home: {error}");
            return Ok(None);
        }
        let auth_path = account.host_path.join("auth.json");
        match auth::read(&auth_path) {
            Ok(Some(_)) => {}
            Ok(None) | Err(CodexRuntimeError::InvalidAuth) => return Ok(None),
            Err(error) => return Err(error),
        }
        config::sync_account(
            &self.inner.root,
            &self.inner.user_data_path,
            &account,
            false,
        )?;
        if let Some(home) = crate::paths::resolve_local_home_path() {
            resources::sync_host(&home.join(".codex"), &account.host_path);
        }
        Ok(Some(PreparedCodexHome {
            account_id: account.id,
            launch_path: account.host_path.to_string_lossy().into_owned(),
        }))
    }

    fn prepare_wsl(
        &self,
        distro: &str,
        wsl_user_home: &str,
    ) -> Result<(Option<PreparedCodexHome>, Option<String>), CodexRuntimeError> {
        let linux_home = format!(
            "{}/.local/share/yiru/codex-runtime-home/home",
            wsl_user_home.trim_end_matches('/')
        );
        let host_home = PathBuf::from(format!("//wsl.localhost/{distro}{linux_home}"));
        managed_files::ensure_private_directory(&host_home)?;
        let runtime_auth_path = host_home.join("auth.json");
        let active = self
            .selected_account(&CodexRuntimeTarget::Wsl {
                distro: distro.to_owned(),
            })
            .ok()
            .flatten()
            .filter(|account| {
                account.validate(&self.inner.root).is_ok_and(|_| {
                    auth::read(&account.host_path.join("auth.json"))
                        .is_ok_and(|auth| auth.is_some())
                })
            });
        if let Some(account) = &active {
            config::sync_account(&self.inner.root, &self.inner.user_data_path, account, false)?;
        }

        let mut state = lock(&self.inner.state);
        let previous = state.wsl.get(distro).cloned();
        let runtime_auth = auth::read(&runtime_auth_path)?;
        let skipped = previous
            .as_ref()
            .and_then(|lane| lane.last_account_id.as_ref())
            .is_some_and(|id| state.skipped_read_back.remove(id));
        if previous
            .as_ref()
            .and_then(|lane| lane.last_account_id.as_ref())
            != active.as_ref().map(|account| &account.id)
            && let Some(account) = active.as_ref()
        {
            state.skipped_read_back.remove(&account.id);
        }
        if !skipped {
            self.read_back_runtime_auth(
                runtime_auth.as_deref(),
                previous.as_ref(),
                active.as_ref(),
                distro,
                wsl_user_home,
            )?;
        }

        let system_home = PathBuf::from(format!(
            "//wsl.localhost/{distro}{}/.codex",
            wsl_user_home.trim_end_matches('/')
        ));
        let (auth_source_home, next_account) = match active.as_ref() {
            Some(account) => (account.host_path.clone(), Some(account.id.clone())),
            _ => (system_home.clone(), None),
        };
        config::sync_runtime_from_home(
            &system_home,
            &format!("{}/.codex", wsl_user_home.trim_end_matches('/')),
            &host_home,
            &self.inner.user_data_path,
        )?;
        resources::sync_wsl_instructions(&system_home, &host_home);
        let next_auth = auth::read(&auth_source_home.join("auth.json"))?;
        match next_auth.as_deref() {
            Some(contents) => auth::write(&runtime_auth_path, contents)?,
            None => remove_file_if_regular(&runtime_auth_path)?,
        }
        state.wsl.insert(
            distro.to_owned(),
            WslLane {
                host_home: host_home.clone(),
                last_account_id: next_account.clone(),
                last_written_auth: next_auth,
                system_auth_path: system_home.join("auth.json"),
            },
        );
        Ok((
            Some(PreparedCodexHome {
                account_id: next_account.clone().unwrap_or_default(),
                launch_path: linux_home,
            }),
            next_account,
        ))
    }

    fn read_back_runtime_auth(
        &self,
        runtime_auth: Option<&str>,
        previous: Option<&WslLane>,
        active: Option<&ManagedCodexAccount>,
        distro: &str,
        wsl_user_home: &str,
    ) -> Result<(), CodexRuntimeError> {
        let Some(runtime_auth) = runtime_auth else {
            return Ok(());
        };
        if let Some(account_id) = previous.and_then(|lane| lane.last_account_id.as_deref()) {
            if let Some(account) = self
                .accounts()?
                .into_iter()
                .find(|entry| entry.id == account_id)
            {
                auth::persist_runtime_refresh(
                    runtime_auth,
                    &account,
                    previous.and_then(|lane| lane.last_written_auth.as_deref()),
                )?;
            }
            return Ok(());
        }
        if let Some(account) = active {
            auth::persist_runtime_refresh(runtime_auth, account, None)?;
            return Ok(());
        }
        let system_auth = PathBuf::from(format!(
            "//wsl.localhost/{distro}{}/.codex/auth.json",
            wsl_user_home.trim_end_matches('/')
        ));
        auth::persist_system_refresh(
            runtime_auth,
            &system_auth,
            previous.and_then(|lane| lane.last_written_auth.as_deref()),
        )?;
        Ok(())
    }

    fn read_back_all_wsl(&self) {
        let lanes = lock(&self.inner.state)
            .wsl
            .iter()
            .map(|(distro, lane)| (distro.clone(), lane.clone()))
            .collect::<Vec<_>>();
        for (distro, lane) in lanes {
            let result = (|| {
                let Some(contents) = auth::read(&lane.host_home.join("auth.json"))? else {
                    return Ok::<_, CodexRuntimeError>(());
                };
                if let Some(account_id) = lane.last_account_id.as_deref()
                    && let Some(account) = self
                        .accounts()?
                        .into_iter()
                        .find(|account| account.id == account_id)
                {
                    auth::persist_runtime_refresh(
                        &contents,
                        &account,
                        lane.last_written_auth.as_deref(),
                    )?;
                } else if lane.last_account_id.is_none() {
                    auth::persist_system_refresh(
                        &contents,
                        &lane.system_auth_path,
                        lane.last_written_auth.as_deref(),
                    )?;
                }
                Ok(())
            })();
            if let Err(error) = result {
                eprintln!("[codex-runtime-home] failed to preserve {distro} auth: {error}");
            }
        }
    }

    fn selected_account(
        &self,
        target: &CodexRuntimeTarget,
    ) -> Result<Option<ManagedCodexAccount>, CodexRuntimeError> {
        let document = self.inner.settings.account_document();
        let selected = selected_account_id(&document, target);
        let Some(selected) = selected else {
            return Ok(None);
        };
        self.accounts()?
            .into_iter()
            .find(|account| {
                account.id == selected
                    && match target {
                        CodexRuntimeTarget::Host => account.runtime == "host",
                        CodexRuntimeTarget::Wsl { distro } => {
                            account.runtime == "wsl"
                                && account.wsl_distro.as_deref() == Some(distro.as_str())
                        }
                        CodexRuntimeTarget::Remote => false,
                    }
            })
            .map(Some)
            .ok_or(CodexRuntimeError::InvalidManagedHome)
    }

    fn accounts(&self) -> Result<Vec<ManagedCodexAccount>, CodexRuntimeError> {
        Ok(self
            .inner
            .settings
            .account_document()
            .get("codexManagedAccounts")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(Value::as_object)
            .filter_map(|value| ManagedCodexAccount::from_map(value).ok())
            .collect())
    }

    async fn clear_invalid_selection(&self, target: &CodexRuntimeTarget, account_id: &str) {
        let document = self.inner.settings.account_document();
        if selected_account_id(&document, target).as_deref() != Some(account_id) {
            return;
        }
        let mut selection = document
            .get("activeCodexManagedAccountIdsByRuntime")
            .and_then(Value::as_object)
            .cloned()
            .unwrap_or_default();
        let mut updates = Map::new();
        match target {
            CodexRuntimeTarget::Host => {
                selection.insert("host".to_owned(), Value::Null);
                updates.insert("activeCodexManagedAccountId".to_owned(), Value::Null);
            }
            CodexRuntimeTarget::Wsl { distro } => {
                let mut wsl = selection
                    .get("wsl")
                    .and_then(Value::as_object)
                    .cloned()
                    .unwrap_or_default();
                if distro.trim().is_empty() {
                    for selected in wsl.values_mut() {
                        if selected.as_str() == Some(account_id) {
                            *selected = Value::Null;
                        }
                    }
                } else {
                    wsl.insert(distro.trim().to_owned(), Value::Null);
                }
                selection.insert("wsl".to_owned(), Value::Object(wsl));
            }
            CodexRuntimeTarget::Remote => return,
        }
        updates.insert(
            "activeCodexManagedAccountIdsByRuntime".to_owned(),
            Value::Object(selection),
        );
        if let Err(error) = self.inner.settings.update_account_document(updates).await {
            eprintln!("[codex-runtime-home] failed to clear invalid selection: {error}");
        }
    }
}

impl ManagedCodexAccount {
    fn from_map(value: &Map<String, Value>) -> Result<Self, CodexRuntimeError> {
        let required = |key| {
            value
                .get(key)
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_owned)
                .ok_or(CodexRuntimeError::InvalidManagedHome)
        };
        Ok(Self {
            email: optional(value, "email"),
            host_path: PathBuf::from(required("managedHomePath")?),
            id: required("id")?,
            linux_path: optional(value, "wslLinuxHomePath"),
            provider_account_id: optional(value, "providerAccountId"),
            runtime: optional(value, "managedHomeRuntime").unwrap_or_else(|| "host".to_owned()),
            workspace_account_id: optional(value, "workspaceAccountId"),
            wsl_distro: optional(value, "wslDistro"),
        })
    }

    fn validate(&self, root: &Path) -> Result<(), CodexRuntimeError> {
        if self.id.len() > 128
            || self.id.is_empty()
            || !self
                .id
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
        {
            return Err(CodexRuntimeError::InvalidManagedHome);
        }
        if self.runtime == "wsl" {
            let distro = self
                .wsl_distro
                .as_deref()
                .ok_or(CodexRuntimeError::InvalidManagedHome)?;
            if !valid_wsl_distro(distro) {
                return Err(CodexRuntimeError::InvalidManagedHome);
            }
            let linux = self
                .linux_path
                .as_deref()
                .ok_or(CodexRuntimeError::InvalidManagedHome)?;
            let suffix = format!("/.local/share/yiru/codex-accounts/{}/home", self.id);
            let expected = format!("//wsl.localhost/{distro}{linux}");
            if !valid_linux_absolute_path(linux)
                || !linux.ends_with(&suffix)
                || normalize_path(&self.host_path.to_string_lossy()) != normalize_path(&expected)
            {
                return Err(CodexRuntimeError::InvalidManagedHome);
            }
        } else if self.runtime == "host" {
            let expected = root.join("codex-accounts").join(&self.id).join("home");
            let canonical = std::fs::canonicalize(&self.host_path)?;
            let canonical_expected = std::fs::canonicalize(expected)?;
            let canonical_root = std::fs::canonicalize(root.join("codex-accounts"))?;
            if canonical != canonical_expected || !canonical.starts_with(canonical_root) {
                return Err(CodexRuntimeError::InvalidManagedHome);
            }
        } else {
            return Err(CodexRuntimeError::InvalidManagedHome);
        }
        let marker = managed_files::read_bounded(&self.host_path.join(".yiru-managed-home"), 256)
            .map_err(|_| CodexRuntimeError::InvalidManagedHome)?
            .ok_or(CodexRuntimeError::InvalidManagedHome)?;
        let marker =
            String::from_utf8(marker).map_err(|_| CodexRuntimeError::InvalidManagedHome)?;
        if marker.trim() != self.id {
            return Err(CodexRuntimeError::InvalidManagedHome);
        }
        Ok(())
    }
}

fn selected_account_id(
    document: &Map<String, Value>,
    target: &CodexRuntimeTarget,
) -> Option<String> {
    let selection = document
        .get("activeCodexManagedAccountIdsByRuntime")
        .and_then(Value::as_object);
    match target {
        CodexRuntimeTarget::Host => selection
            .and_then(|value| value.get("host"))
            .and_then(Value::as_str)
            .or_else(|| {
                document
                    .get("activeCodexManagedAccountId")
                    .and_then(Value::as_str)
            })
            .map(str::to_owned),
        CodexRuntimeTarget::Wsl { distro } => {
            let wsl = selection
                .and_then(|value| value.get("wsl"))
                .and_then(Value::as_object)?;
            if let Some(id) = wsl.get(distro).and_then(Value::as_str) {
                return Some(id.to_owned());
            }
            if !distro.trim().is_empty() {
                return None;
            }
            if let Some(id) = wsl.get("__default__").and_then(Value::as_str) {
                return Some(id.to_owned());
            }
            let selected = wsl
                .values()
                .filter_map(Value::as_str)
                .collect::<HashSet<_>>();
            (selected.len() == 1)
                .then(|| selected.into_iter().next().unwrap_or_default().to_owned())
        }
        CodexRuntimeTarget::Remote => None,
    }
}

fn optional(value: &Map<String, Value>, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

fn normalize_path(value: &str) -> String {
    let value = value.replace('\\', "/");
    if cfg!(windows) {
        value.to_ascii_lowercase()
    } else {
        value
    }
}

fn remove_file_if_regular(path: &Path) -> Result<(), CodexRuntimeError> {
    if auth::read(path)?.is_some() {
        std::fs::remove_file(path)?;
    }
    Ok(())
}

async fn wsl_home(distro: &str) -> Result<String, CodexRuntimeError> {
    if !cfg!(windows) || !valid_wsl_distro(distro) {
        return Err(CodexRuntimeError::WslHomeUnavailable);
    }
    let output = tokio::time::timeout(
        Duration::from_secs(5),
        Command::new("wsl.exe")
            .args(["-d", distro, "--", "sh", "-lc", "printf '%s' \"$HOME\""])
            .stdin(Stdio::null())
            .stderr(Stdio::null())
            .kill_on_drop(true)
            .output(),
    )
    .await
    .map_err(|_| CodexRuntimeError::WslHomeUnavailable)?
    .map_err(|_| CodexRuntimeError::WslHomeUnavailable)?;
    let home =
        String::from_utf8(output.stdout).map_err(|_| CodexRuntimeError::WslHomeUnavailable)?;
    let home = home.trim().trim_matches('\0');
    if !output.status.success() || !valid_linux_absolute_path(home) {
        return Err(CodexRuntimeError::WslHomeUnavailable);
    }
    Ok(home.to_owned())
}

fn valid_wsl_distro(distro: &str) -> bool {
    !distro.trim().is_empty()
        && !distro.starts_with('-')
        && !distro
            .bytes()
            .any(|byte| matches!(byte, 0 | b'\r' | b'\n' | b'/' | b'\\' | b':'))
}

fn valid_linux_absolute_path(path: &str) -> bool {
    path.starts_with('/')
        && !path.contains('\\')
        && path
            .split('/')
            .skip(1)
            .all(|part| !part.is_empty() && !matches!(part, "." | ".."))
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

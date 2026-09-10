mod calendar;
mod claude;
mod codex;
mod opencode;
pub(crate) mod pricing;
mod pricing_catalog;
mod projection;
mod scan;
mod sessions;
mod worktrees;

use projection::build_snapshot;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::{Map, Value, json};
use thiserror::Error;
use tokio::sync::Mutex;

use crate::atomic_file_replace;

const SCAN_STALE_MS: i64 = 5 * 60 * 1000;

#[derive(Clone, Copy)]
pub(crate) enum Provider {
    Claude,
    Codex,
    OpenCode,
}

impl Provider {
    fn file_name(self) -> &'static str {
        match self {
            Self::Claude => "agentstart-claude-usage.json",
            Self::Codex => "agentstart-codex-usage.json",
            Self::OpenCode => "agentstart-opencode-usage.json",
        }
    }

    fn data_key(self) -> &'static str {
        match self {
            Self::Claude => "Claude",
            Self::Codex => "Codex",
            Self::OpenCode => "OpenCode",
        }
    }
}

#[derive(Debug, Error)]
pub(crate) enum ProviderUsageError {
    #[error("provider usage input is invalid")]
    Input,
    #[error("provider usage state could not be read: {0}")]
    Read(#[from] std::io::Error),
    #[error("provider usage state is invalid JSON: {0}")]
    Json(#[from] serde_json::Error),
    #[error("provider usage state could not be replaced: {0}")]
    Replace(std::io::Error),
    #[error("{0}")]
    Scan(String),
}

#[derive(Clone)]
pub(crate) struct ProviderUsageAuthority {
    root: PathBuf,
    slots: Arc<[ProviderSlot; 3]>,
    worktree_sources: Option<worktrees::WorktreeSources>,
}

struct ProviderSlot {
    write_gate: Mutex<()>,
    scan_gate: Arc<Mutex<()>>,
    is_scanning: AtomicBool,
    enabled_revision: AtomicU64,
}

impl ProviderSlot {
    fn new() -> Self {
        Self {
            write_gate: Mutex::new(()),
            scan_gate: Arc::new(Mutex::new(())),
            is_scanning: AtomicBool::new(false),
            enabled_revision: AtomicU64::new(0),
        }
    }
}

impl ProviderUsageAuthority {
    pub(crate) fn new(root: PathBuf) -> Self {
        Self {
            root,
            slots: Arc::new(std::array::from_fn(|_| ProviderSlot::new())),
            worktree_sources: None,
        }
    }

    pub(crate) async fn scan_state(&self, provider: Provider) -> Result<Value, ProviderUsageError> {
        let _guard = self.slot(provider).write_gate.lock().await;
        let state = self.read(provider).await?;
        Ok(self.scan_state_value(&state, provider))
    }

    pub(crate) async fn set_enabled(
        &self,
        provider: Provider,
        enabled: bool,
    ) -> Result<Value, ProviderUsageError> {
        let _guard = self.slot(provider).write_gate.lock().await;
        let mut state = self.read(provider).await?;
        if bool_field(state.get("scanState"), "enabled", true) == enabled {
            return Ok(self.scan_state_value(&state, provider));
        }
        state
            .as_object_mut()
            .ok_or(ProviderUsageError::Input)?
            .entry("scanState")
            .or_insert_with(|| json!({}))
            .as_object_mut()
            .ok_or(ProviderUsageError::Input)?
            .insert("enabled".to_owned(), Value::Bool(enabled));
        self.write(provider, &state).await?;
        self.slot(provider)
            .enabled_revision
            .fetch_add(1, Ordering::AcqRel);
        Ok(self.scan_state_value(&state, provider))
    }

    pub(crate) fn with_worktree_sources(
        mut self,
        projects: crate::projects::ProjectCatalog,
        metadata: crate::worktrees::WorktreeMetadataStore,
    ) -> Self {
        self.worktree_sources = Some(worktrees::WorktreeSources::new(projects, metadata));
        self
    }

    pub(crate) async fn worktree_scope_paths(&self) -> Result<Vec<String>, ProviderUsageError> {
        let sources = self.worktree_sources.as_ref().ok_or_else(|| {
            ProviderUsageError::Scan("Provider usage worktree sources are unavailable".to_owned())
        })?;
        Ok(sources
            .load()
            .await?
            .into_iter()
            .map(|worktree| worktree.path)
            .collect())
    }

    pub(crate) fn refresh_background(&self, provider: Provider) {
        let Ok(guard) = self.slot(provider).scan_gate.clone().try_lock_owned() else {
            return;
        };
        let authority = self.clone();
        tokio::spawn(async move {
            let _guard = guard;
            let continue_refresh = match scan::run(&authority, provider, false).await {
                Ok(continue_refresh) => continue_refresh,
                Err(error) => {
                    eprintln!("Provider usage background scan failed: {error}");
                    false
                }
            };
            drop(_guard);
            if continue_refresh {
                tokio::task::yield_now().await;
                authority.refresh_background(provider);
            }
        });
    }

    pub(crate) async fn refresh(
        &self,
        provider: Provider,
        force: bool,
    ) -> Result<Value, ProviderUsageError> {
        let scan_gate = self.slot(provider).scan_gate.clone();
        let Ok(guard) = scan_gate.clone().try_lock_owned() else {
            let _guard = scan_gate.lock().await;
            return self.scan_state(provider).await;
        };
        let authority = self.clone();
        tokio::spawn(async move {
            let _guard = guard;
            let continue_refresh = scan::run(&authority, provider, force).await?;
            drop(_guard);
            if continue_refresh {
                tokio::task::yield_now().await;
                authority.refresh_background(provider);
            }
            Ok::<(), ProviderUsageError>(())
        })
        .await
        .map_err(|error| ProviderUsageError::Scan(error.to_string()))??;
        self.scan_state(provider).await
    }

    fn slot(&self, provider: Provider) -> &ProviderSlot {
        &self.slots[match provider {
            Provider::Claude => 0,
            Provider::Codex => 1,
            Provider::OpenCode => 2,
        }]
    }

    fn scan_state_value(&self, state: &Value, provider: Provider) -> Value {
        let mut response = scan_state(state, provider);
        response["isScanning"] = json!(self.slot(provider).is_scanning.load(Ordering::Acquire));
        response
    }

    pub(crate) async fn snapshot(
        &self,
        provider: Provider,
        scope: &str,
        range: &str,
        limit: Option<u64>,
    ) -> Result<Value, ProviderUsageError> {
        if !matches!(scope, "agentstart" | "all") || !matches!(range, "7d" | "30d" | "90d" | "all")
        {
            return Err(ProviderUsageError::Input);
        }
        let _guard = self.slot(provider).write_gate.lock().await;
        let state = self.read(provider).await?;
        let mut snapshot =
            build_snapshot(&state, provider, scope, range, limit.unwrap_or(10).min(100));
        snapshot["scanState"] = self.scan_state_value(&state, provider);
        Ok(snapshot)
    }

    async fn read(&self, provider: Provider) -> Result<Value, ProviderUsageError> {
        let path = self.root.join(provider.file_name());
        use tokio::io::AsyncReadExt;
        let file = match tokio::fs::File::open(&path).await {
            Ok(file) => file,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return Ok(default_state());
            }
            Err(error) => return Err(error.into()),
        };
        let mut bytes = Vec::new();
        file.take(256 * 1024 * 1024 + 1)
            .read_to_end(&mut bytes)
            .await?;
        if bytes.len() > 256 * 1024 * 1024 {
            return Err(ProviderUsageError::Scan(
                "Provider usage cache exceeds its size limit".to_owned(),
            ));
        }
        Ok(serde_json::from_slice(&bytes)?)
    }

    async fn write(&self, provider: Provider, state: &Value) -> Result<(), ProviderUsageError> {
        tokio::fs::create_dir_all(&self.root).await?;
        let destination = self.root.join(provider.file_name());
        let temporary = destination.with_file_name(format!(
            ".{}.{}.{}.tmp",
            provider.file_name(),
            std::process::id(),
            now_ms()
        ));
        let bytes = serde_json::to_vec_pretty(state)?;
        if bytes.len() > 256 * 1024 * 1024 {
            return Err(ProviderUsageError::Scan(
                "Provider usage cache exceeds its size limit".to_owned(),
            ));
        }
        let result = async {
            let mut file = tokio::fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&temporary)
                .await?;
            tokio::io::AsyncWriteExt::write_all(&mut file, &bytes).await?;
            file.sync_all().await?;
            atomic_file_replace::replace_async(&temporary, &destination).await
        }
        .await;
        if result.is_err() {
            let _ = tokio::fs::remove_file(&temporary).await;
        }
        result.map_err(ProviderUsageError::Replace)
    }
}

fn default_state() -> Value {
    json!({
        "scanState": {
            "enabled": true,
            "isScanning": false,
            "lastScanStartedAt": null,
            "lastScanCompletedAt": null,
            "lastScanError": null
        },
        "sessions": [],
        "dailyAggregates": []
    })
}

fn scan_state(state: &Value, provider: Provider) -> Value {
    let scan = state.get("scanState");
    let has_data = state
        .get("sessions")
        .and_then(Value::as_array)
        .is_some_and(|rows| !rows.is_empty())
        || state
            .get("dailyAggregates")
            .and_then(Value::as_array)
            .is_some_and(|rows| !rows.is_empty());
    let mut result = json!({
        "enabled": bool_field(scan, "enabled", true),
        "isScanning": false,
        "lastScanStartedAt": nullable_number(scan, "lastScanStartedAt"),
        "lastScanCompletedAt": nullable_number(scan, "lastScanCompletedAt"),
        "lastScanError": nullable_string(scan, "lastScanError")
    });
    if let Some(object) = result.as_object_mut() {
        object.insert(
            format!("hasAny{}Data", provider.data_key()),
            json!(has_data),
        );
    }
    result
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| duration.as_millis() as i64)
}

fn object(value: Option<&Value>) -> Option<&Map<String, Value>> {
    value.and_then(Value::as_object)
}
fn string_field<'a>(value: Option<&'a Value>, key: &str) -> Option<&'a str> {
    object(value)?.get(key)?.as_str()
}
fn nullable_string<'a>(value: Option<&'a Value>, key: &str) -> Option<&'a str> {
    string_field(value, key)
}
fn number_field(value: Option<&Value>, key: &str) -> Option<u64> {
    object(value)?.get(key)?.as_u64()
}
fn nullable_number(value: Option<&Value>, key: &str) -> Value {
    number_field(value, key).map_or(Value::Null, |value| json!(value))
}
fn number_float(value: Option<&Value>, key: &str) -> Option<f64> {
    object(value)?.get(key)?.as_f64()
}
fn bool_field(value: Option<&Value>, key: &str, fallback: bool) -> bool {
    object(value)
        .and_then(|map| map.get(key))
        .and_then(Value::as_bool)
        .unwrap_or(fallback)
}
fn sum_field(rows: &[&Value], key: &str) -> u64 {
    rows.iter()
        .map(|row| number_field(Some(row), key).unwrap_or(0))
        .sum()
}
fn add_number(value: &mut Value, key: &str, amount: u64) {
    let Some(object) = value.as_object_mut() else {
        return;
    };
    let number = object.get(key).and_then(Value::as_u64).unwrap_or(0);
    object.insert(key.to_owned(), json!(number + amount));
}
fn add_cost(value: &mut Value, amount: f64) {
    let Some(object) = value.as_object_mut() else {
        return;
    };
    let current = object
        .get("estimatedCostUsd")
        .and_then(Value::as_f64)
        .unwrap_or(0.0);
    object.insert("estimatedCostUsd".to_owned(), json!(current + amount));
}
fn top_key(values: &HashMap<String, u64>) -> Option<&str> {
    values
        .iter()
        .max_by_key(|(_, value)| *value)
        .map(|(key, _)| key.as_str())
}

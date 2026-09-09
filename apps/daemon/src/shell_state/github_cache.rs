use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};

use serde_json::{Map, Value, json};
use thiserror::Error;

use crate::atomic_file_replace;

const FILE_NAME: &str = "yiru-github-cache.json";
const MAX_FILE_BYTES: u64 = 16 * 1024 * 1024;
const MAX_ENTRIES: usize = 10_000;
const MAX_KEY_BYTES: usize = 2_048;

#[derive(Clone)]
pub(super) struct GitHubCacheStore {
    inner: Arc<Inner>,
}

struct Inner {
    path: PathBuf,
    state: Mutex<Value>,
    mutation: Mutex<()>,
}

#[derive(Debug, Error)]
pub(crate) enum GitHubCacheError {
    #[error("github_cache_invalid")]
    Invalid,
    #[error("GitHub cache I/O failed: {0}")]
    Io(#[from] std::io::Error),
    #[error("GitHub cache JSON failed: {0}")]
    Json(#[from] serde_json::Error),
}

impl GitHubCacheStore {
    pub(super) async fn open(user_data_path: &Path) -> Result<Self, GitHubCacheError> {
        let path = user_data_path.join(FILE_NAME);
        let read_path = path.clone();
        let state = tokio::task::spawn_blocking(move || read(&read_path))
            .await
            .map_err(|error| std::io::Error::other(error.to_string()))??;
        Ok(Self {
            inner: Arc::new(Inner {
                path,
                state: Mutex::new(state),
                mutation: Mutex::new(()),
            }),
        })
    }

    pub(super) fn get(&self) -> Value {
        lock(&self.inner.state).clone()
    }

    pub(super) async fn set(&self, value: &Value) -> Result<(), GitHubCacheError> {
        let normalized = normalize(value).ok_or(GitHubCacheError::Invalid)?;
        let payload = serde_json::to_vec(&normalized)?;
        if payload.len() as u64 > MAX_FILE_BYTES {
            return Err(GitHubCacheError::Invalid);
        }
        let inner = self.inner.clone();
        tokio::task::spawn_blocking(move || {
            // Why: concurrent startup callers must publish disk and memory in one order, even if a caller disconnects.
            let _mutation = lock(&inner.mutation);
            write(&inner.path, &payload)?;
            *lock(&inner.state) = normalized;
            Ok::<_, GitHubCacheError>(())
        })
        .await
        .map_err(|error| std::io::Error::other(error.to_string()))?
    }
}

fn read(path: &Path) -> Result<Value, GitHubCacheError> {
    let metadata = match std::fs::metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(empty()),
        Err(error) => return Err(error.into()),
    };
    if !metadata.is_file() || metadata.len() > MAX_FILE_BYTES {
        return Ok(empty());
    }
    let value = match std::fs::read(path)
        .ok()
        .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok())
        .and_then(|value| normalize(&value))
    {
        Some(value) => value,
        None => return Ok(empty()),
    };
    Ok(value)
}

fn normalize(value: &Value) -> Option<Value> {
    let pr = value.get("pr")?.as_object()?;
    if pr.len() > MAX_ENTRIES {
        return None;
    }
    let mut output = Map::new();
    for (key, entry) in pr {
        if key.is_empty() || key.len() > MAX_KEY_BYTES {
            return None;
        }
        let entry = entry.as_object()?;
        let fetched_at = entry.get("fetchedAt")?.as_f64()?;
        if !fetched_at.is_finite() || fetched_at < 0.0 || !entry.contains_key("data") {
            return None;
        }
        output.insert(
            key.clone(),
            json!({ "data": entry.get("data"), "fetchedAt": fetched_at }),
        );
    }
    Some(json!({ "pr": output }))
}

fn write(path: &Path, payload: &[u8]) -> Result<(), GitHubCacheError> {
    let parent = path.parent().ok_or(GitHubCacheError::Invalid)?;
    std::fs::create_dir_all(parent)?;
    static NEXT_TEMPORARY: AtomicU64 = AtomicU64::new(1);
    let temporary = path.with_extension(format!(
        "{}.{}.tmp",
        std::process::id(),
        NEXT_TEMPORARY.fetch_add(1, Ordering::Relaxed)
    ));
    let result = (|| {
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)?;
        file.write_all(payload)?;
        file.sync_all()?;
        drop(file);
        atomic_file_replace::replace(&temporary, path)
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&temporary);
    }
    result.map_err(Into::into)
}

fn empty() -> Value {
    json!({ "pr": {} })
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

mod conflicts;
mod document;
mod model;
mod mutation;
mod path_action;
mod snapshot;
mod syntax;

use std::path::{Path, PathBuf};
use std::sync::Arc;

use serde_json::Value;
use thiserror::Error;
use tokio::sync::Mutex;

use crate::protocol::KeybindingDescriptor;

pub(crate) use model::{DiagnosticSeverity, KeybindingFileSnapshot, KeybindingPlatform};

#[derive(Clone)]
pub(crate) struct KeybindingsAuthority {
    inner: Arc<Inner>,
}

struct Inner {
    definitions: Arc<Vec<KeybindingDescriptor>>,
    path: PathBuf,
    platform: KeybindingPlatform,
    state: Mutex<State>,
}

#[derive(Default)]
struct State {
    snapshot: Option<KeybindingFileSnapshot>,
}

#[derive(Debug, Error)]
pub(crate) enum KeybindingsError {
    #[error("local home directory is unavailable")]
    HomeUnavailable,
    #[error("keybindings worker failed: {0}")]
    Worker(#[from] tokio::task::JoinError),
    #[error("keybindings state file has no parent directory")]
    StoragePath,
    #[error("keybindings I/O failed: {0}")]
    Io(#[from] std::io::Error),
    #[error("keybindings JSON failed: {0}")]
    Json(#[from] serde_json::Error),
    #[error("{0}")]
    Operation(String),
}

impl KeybindingsAuthority {
    pub(crate) async fn open(
        home_path: &Path,
        definitions: Vec<KeybindingDescriptor>,
        legacy_overrides: Option<Value>,
    ) -> Result<Self, KeybindingsError> {
        let path = home_path.join(".yiru").join("keybindings.json");
        let platform = KeybindingPlatform::current();
        let migration_path = path.clone();
        tokio::task::spawn_blocking(move || {
            document::migrate_legacy(&migration_path, platform, legacy_overrides)
        })
        .await??;
        Ok(Self {
            inner: Arc::new(Inner {
                definitions: Arc::new(definitions),
                path,
                platform,
                state: Mutex::new(State::default()),
            }),
        })
    }

    pub(crate) async fn get(&self) -> Result<KeybindingFileSnapshot, KeybindingsError> {
        self.get_inner().await
    }

    pub(crate) async fn reload(&self) -> Result<KeybindingFileSnapshot, KeybindingsError> {
        self.reload_inner().await
    }

    pub(crate) async fn ensure_file(&self) -> Result<KeybindingFileSnapshot, KeybindingsError> {
        self.ensure_file_inner().await
    }

    pub(crate) async fn set_action(
        &self,
        action_id: String,
        bindings: Option<Vec<String>>,
    ) -> Result<KeybindingFileSnapshot, KeybindingsError> {
        self.set_action_inner(action_id, bindings).await
    }

    pub(crate) async fn open_file(
        &self,
        reveal: bool,
    ) -> Result<KeybindingFileSnapshot, KeybindingsError> {
        self.open_file_inner(reveal).await
    }

    async fn get_inner(&self) -> Result<KeybindingFileSnapshot, KeybindingsError> {
        let mut state = self.inner.state.lock().await;
        if let Some(snapshot) = &state.snapshot {
            return Ok(snapshot.clone());
        }
        let snapshot = self.read_blocking().await?;
        state.snapshot = Some(snapshot.clone());
        Ok(snapshot)
    }

    async fn reload_inner(&self) -> Result<KeybindingFileSnapshot, KeybindingsError> {
        let mut state = self.inner.state.lock().await;
        let snapshot = self.read_blocking().await?;
        state.snapshot = Some(snapshot.clone());
        Ok(snapshot)
    }

    async fn ensure_file_inner(&self) -> Result<KeybindingFileSnapshot, KeybindingsError> {
        let mut state = self.inner.state.lock().await;
        let path = self.inner.path.clone();
        let definitions = self.inner.definitions.clone();
        let platform = self.inner.platform;
        let snapshot = tokio::task::spawn_blocking(move || {
            document::ensure(&path)?;
            Ok::<_, KeybindingsError>(snapshot::read(&path, platform, &definitions))
        })
        .await??;
        state.snapshot = Some(snapshot.clone());
        Ok(snapshot)
    }

    async fn set_action_inner(
        &self,
        action_id: String,
        bindings: Option<Vec<String>>,
    ) -> Result<KeybindingFileSnapshot, KeybindingsError> {
        let mut state = self.inner.state.lock().await;
        let path = self.inner.path.clone();
        let definitions = self.inner.definitions.clone();
        let platform = self.inner.platform;
        let snapshot = tokio::task::spawn_blocking(move || {
            mutation::write_override(
                &path,
                platform,
                &definitions,
                &action_id,
                bindings.as_deref(),
            )
        })
        .await??;
        state.snapshot = Some(snapshot.clone());
        Ok(snapshot)
    }

    async fn open_file_inner(
        &self,
        reveal: bool,
    ) -> Result<KeybindingFileSnapshot, KeybindingsError> {
        let mut state = self.inner.state.lock().await;
        let path = self.inner.path.clone();
        let definitions = self.inner.definitions.clone();
        let platform = self.inner.platform;
        let snapshot = tokio::task::spawn_blocking(move || {
            document::ensure(&path)?;
            let snapshot = snapshot::read(&path, platform, &definitions);
            path_action::open(&path, reveal)?;
            Ok::<_, KeybindingsError>(snapshot)
        })
        .await??;
        state.snapshot = Some(snapshot.clone());
        Ok(snapshot)
    }

    async fn read_blocking(&self) -> Result<KeybindingFileSnapshot, KeybindingsError> {
        let path = self.inner.path.clone();
        let definitions = self.inner.definitions.clone();
        let platform = self.inner.platform;
        tokio::task::spawn_blocking(move || snapshot::read(&path, platform, &definitions))
            .await
            .map_err(KeybindingsError::from)
    }
}

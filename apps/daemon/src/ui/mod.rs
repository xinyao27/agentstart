mod defaults;
mod normalize;
mod startup;
mod storage;

use std::path::Path;
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{SystemTime, SystemTimeError, UNIX_EPOCH};

use serde_json::{Map, Value};
use thiserror::Error;

use crate::telemetry::FeatureInteractionTelemetry;

pub(crate) use normalize::FEATURE_INTERACTION_IDS;
use storage::UiPersistence;

#[derive(Clone)]
pub(crate) struct UiAuthority {
    inner: Arc<UiAuthorityInner>,
}

struct UiAuthorityInner {
    feature_telemetry: Mutex<Option<FeatureInteractionTelemetry>>,
    persistence: UiPersistence,
    state: Mutex<UiState>,
}

struct UiState {
    document: Map<String, Value>,
    revision: u64,
}

#[derive(Debug, Error)]
pub(crate) enum UiError {
    #[error("UI state root must be an object")]
    DocumentShape,
    #[error("UI state has no recoverable primary or backup")]
    NoRecoverableState,
    #[error("UI state clock failed: {0}")]
    Clock(#[from] SystemTimeError),
    #[error("UI state persistence worker is unavailable")]
    PersistenceUnavailable,
    #[error("UI state file has no parent directory")]
    StoragePath,
    #[error("UI state timestamp exceeds the supported range")]
    TimestampRange,
    #[error("UI state I/O failed: {0}")]
    Io(#[from] std::io::Error),
    #[error("UI state JSON failed: {0}")]
    Json(#[from] serde_json::Error),
    #[error("UI state worker failed: {0}")]
    Worker(#[from] tokio::task::JoinError),
}

impl UiAuthority {
    pub(crate) async fn open(user_data_path: &Path) -> Result<Self, UiError> {
        let (persistence, document) = UiPersistence::open(user_data_path).await?;
        Ok(Self {
            inner: Arc::new(UiAuthorityInner {
                feature_telemetry: Mutex::new(None),
                persistence,
                state: Mutex::new(UiState {
                    document,
                    revision: 0,
                }),
            }),
        })
    }

    pub(crate) async fn migrate_startup(
        &self,
        settings: &Value,
        has_repositories: bool,
    ) -> Result<(), UiError> {
        {
            let mut state = lock(&self.inner.state);
            let ui = startup::migrate(&state.document, settings, has_repositories);
            if state.document.get("ui") != Some(&Value::Object(ui.clone())) {
                state
                    .document
                    .insert("ui".to_owned(), Value::Object(ui.clone()));
                commit(&self.inner, &mut state, &ui);
            }
        }
        self.flush().await
    }

    pub(crate) fn get(&self) -> Value {
        let state = lock(&self.inner.state);
        Value::Object(normalize::read(state.document.get("ui")))
    }

    pub(crate) fn set(&self, updates: Map<String, Value>) -> Value {
        let mut state = lock(&self.inner.state);
        let (ui, changed) = normalize::apply(state.document.get("ui"), &updates);
        if changed {
            state
                .document
                .insert("ui".to_owned(), Value::Object(ui.clone()));
            commit(&self.inner, &mut state, &ui);
        }
        Value::Object(ui)
    }

    pub(crate) fn get_onboarding(&self) -> Value {
        let state = lock(&self.inner.state);
        super::shell_state::onboarding::read(state.document.get("onboarding"))
    }

    pub(crate) fn update_onboarding(&self, updates: &Value) -> Value {
        let mut state = lock(&self.inner.state);
        let current = super::shell_state::onboarding::read(state.document.get("onboarding"));
        let next = super::shell_state::onboarding::apply(&current, updates);
        if current != next {
            state.document.insert("onboarding".to_owned(), next.clone());
            state.revision = state.revision.saturating_add(1);
            self.inner
                .persistence
                .schedule(state.document.clone(), state.revision);
        }
        next
    }

    pub(crate) fn record_feature_interaction(&self, id: &str) -> Result<Value, UiError> {
        let now_millis = i64::try_from(SystemTime::now().duration_since(UNIX_EPOCH)?.as_millis())
            .map_err(|_| UiError::TimestampRange)?;
        let mut state = lock(&self.inner.state);
        let (ui, telemetry, event) = normalize::record_interaction(
            state.document.get("ui"),
            state.document.get("featureInteractionTelemetryBuckets"),
            id,
            now_millis,
        );
        state
            .document
            .insert("ui".to_owned(), Value::Object(ui.clone()));
        state.document.insert(
            "featureInteractionTelemetryBuckets".to_owned(),
            Value::Object(telemetry),
        );
        commit(&self.inner, &mut state, &ui);
        drop(state);
        if let Some(event) = event
            && let Some(telemetry) = lock(&self.inner.feature_telemetry).clone()
        {
            telemetry.bucket_reached(id.to_owned(), event.bucket, event.source);
        }
        Ok(Value::Object(ui))
    }

    pub(crate) fn connect_feature_interaction_telemetry(
        &self,
        telemetry: FeatureInteractionTelemetry,
    ) {
        *lock(&self.inner.feature_telemetry) = Some(telemetry);
    }

    pub(crate) async fn flush(&self) -> Result<(), UiError> {
        self.inner.persistence.flush().await
    }
}

fn commit(inner: &UiAuthorityInner, state: &mut UiState, _ui: &Map<String, Value>) {
    state.revision = state.revision.saturating_add(1);
    inner
        .persistence
        .schedule(state.document.clone(), state.revision);
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

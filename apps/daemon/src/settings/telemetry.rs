use std::sync::Arc;

use serde_json::{Map, Value};

use super::{SettingsError, SettingsInner, commit};
use crate::identity::random_uuid;
use crate::mutex_lock::lock;

#[derive(Clone)]
pub(crate) struct TelemetryPreferences {
    inner: Arc<SettingsInner>,
}

#[derive(Clone)]
pub(crate) struct TelemetrySettings {
    pub(crate) existed_before_release: bool,
    pub(crate) install_id: String,
    pub(crate) opted_in: Option<bool>,
}

impl TelemetryPreferences {
    pub(super) fn new(inner: Arc<SettingsInner>) -> Self {
        Self { inner }
    }

    pub(crate) fn get(&self) -> TelemetrySettings {
        telemetry_settings(&lock(&self.inner.state).document)
    }

    pub(crate) fn set_opted_in(&self, opted_in: bool) -> Result<(), SettingsError> {
        let mut state = lock(&self.inner.state);
        let mut telemetry = telemetry_object(&state.document);
        telemetry.insert("optedIn".to_owned(), Value::Bool(opted_in));
        state
            .document
            .insert("telemetry".to_owned(), Value::Object(telemetry));
        commit(&self.inner, &mut state, None)
    }
}

pub(super) fn initialize(
    document: &mut Map<String, Value>,
    existed: bool,
) -> Result<(), SettingsError> {
    let mut telemetry = telemetry_object(document);
    let existed_before_release = telemetry
        .get("existedBeforeTelemetryRelease")
        .and_then(Value::as_bool)
        .unwrap_or(existed);
    telemetry.insert(
        "existedBeforeTelemetryRelease".to_owned(),
        Value::Bool(existed_before_release),
    );
    if telemetry
        .get("installId")
        .and_then(Value::as_str)
        .is_none_or(|value| value.is_empty())
    {
        telemetry.insert("installId".to_owned(), Value::String(random_uuid()?));
    }
    if !telemetry.contains_key("optedIn") {
        telemetry.insert(
            "optedIn".to_owned(),
            if existed_before_release {
                Value::Null
            } else {
                Value::Bool(true)
            },
        );
    }
    document.insert("telemetry".to_owned(), Value::Object(telemetry));
    Ok(())
}

fn telemetry_settings(document: &Map<String, Value>) -> TelemetrySettings {
    // Why: a settings document written before the telemetry block existed must read as defaults
    // rather than panic on the settings accessor path.
    let telemetry = document.get("telemetry").and_then(Value::as_object);
    TelemetrySettings {
        existed_before_release: telemetry
            .and_then(|settings| settings.get("existedBeforeTelemetryRelease"))
            .and_then(Value::as_bool)
            .unwrap_or(false),
        install_id: telemetry
            .and_then(|settings| settings.get("installId"))
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_owned(),
        opted_in: telemetry
            .and_then(|settings| settings.get("optedIn"))
            .and_then(Value::as_bool),
    }
}

fn telemetry_object(document: &Map<String, Value>) -> Map<String, Value> {
    document
        .get("telemetry")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default()
}

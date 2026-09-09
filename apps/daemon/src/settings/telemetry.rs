use std::sync::{Arc, Mutex, MutexGuard};

use serde_json::{Map, Value};

use super::{SettingsError, SettingsInner, commit};

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
    let telemetry = document
        .get("telemetry")
        .and_then(Value::as_object)
        .expect("telemetry is initialized");
    TelemetrySettings {
        existed_before_release: telemetry
            .get("existedBeforeTelemetryRelease")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        install_id: telemetry
            .get("installId")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_owned(),
        opted_in: telemetry.get("optedIn").and_then(Value::as_bool),
    }
}

fn telemetry_object(document: &Map<String, Value>) -> Map<String, Value> {
    document
        .get("telemetry")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default()
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

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

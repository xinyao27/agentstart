use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, Instant};

use regex::Regex;
use serde_json::{Map, Value};

const WARN_WINDOW: Duration = Duration::from_secs(60);
const WARN_CACHE_LIMIT: usize = 256;

#[derive(Clone)]
pub(super) struct EventValidator {
    schemas: Arc<Map<String, Value>>,
    warnings: Arc<Mutex<Warnings>>,
}

#[derive(Default)]
struct Warnings {
    order: VecDeque<String>,
    times: HashMap<String, Instant>,
}

impl EventValidator {
    pub(super) fn new() -> Result<Self, serde_json::Error> {
        let root = serde_json::from_str::<Value>(include_str!("event-schemas.json"))?;
        let schemas = root
            .get("properties")
            .and_then(Value::as_object)
            .cloned()
            .unwrap_or_default();
        Ok(Self {
            schemas: Arc::new(schemas),
            warnings: Arc::new(Mutex::new(Warnings::default())),
        })
    }

    pub(super) fn known(&self, name: &str) -> bool {
        self.schemas.contains_key(name)
    }

    pub(super) fn validate(&self, name: &str, props: &Map<String, Value>) -> bool {
        let Some(schema) = self.schemas.get(name) else {
            self.warn(format!("unknown:{name}"), format!("unknown event: {name}"));
            return false;
        };
        let value = Value::Object(props.clone());
        if !validate_schema(schema, &value) || !super::refinements::validate(name, props) {
            self.warn(
                name.to_owned(),
                format!("{name}: payload failed schema validation"),
            );
            return false;
        }
        true
    }

    fn warn(&self, key: String, message: String) {
        let now = Instant::now();
        let mut warnings = lock(&self.warnings);
        while let Some(oldest) = warnings.order.front() {
            if warnings
                .times
                .get(oldest)
                .is_some_and(|at| now.duration_since(*at) < WARN_WINDOW)
            {
                break;
            }
            let oldest = warnings.order.pop_front().expect("front exists");
            warnings.times.remove(&oldest);
        }
        if warnings
            .times
            .get(&key)
            .is_some_and(|at| now.duration_since(*at) < WARN_WINDOW)
        {
            return;
        }
        warnings.times.remove(&key);
        warnings.order.retain(|known| known != &key);
        warnings.times.insert(key.clone(), now);
        warnings.order.push_back(key);
        while warnings.order.len() > WARN_CACHE_LIMIT {
            if let Some(oldest) = warnings.order.pop_front() {
                warnings.times.remove(&oldest);
            }
        }
        eprintln!("[telemetry] {message}");
    }
}

fn validate_schema(schema: &Value, value: &Value) -> bool {
    if schema
        .get("const")
        .is_some_and(|expected| expected != value)
        || schema
            .get("enum")
            .and_then(Value::as_array)
            .is_some_and(|values| !values.contains(value))
    {
        return false;
    }
    match schema.get("type").and_then(Value::as_str) {
        Some("object") => validate_object(schema, value),
        Some("string") => validate_string(schema, value),
        Some("boolean") => value.is_boolean(),
        Some("integer") => validate_number(schema, value, true),
        Some("number") => validate_number(schema, value, false),
        Some(_) => false,
        None => true,
    }
}

fn validate_object(schema: &Value, value: &Value) -> bool {
    let Some(object) = value.as_object() else {
        return false;
    };
    let properties = schema
        .get("properties")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    if schema.get("additionalProperties") == Some(&Value::Bool(false))
        && object.keys().any(|key| !properties.contains_key(key))
    {
        return false;
    }
    if schema
        .get("required")
        .and_then(Value::as_array)
        .is_some_and(|required| {
            required
                .iter()
                .filter_map(Value::as_str)
                .any(|key| !object.contains_key(key))
        })
    {
        return false;
    }
    object.iter().all(|(key, value)| {
        properties
            .get(key)
            .is_none_or(|schema| validate_schema(schema, value))
    })
}

fn validate_string(schema: &Value, value: &Value) -> bool {
    let Some(value) = value.as_str() else {
        return false;
    };
    let length = value.encode_utf16().count() as u64;
    if schema
        .get("minLength")
        .and_then(Value::as_u64)
        .is_some_and(|minimum| length < minimum)
        || schema
            .get("maxLength")
            .and_then(Value::as_u64)
            .is_some_and(|maximum| length > maximum)
    {
        return false;
    }
    schema
        .get("pattern")
        .and_then(Value::as_str)
        .is_none_or(|pattern| Regex::new(pattern).is_ok_and(|pattern| pattern.is_match(value)))
}

fn validate_number(schema: &Value, value: &Value, integer: bool) -> bool {
    let Some(value) = value.as_f64() else {
        return false;
    };
    if !value.is_finite() || integer && value.fract() != 0.0 {
        return false;
    }
    !schema
        .get("minimum")
        .and_then(Value::as_f64)
        .is_some_and(|minimum| value < minimum)
        && !schema
            .get("maximum")
            .and_then(Value::as_f64)
            .is_some_and(|maximum| value > maximum)
        && !schema
            .get("exclusiveMinimum")
            .and_then(Value::as_f64)
            .is_some_and(|minimum| value <= minimum)
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

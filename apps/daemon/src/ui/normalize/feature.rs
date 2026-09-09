use serde_json::{Map, Number, Value, json};

pub(crate) const IDS: &[&str] = &[
    "workspace-agent-sessions",
    "cmd-j",
    "cmd-j-workspace-open",
    "cmd-j-browser-page-open",
    "cmd-j-settings-open",
    "cmd-j-quick-action",
    "cmd-j-create-workspace",
    "browser",
    "browser-tab-created",
    "browser-annotations",
    "browser-annotations-sent-to-agent",
    "browser-grab",
    "markdown-file-created",
    "workspace-creation",
    "agent-browser-setup",
    "agent-browser-use",
    "agent-orchestration-setup",
    "agent-orchestration",
    "mobile-emulator-agent-setup",
    "ai-commit-generation",
    "ai-pr-generation",
    "claude-account-switching",
    "computer-use-setup",
    "computer-use",
    "codex-account-switching",
    "cookie-import",
    "mobile-pairing",
    "notifications",
    "ports",
    "quick-commands",
    "resource-manager",
    "review-notes",
    "terminal-pane-split",
    "terminal-panes",
    "terminal-tabs",
    "tab-splits",
    "usage-tracking",
    "workspace-cleanup",
];

const BUCKETS: &[(&str, u64)] = &[
    ("count_1", 1),
    ("count_2", 2),
    ("count_3_4", 3),
    ("count_5_9", 5),
    ("count_10_19", 10),
    ("count_20_49", 20),
    ("count_50_99", 50),
    ("count_100_199", 100),
    ("count_200_499", 200),
    ("count_500_999", 500),
    ("count_1000_plus", 1_000),
];

pub(crate) struct BucketEvent {
    pub(crate) bucket: String,
    pub(crate) source: String,
}

pub(super) fn interactions(value: Option<&Value>) -> Value {
    let mut normalized = Map::new();
    let Some(input) = value.and_then(Value::as_object) else {
        return Value::Object(normalized);
    };
    for id in IDS {
        if let Some(record) = input.get(*id).and_then(normalize_record) {
            normalized.insert((*id).to_owned(), record);
        }
    }
    Value::Object(normalized)
}

pub(super) fn merge(current: Option<&Value>, incoming: Option<&Value>) -> Value {
    let mut merged = interactions(current)
        .as_object()
        .expect("normalized feature interactions are an object")
        .clone();
    let incoming = interactions(incoming);
    for (id, incoming) in incoming
        .as_object()
        .expect("normalized feature interactions are an object")
    {
        let Some(current) = merged.get(id) else {
            merged.insert(id.clone(), incoming.clone());
            continue;
        };
        let current = current
            .as_object()
            .expect("normalized interaction is an object");
        let incoming = incoming
            .as_object()
            .expect("normalized interaction is an object");
        let first = current["firstInteractedAt"]
            .as_f64()
            .expect("normalized timestamp is a number")
            .min(
                incoming["firstInteractedAt"]
                    .as_f64()
                    .expect("normalized timestamp is a number"),
            );
        let count = interaction_count(current).max(interaction_count(incoming));
        merged.insert(id.clone(), record(first, count));
    }
    Value::Object(merged)
}

pub(super) fn record_interaction(
    interactions_value: Option<&Value>,
    telemetry_value: Option<&Value>,
    id: &str,
    now_millis: i64,
) -> (Value, Value, Option<BucketEvent>) {
    let mut interactions = interactions(interactions_value)
        .as_object()
        .expect("normalized feature interactions are an object")
        .clone();
    let existing = interactions.get(id).and_then(Value::as_object);
    let previous_count = existing.map_or(0, interaction_count);
    let next_count = previous_count.saturating_add(1);
    let first = existing
        .and_then(|record| record.get("firstInteractedAt"))
        .and_then(Value::as_f64)
        .unwrap_or(now_millis as f64);
    interactions.insert(id.to_owned(), record(first, next_count));

    let mut telemetry = telemetry_buckets(telemetry_value);
    let mut event = None;
    if let Some(next_bucket) = usage_bucket(next_count) {
        let previous_bucket = usage_bucket(previous_count);
        let observed_existing = telemetry.get(id).and_then(Value::as_str).is_none()
            && previous_bucket == Some(next_bucket);
        let should_update = telemetry
            .get(id)
            .and_then(Value::as_str)
            .is_none_or(|last| bucket_index(next_bucket) > bucket_index(last));
        if should_update {
            telemetry.insert(id.to_owned(), Value::String(next_bucket.to_owned()));
            event = Some(BucketEvent {
                bucket: next_bucket.to_owned(),
                source: if observed_existing {
                    "observed_existing".to_owned()
                } else {
                    "crossed_now".to_owned()
                },
            });
        }
    }
    (Value::Object(interactions), Value::Object(telemetry), event)
}

pub(super) fn telemetry_buckets(value: Option<&Value>) -> Map<String, Value> {
    let mut normalized = Map::new();
    let Some(input) = value.and_then(Value::as_object) else {
        return normalized;
    };
    for id in IDS {
        if let Some(bucket) = input.get(*id).and_then(Value::as_str)
            && BUCKETS.iter().any(|(known, _)| bucket == *known)
        {
            normalized.insert((*id).to_owned(), Value::String(bucket.to_owned()));
        }
    }
    normalized
}

fn normalize_record(value: &Value) -> Option<Value> {
    let object = value.as_object()?;
    let first = object.get("firstInteractedAt")?.as_f64()?;
    if first < 0.0 {
        return None;
    }
    let count = object
        .get("interactionCount")
        .and_then(positive_integer)
        .unwrap_or(1);
    Some(record(first, count))
}

fn positive_integer(value: &Value) -> Option<u64> {
    value.as_u64().filter(|value| *value > 0).or_else(|| {
        value
            .as_f64()
            .filter(|value| value.fract() == 0.0 && *value > 0.0 && *value <= u64::MAX as f64)
            .map(|value| value as u64)
    })
}

fn interaction_count(record: &Map<String, Value>) -> u64 {
    record
        .get("interactionCount")
        .and_then(positive_integer)
        .unwrap_or(1)
}

fn record(first: f64, count: u64) -> Value {
    json!({
        "firstInteractedAt": Number::from_f64(first)
            .map(Value::Number)
            .expect("normalized timestamp is finite"),
        "interactionCount": count
    })
}

fn usage_bucket(count: u64) -> Option<&'static str> {
    BUCKETS
        .iter()
        .filter(|(_, minimum)| count >= *minimum)
        .map(|(bucket, _)| *bucket)
        .next_back()
}

fn bucket_index(bucket: &str) -> isize {
    BUCKETS
        .iter()
        .position(|(known, _)| *known == bucket)
        .map_or(-1, |index| index as isize)
}

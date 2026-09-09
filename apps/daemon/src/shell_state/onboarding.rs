use serde_json::{Map, Value, json};

const FLOW_VERSION: i64 = 4;
const FINAL_STEP: i64 = 5;
const CHECKLIST_KEYS: &[&str] = &[
    "addedRepo",
    "choseAgent",
    "ranFirstAgent",
    "ranSecondAgentOnSameTask",
    "triedCmdJ",
    "shapedSidebar",
    "reviewedDiff",
    "openedPr",
    "addedFolder",
    "openedFile",
    "ranAgentOnFile",
    "dismissed",
];

pub(crate) fn read(value: Option<&Value>) -> Value {
    let defaults = defaults();
    let Some(raw) = value.and_then(Value::as_object) else {
        return defaults;
    };
    let sanitized = sanitize(raw, true);
    merge(&defaults, &Value::Object(sanitized))
}

pub(crate) fn apply(current: &Value, update: &Value) -> Value {
    let Some(raw) = update.as_object() else {
        return current.clone();
    };
    merge(current, &Value::Object(sanitize(raw, false)))
}

fn defaults() -> Value {
    json!({
        "flowVersion": FLOW_VERSION,
        "closedAt": null,
        "outcome": null,
        "lastCompletedStep": -1,
        "checklist": CHECKLIST_KEYS
            .iter()
            .map(|key| ((*key).to_owned(), Value::Bool(false)))
            .collect::<Map<_, _>>()
    })
}

fn sanitize(raw: &Map<String, Value>, migrate: bool) -> Map<String, Value> {
    let mut output = Map::new();
    if let Some(value) = raw.get("closedAt")
        && (value.is_null()
            || value
                .as_f64()
                .is_some_and(|value| value.is_finite() && value >= 0.0))
    {
        output.insert("closedAt".to_owned(), value.clone());
    }
    if let Some(value) = raw.get("outcome")
        && (value.is_null() || matches!(value.as_str(), Some("completed" | "dismissed")))
    {
        output.insert("outcome".to_owned(), value.clone());
    }
    if let Some(version) = raw.get("flowVersion").and_then(Value::as_i64)
        && (1..=FLOW_VERSION).contains(&version)
    {
        output.insert("flowVersion".to_owned(), Value::from(version));
    }
    if let Some(step) = raw.get("lastCompletedStep").and_then(Value::as_i64)
        && step >= -1
    {
        let step =
            if migrate && raw.get("flowVersion").and_then(Value::as_i64) != Some(FLOW_VERSION) {
                remap_progress(step, raw)
            } else {
                step
            };
        if step <= FINAL_STEP {
            output.insert("lastCompletedStep".to_owned(), Value::from(step));
        }
    }
    if let Some(checklist) = raw.get("checklist").and_then(Value::as_object) {
        let checklist = CHECKLIST_KEYS
            .iter()
            .filter_map(|key| {
                checklist
                    .get(*key)
                    .and_then(Value::as_bool)
                    .map(|value| ((*key).to_owned(), Value::Bool(value)))
            })
            .collect();
        output.insert("checklist".to_owned(), Value::Object(checklist));
    }
    if migrate {
        output.insert("flowVersion".to_owned(), Value::from(FLOW_VERSION));
    }
    output
}

fn remap_progress(step: i64, raw: &Map<String, Value>) -> i64 {
    if raw.get("outcome").and_then(Value::as_str) == Some("completed") && step >= 4 {
        return FINAL_STEP;
    }
    match raw.get("flowVersion").and_then(Value::as_i64) {
        Some(3) => step.min(4),
        Some(2) if step == 3 => 2,
        Some(2) if step >= 4 => 3,
        Some(2) => step,
        _ if matches!(step, 3 | 4) => 2,
        _ if step >= 5 => 3,
        _ => step,
    }
}

fn merge(current: &Value, update: &Value) -> Value {
    let mut next = current.as_object().cloned().unwrap_or_default();
    let Some(update) = update.as_object() else {
        return Value::Object(next);
    };
    for (key, value) in update {
        if key != "checklist" {
            next.insert(key.clone(), value.clone());
        }
    }
    if let Some(update) = update.get("checklist").and_then(Value::as_object) {
        let mut checklist = next
            .get("checklist")
            .and_then(Value::as_object)
            .cloned()
            .unwrap_or_default();
        checklist.extend(update.clone());
        next.insert("checklist".to_owned(), Value::Object(checklist));
    }
    Value::Object(next)
}

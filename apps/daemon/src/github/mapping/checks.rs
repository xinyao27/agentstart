use serde_json::{Value, json};

pub(super) fn summary(raw: &Value) -> Value {
    let values = raw.as_array().map(Vec::as_slice).unwrap_or_default();
    let mut passed = 0;
    let mut failed = 0;
    let mut pending = 0;
    for value in values {
        let conclusion = value
            .get("conclusion")
            .or_else(|| value.get("state"))
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_ascii_uppercase();
        if ["SUCCESS", "NEUTRAL", "SKIPPED"].contains(&conclusion.as_str()) {
            passed += 1;
        } else if [
            "FAILURE",
            "ERROR",
            "TIMED_OUT",
            "CANCELLED",
            "ACTION_REQUIRED",
            "STARTUP_FAILURE",
        ]
        .contains(&conclusion.as_str())
        {
            failed += 1;
        } else {
            pending += 1;
        }
    }
    let state = if failed > 0 {
        "failure"
    } else if pending > 0 {
        "pending"
    } else if values.is_empty() {
        "none"
    } else {
        "success"
    };
    json!({
        "state": state,
        "total": values.len(),
        "passed": passed,
        "failed": failed,
        "pending": pending
    })
}

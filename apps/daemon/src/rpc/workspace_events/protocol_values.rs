use serde_json::{Map, Number, Value, json};
use yiru_protocol::runtime::v1::workspace_event_value::Value as ProtocolValue;
use yiru_protocol::runtime::v1::{
    WorkspaceEvent as ProtocolWorkspaceEvent, WorkspaceEventPayloadEntry, WorkspaceEventValue,
};

use crate::persistence::WorkspaceEvent;

pub(crate) fn protocol_event(event: WorkspaceEvent) -> ProtocolWorkspaceEvent {
    ProtocolWorkspaceEvent {
        id: event.id,
        kind: event.kind,
        occurred_at: event.occurred_at,
        payload: event
            .payload
            .into_iter()
            .map(|(key, value)| WorkspaceEventPayloadEntry {
                key,
                value: Some(WorkspaceEventValue {
                    value: protocol_payload_value(value),
                }),
            })
            .collect(),
        revision: event.revision,
        scope: event.scope,
    }
}

/// Rebuild the journal event exactly as the workbench and the CLI print it:
/// the same key order, and the same JSON scalar shapes the retained daemon emits.
pub(crate) fn event_value(event: ProtocolWorkspaceEvent) -> Value {
    let mut payload = Map::new();
    for entry in event.payload {
        payload.insert(entry.key, payload_value(entry.value));
    }
    json!({
        "id": event.id,
        "kind": event.kind,
        "occurredAt": event.occurred_at,
        "payload": Value::Object(payload),
        "revision": event.revision,
        "scope": event.scope
    })
}

fn protocol_payload_value(value: Value) -> Option<ProtocolValue> {
    match value {
        Value::Bool(value) => Some(ProtocolValue::Boolean(value)),
        Value::Number(value) => value.as_f64().map(ProtocolValue::Number),
        Value::String(value) => Some(ProtocolValue::Text(value)),
        // Why: the journal keeps only JSON scalars, and an absent protocol value
        // is the null it stored.
        Value::Null | Value::Array(_) | Value::Object(_) => None,
    }
}

fn payload_value(value: Option<WorkspaceEventValue>) -> Value {
    match value.and_then(|value| value.value) {
        Some(ProtocolValue::Boolean(value)) => Value::Bool(value),
        Some(ProtocolValue::Number(value)) => number_value(value),
        Some(ProtocolValue::Text(value)) => Value::String(value),
        None => Value::Null,
    }
}

// Why: the journal's numbers come from JavaScript, where an integral double
// serializes without a fractional part. Emitting `1` rather than `1.0` keeps
// the printed event identical to the retained daemon's.
fn number_value(value: f64) -> Value {
    if value.fract() == 0.0 && (-9_007_199_254_740_992.0..=9_007_199_254_740_992.0).contains(&value)
    {
        return Value::Number(Number::from(value as i64));
    }
    Number::from_f64(value).map_or(Value::Null, Value::Number)
}

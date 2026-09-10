// Why: the WorkspaceSession document is schema-open, so both wire directions
// convert between `serde_json::Value` and the typed recursive JSON value here —
// the single encoding boundary for the session payload.
use agentstart_protocol::runtime::v1::shell_session_json_value::Kind as JsonKind;
use agentstart_protocol::runtime::v1::{
    ShellSessionJsonNull, ShellSessionJsonValue, ShellSessionJsonValueEntry,
    ShellSessionJsonValueList, ShellSessionJsonValueObject,
};
use serde_json::{Map, Value};

pub(in crate::rpc) fn session_value(session: &Value) -> ShellSessionJsonValue {
    json_value(session)
}

pub(in crate::rpc) fn json_from_value(value: &ShellSessionJsonValue) -> Value {
    match value.kind.as_ref() {
        Some(JsonKind::BoolValue(value)) => Value::Bool(*value),
        Some(JsonKind::NumberValue(value)) => {
            // Why: serde_json rejects non-finite doubles, so a NaN payload from
            // a broken caller degrades to null exactly as the legacy JSON
            // transport could never have received one.
            serde_json::Number::from_f64(*value).map_or(Value::Null, Value::Number)
        }
        Some(JsonKind::StringValue(value)) => Value::String(value.clone()),
        Some(JsonKind::ListValue(list)) => {
            Value::Array(list.values.iter().map(json_from_value).collect::<Vec<_>>())
        }
        Some(JsonKind::ObjectValue(object)) => Value::Object(
            object
                .entries
                .iter()
                .map(|entry| {
                    (
                        entry.key.clone(),
                        entry
                            .value
                            .as_ref()
                            .map(json_from_value)
                            .unwrap_or(Value::Null),
                    )
                })
                .collect::<Map<String, Value>>(),
        ),
        // Why: an unset value and an explicit null both mean JSON null on the
        // legacy surface, so they decode identically.
        Some(JsonKind::NullValue(_)) | None => Value::Null,
    }
}

fn json_value(value: &Value) -> ShellSessionJsonValue {
    ShellSessionJsonValue {
        kind: Some(match value {
            Value::Null => JsonKind::NullValue(ShellSessionJsonNull::Value as i32),
            Value::Bool(value) => JsonKind::BoolValue(*value),
            Value::Number(value) => JsonKind::NumberValue(value.as_f64().unwrap_or_default()),
            Value::String(value) => JsonKind::StringValue(value.clone()),
            Value::Array(values) => JsonKind::ListValue(ShellSessionJsonValueList {
                values: values.iter().map(json_value).collect(),
            }),
            Value::Object(object) => JsonKind::ObjectValue(ShellSessionJsonValueObject {
                entries: object
                    .iter()
                    .map(|(key, value)| ShellSessionJsonValueEntry {
                        key: key.clone(),
                        value: Some(json_value(value)),
                    })
                    .collect(),
            }),
        }),
    }
}

use serde_json::{Map, Value};
use yiru_protocol::protocol::v1::{Status, StatusCode};
use yiru_protocol::runtime::v1::ui_json_value::Kind as JsonKind;
use yiru_protocol::runtime::v1::{
    UiDocument, UiJsonNull, UiJsonValue, UiJsonValueEntry, UiJsonValueList, UiJsonValueObject,
    UiServiceGetRequest, UiServiceGetResponse, UiServiceRecordFeatureInteractionRequest,
    UiServiceSetRequest, UiServiceSetResponse,
};
use yiru_protocol::transport::{decode, encode};

use super::UiRpc;
use super::input::{UiInputFailure, parse_feature_id, parse_set};

pub(in crate::rpc) async fn get(rpc: &UiRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    decode::<UiServiceGetRequest>(payload)?;
    Ok(encode(&UiServiceGetResponse {
        ui: Some(protocol_document(rpc.get_document())),
    }))
}

pub(in crate::rpc) async fn set(rpc: &UiRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<UiServiceSetRequest>(payload)?;
    let updates = update_map(request.fields);
    let parsed = parse_set(Some(&updates)).map_err(input_status)?;
    let ui = rpc.set_document(parsed).map_err(state_status)?;
    Ok(encode(&UiServiceSetResponse {
        ui: Some(protocol_document(ui)),
    }))
}

pub(in crate::rpc) async fn record_feature_interaction(
    rpc: &UiRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<UiServiceRecordFeatureInteractionRequest>(payload)?;
    let id = parse_feature_id(Some(request.feature_id.as_str())).map_err(input_status)?;
    let ui = rpc.record_feature_interaction(&id).map_err(state_status)?;
    Ok(encode(&UiServiceSetResponse {
        ui: Some(protocol_document(ui)),
    }))
}

fn update_map(fields: Vec<UiJsonValueEntry>) -> Value {
    Value::Object(
        fields
            .into_iter()
            .map(|entry| {
                (
                    entry.key,
                    entry.value.map(json_value).unwrap_or(Value::Null),
                )
            })
            .collect::<Map<String, Value>>(),
    )
}

fn protocol_document(document: Value) -> UiDocument {
    UiDocument {
        fields: match document {
            Value::Object(object) => object
                .into_iter()
                .map(|(key, value)| UiJsonValueEntry {
                    key,
                    value: Some(protocol_value(value)),
                })
                .collect(),
            _ => Vec::new(),
        },
    }
}

fn protocol_value(value: Value) -> UiJsonValue {
    let kind = match value {
        Value::Null => JsonKind::NullValue(UiJsonNull::Value as i32),
        Value::Bool(value) => JsonKind::BoolValue(value),
        Value::Number(value) => JsonKind::NumberValue(value.as_f64().unwrap_or_default()),
        Value::String(value) => JsonKind::StringValue(value),
        Value::Array(values) => JsonKind::ListValue(UiJsonValueList {
            values: values.into_iter().map(protocol_value).collect(),
        }),
        Value::Object(object) => JsonKind::ObjectValue(UiJsonValueObject {
            entries: object
                .into_iter()
                .map(|(key, value)| UiJsonValueEntry {
                    key,
                    value: Some(protocol_value(value)),
                })
                .collect(),
        }),
    };
    UiJsonValue { kind: Some(kind) }
}

fn json_value(value: UiJsonValue) -> Value {
    match value.kind {
        Some(JsonKind::NullValue(_)) | None => Value::Null,
        Some(JsonKind::BoolValue(value)) => Value::Bool(value),
        Some(JsonKind::NumberValue(value)) => {
            serde_json::Number::from_f64(value).map_or(Value::Null, Value::Number)
        }
        Some(JsonKind::StringValue(value)) => Value::String(value),
        Some(JsonKind::ListValue(value)) => {
            Value::Array(value.values.into_iter().map(json_value).collect())
        }
        Some(JsonKind::ObjectValue(value)) => Value::Object(
            value
                .entries
                .into_iter()
                .map(|entry| {
                    (
                        entry.key,
                        entry.value.map(json_value).unwrap_or(Value::Null),
                    )
                })
                .collect(),
        ),
    }
}

fn input_status(failure: UiInputFailure) -> Status {
    // Why: the legacy UI verbs rejected strict-update violations with the
    // Zod-issue 400 envelope, so the protobuf surface keeps that rejection
    // class instead of normalizing silently.
    status(StatusCode::InvalidArgument, &failure.to_string())
}

fn state_status(_: crate::ui::UiError) -> Status {
    status(StatusCode::Internal, "UI state persistence worker failed")
}

fn status(code: StatusCode, message: &str) -> Status {
    Status {
        code: code as i32,
        message: message.to_owned(),
        details: Vec::new(),
    }
}

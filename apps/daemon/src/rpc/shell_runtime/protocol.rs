use agentstart_protocol::protocol::v1::{Status, StatusCode};
use agentstart_protocol::runtime::v1::shell_runtime_json_value::Kind as JsonKind;
use agentstart_protocol::runtime::v1::{
    ShellRuntimeJsonValue, ShellRuntimeServiceSyncWindowGraphRequest,
};
use agentstart_protocol::transport::{decode, encode};

use crate::protocol::CallerClass;
use crate::rpc::status::protocol_status_response;

use super::ShellRuntimeRpc;

pub(in crate::rpc) async fn sync_window_graph(
    rpc: &ShellRuntimeRpc,
    payload: &[u8],
    connection_id: &str,
) -> Result<Vec<u8>, Status> {
    let request = decode::<ShellRuntimeServiceSyncWindowGraphRequest>(payload)?;
    let graph = request
        .graph
        .ok_or_else(|| invalid_argument("The window graph is required"))?;
    let graph = json_value(&graph);
    let projection = crate::session_tabs::validation::renderer_projection(Some(&graph))
        .map_err(|error| invalid_argument(&format!("Invalid input: {}", error.path)))?;
    rpc.session_tabs
        .sync_renderer(connection_id, projection)
        .await
        .map_err(super::super::session_tabs::protocol::tabs_status)?;
    Ok(encode(&protocol_status_response(
        &rpc.status,
        CallerClass::Local,
    )?))
}

fn json_value(value: &ShellRuntimeJsonValue) -> serde_json::Value {
    match &value.kind {
        Some(JsonKind::NullValue(_)) | None => serde_json::Value::Null,
        Some(JsonKind::BoolValue(value)) => serde_json::Value::Bool(*value),
        Some(JsonKind::NumberValue(value)) => serde_json::Number::from_f64(*value)
            .map_or(serde_json::Value::Null, |number| {
                serde_json::Value::Number(number)
            }),
        Some(JsonKind::StringValue(value)) => serde_json::Value::String(value.clone()),
        Some(JsonKind::ListValue(value)) => {
            serde_json::Value::Array(value.values.iter().map(json_value).collect())
        }
        Some(JsonKind::ObjectValue(value)) => serde_json::Value::Object(
            value
                .entries
                .iter()
                .filter_map(|entry| {
                    entry
                        .value
                        .as_ref()
                        .map(|value| (entry.key.clone(), json_value(value)))
                })
                .collect(),
        ),
    }
}

fn invalid_argument(message: &str) -> Status {
    status(StatusCode::InvalidArgument, message)
}

fn status(code: StatusCode, message: &str) -> Status {
    Status {
        code: code as i32,
        message: message.to_owned(),
        details: Vec::new(),
    }
}

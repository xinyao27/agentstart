use serde_json::{Map, Value, json};
use yiru_protocol::protocol::v1::{Status, StatusCode};
use yiru_protocol::runtime::v1::shell_telemetry_json_value::Kind as JsonKind;
use yiru_protocol::runtime::v1::{
    ShellTelemetryConsentState, ShellTelemetryJsonValue,
    ShellTelemetryServiceAcknowledgeBannerRequest, ShellTelemetryServiceConsentStateResponse,
    ShellTelemetryServiceGetConsentStateRequest, ShellTelemetryServiceMutatedResponse,
    ShellTelemetryServiceSetOptInRequest, ShellTelemetryServiceTrackRequest,
};
use yiru_protocol::transport::{decode, encode};

use crate::telemetry::{ConsentDisabledReason, ConsentState, TelemetryError};

use super::ShellTelemetryRpc;
use super::input::{parse_set_opt_in, parse_track};

pub(in crate::rpc) async fn track(
    rpc: &ShellTelemetryRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<ShellTelemetryServiceTrackRequest>(payload)?;
    // Why: the typed request renders into the legacy JSON input shape and
    // reuses the legacy parser, so the strict event/property validation and
    // its Zod-compatible issue reporting have exactly one owner.
    let mut props = Map::new();
    for entry in request.props {
        props.insert(
            entry.key,
            entry
                .value
                .as_ref()
                .map(json_from_value)
                .unwrap_or(Value::Null),
        );
    }
    let input = parse_track(Some(&json!({ "name": request.name, "props": props })))
        .map_err(|_| status(StatusCode::InvalidArgument, "Input validation failed"))?;
    rpc.authority.track_shell(input.name, input.props).await;
    Ok(encode(&ShellTelemetryServiceMutatedResponse {}))
}

pub(in crate::rpc) async fn get_consent_state(
    rpc: &ShellTelemetryRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    decode::<ShellTelemetryServiceGetConsentStateRequest>(payload)?;
    let consent = rpc.authority.consent_state();
    Ok(encode(&ShellTelemetryServiceConsentStateResponse {
        state: protocol_consent(consent) as i32,
    }))
}

pub(in crate::rpc) async fn set_opt_in(
    rpc: &ShellTelemetryRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<ShellTelemetryServiceSetOptInRequest>(payload)?;
    let opted_in =
        parse_set_opt_in(Some(&json!({ "optedIn": request.opted_in }))).map_err(input_status)?;
    rpc.authority
        .set_opt_in(opted_in)
        .await
        .map_err(state_status)?;
    Ok(encode(&ShellTelemetryServiceMutatedResponse {}))
}

pub(in crate::rpc) async fn acknowledge_banner(
    rpc: &ShellTelemetryRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    decode::<ShellTelemetryServiceAcknowledgeBannerRequest>(payload)?;
    rpc.authority
        .acknowledge_banner()
        .await
        .map_err(state_status)?;
    Ok(encode(&ShellTelemetryServiceMutatedResponse {}))
}

fn protocol_consent(consent: ConsentState) -> ShellTelemetryConsentState {
    match consent {
        ConsentState::Enabled => ShellTelemetryConsentState::Enabled,
        ConsentState::PendingBanner => ShellTelemetryConsentState::PendingBanner,
        ConsentState::Disabled { reason } => match reason {
            ConsentDisabledReason::DoNotTrack => ShellTelemetryConsentState::DisabledDoNotTrack,
            ConsentDisabledReason::YiruDisabled => ShellTelemetryConsentState::DisabledYiruDisabled,
            ConsentDisabledReason::Ci => ShellTelemetryConsentState::DisabledCi,
            ConsentDisabledReason::UserOptOut => ShellTelemetryConsentState::DisabledUserOptOut,
        },
    }
}

fn json_from_value(value: &ShellTelemetryJsonValue) -> Value {
    match value.kind.as_ref() {
        Some(JsonKind::BoolValue(value)) => Value::Bool(*value),
        Some(JsonKind::NumberValue(value)) => {
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
        Some(JsonKind::NullValue(_)) | None => Value::Null,
    }
}

fn input_status(_error: super::input::TelemetryInputFailure) -> Status {
    status(StatusCode::InvalidArgument, "Input validation failed")
}

fn state_status(error: TelemetryError) -> Status {
    status(StatusCode::Internal, &error.to_string())
}

fn status(code: StatusCode, message: &str) -> Status {
    Status {
        code: code as i32,
        message: message.to_owned(),
        details: Vec::new(),
    }
}

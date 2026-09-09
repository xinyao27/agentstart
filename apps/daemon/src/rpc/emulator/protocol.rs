use std::time::{Duration, Instant};

use yiru_protocol::protocol::v1::{Status, StatusCode};
use yiru_protocol::runtime::v1::emulator_service_stream_frames_response::Event;
use yiru_protocol::runtime::v1::{
    EmulatorDeviceInfo, EmulatorGesturePointKind, EmulatorHelperStatus, EmulatorOrientation,
    EmulatorServiceAttachRequest, EmulatorServiceAttachResponse,
    EmulatorServiceAvailabilityRequest, EmulatorServiceAvailabilityResponse,
    EmulatorServiceButtonRequest, EmulatorServiceExecRequest, EmulatorServiceExecResponse,
    EmulatorServiceGestureRequest, EmulatorServiceKillRequest, EmulatorServiceKillResponse,
    EmulatorServiceListRequest, EmulatorServiceListResponse, EmulatorServiceListSimulatorsRequest,
    EmulatorServiceListSimulatorsResponse, EmulatorServiceOkResponse, EmulatorServiceRotateRequest,
    EmulatorServiceShutdownRequest, EmulatorServiceShutdownResponse,
    EmulatorServiceStreamFramesRequest, EmulatorServiceStreamFramesResponse,
    EmulatorServiceTapRequest, EmulatorServiceTypeTextRequest,
    EmulatorServiceUnregisterActiveRequest, EmulatorServiceUnregisterActiveResponse,
    EmulatorStreamError, EmulatorStreamFrame,
};
use yiru_protocol::transport::{decode, encode};

use crate::emulator::{EmulatorError, GesturePoint, GesturePointKind, extract_frames, stream_url};
use crate::rpc::protocol_call::ProtocolCallContext;

use super::EmulatorRpc;
use super::protocol_values::{device_info, json_value, session_info};

pub(in crate::rpc) async fn list(rpc: &EmulatorRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    decode::<EmulatorServiceListRequest>(payload)?;
    let sessions = rpc
        .authority
        .list_sessions()
        .await
        .map_err(emulator_status)?;
    Ok(encode(&EmulatorServiceListResponse {
        sessions: Some(json_value(&sessions)),
    }))
}

pub(in crate::rpc) async fn attach(rpc: &EmulatorRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<EmulatorServiceAttachRequest>(payload)?;
    let target = request.target.unwrap_or_default();
    let outcome = rpc
        .authority
        .attach(target.worktree.as_deref(), target.device.as_deref())
        .await
        .map_err(emulator_status)?;
    Ok(encode(&EmulatorServiceAttachResponse {
        attached: outcome.attached,
        info: Some(session_info(outcome.info)),
    }))
}

pub(in crate::rpc) async fn tap(rpc: &EmulatorRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<EmulatorServiceTapRequest>(payload)?;
    let target = request.target.unwrap_or_default();
    rpc.authority
        .tap(
            request.x,
            request.y,
            target.device.as_deref(),
            target.worktree.as_deref(),
        )
        .await
        .map_err(emulator_status)?;
    Ok(encode(&EmulatorServiceOkResponse { ok: true }))
}

pub(in crate::rpc) async fn gesture(rpc: &EmulatorRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<EmulatorServiceGestureRequest>(payload)?;
    let target = request.target.unwrap_or_default();
    let points = request
        .points
        .into_iter()
        .map(gesture_point)
        .collect::<Result<Vec<_>, Status>>()?;
    rpc.authority
        .gesture(
            &points,
            target.device.as_deref(),
            target.worktree.as_deref(),
        )
        .await
        .map_err(emulator_status)?;
    Ok(encode(&EmulatorServiceOkResponse { ok: true }))
}

pub(in crate::rpc) async fn type_text(
    rpc: &EmulatorRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<EmulatorServiceTypeTextRequest>(payload)?;
    let target = request.target.unwrap_or_default();
    rpc.authority
        .text_action(
            "type",
            &request.text,
            target.device.as_deref(),
            target.worktree.as_deref(),
        )
        .await
        .map_err(emulator_status)?;
    Ok(encode(&EmulatorServiceOkResponse { ok: true }))
}

pub(in crate::rpc) async fn button(rpc: &EmulatorRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<EmulatorServiceButtonRequest>(payload)?;
    let target = request.target.unwrap_or_default();
    rpc.authority
        .text_action(
            "button",
            &request.name,
            target.device.as_deref(),
            target.worktree.as_deref(),
        )
        .await
        .map_err(emulator_status)?;
    Ok(encode(&EmulatorServiceOkResponse { ok: true }))
}

pub(in crate::rpc) async fn rotate(rpc: &EmulatorRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<EmulatorServiceRotateRequest>(payload)?;
    let target = request.target.unwrap_or_default();
    let orientation = match EmulatorOrientation::try_from(request.orientation) {
        Ok(EmulatorOrientation::Portrait) => "portrait",
        Ok(EmulatorOrientation::PortraitUpsideDown) => "portrait_upside_down",
        Ok(EmulatorOrientation::LandscapeLeft) => "landscape_left",
        Ok(EmulatorOrientation::LandscapeRight) => "landscape_right",
        _ => {
            return Err(status(
                StatusCode::InvalidArgument,
                "Invalid simulator orientation",
            ));
        }
    };
    rpc.authority
        .text_action(
            "rotate",
            orientation,
            target.device.as_deref(),
            target.worktree.as_deref(),
        )
        .await
        .map_err(emulator_status)?;
    Ok(encode(&EmulatorServiceOkResponse { ok: true }))
}

pub(in crate::rpc) async fn exec(rpc: &EmulatorRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<EmulatorServiceExecRequest>(payload)?;
    let target = request.target.unwrap_or_default();
    let result = rpc
        .authority
        .exec(
            &request.command,
            target.device.as_deref(),
            target.worktree.as_deref(),
        )
        .await
        .map_err(emulator_status)?;
    Ok(encode(&EmulatorServiceExecResponse {
        result: Some(json_value(&result)),
    }))
}

pub(in crate::rpc) async fn kill(rpc: &EmulatorRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<EmulatorServiceKillRequest>(payload)?;
    let target = request.target.unwrap_or_default();
    let outcome = rpc
        .authority
        .stop(
            target.worktree.as_deref(),
            target.device.as_deref(),
            request.managed_only,
            false,
        )
        .await
        .map_err(emulator_status)?;
    Ok(encode(&EmulatorServiceKillResponse {
        ok: true,
        device_udid: outcome.device_udid,
    }))
}

pub(in crate::rpc) async fn shutdown(rpc: &EmulatorRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<EmulatorServiceShutdownRequest>(payload)?;
    let target = request.target.unwrap_or_default();
    let outcome = rpc
        .authority
        .stop(
            target.worktree.as_deref(),
            target.device.as_deref(),
            request.managed_only,
            true,
        )
        .await
        .map_err(emulator_status)?;
    Ok(encode(&EmulatorServiceShutdownResponse {
        ok: true,
        device_udid: outcome.device_udid,
    }))
}

pub(in crate::rpc) async fn list_simulators(
    rpc: &EmulatorRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    decode::<EmulatorServiceListSimulatorsRequest>(payload)?;
    let devices = rpc
        .authority
        .list_simulators()
        .await
        .map_err(emulator_status)?;
    Ok(encode(&EmulatorServiceListSimulatorsResponse {
        devices: devices
            .iter()
            .map(device_info)
            .collect::<Vec<EmulatorDeviceInfo>>(),
    }))
}

pub(in crate::rpc) async fn availability(
    rpc: &EmulatorRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    decode::<EmulatorServiceAvailabilityRequest>(payload)?;
    let availability = rpc.authority.availability().await;
    Ok(encode(&EmulatorServiceAvailabilityResponse {
        platform: availability.platform.to_owned(),
        available: availability.available,
        devices: availability.devices.iter().map(device_info).collect(),
        simctl: Some(EmulatorHelperStatus {
            ok: availability.simctl_ok,
            message: availability.simctl_message,
        }),
        serve_sim: Some(EmulatorHelperStatus {
            ok: availability.serve_sim_ok,
            message: availability.serve_sim_message,
        }),
        message: availability.message,
    }))
}

pub(in crate::rpc) async fn unregister_active(
    rpc: &EmulatorRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<EmulatorServiceUnregisterActiveRequest>(payload)?;
    rpc.authority
        .unregister_active(request.worktree.as_deref())
        .await
        .map_err(emulator_status)?;
    Ok(encode(&EmulatorServiceUnregisterActiveResponse {
        ok: true,
    }))
}

/// Tails the serve-sim MJPEG endpoint and forwards each frame inline in a
/// streamed response, replacing the legacy transport's out-of-band binary
/// side channel now that frame bytes fit directly in a protobuf `bytes`
/// field. Cancellation drops this future, which ends the poll loop.
pub(in crate::rpc) async fn stream_frames(
    _rpc: &EmulatorRpc,
    payload: &[u8],
    context: &ProtocolCallContext,
) -> Result<(), Status> {
    let request = decode::<EmulatorServiceStreamFramesRequest>(payload)?;
    let url =
        stream_url(&request.stream_url, request.stream_key.as_deref()).map_err(emulator_status)?;
    context
        .send_stream_payload(encode(&EmulatorServiceStreamFramesResponse {
            event: Some(Event::Ready(true)),
        }))
        .await?;
    let client = reqwest::Client::new();
    while !context.is_cancelled() {
        match tokio::time::timeout(
            Duration::from_secs(10),
            client
                .get(url.clone())
                .header("accept", "application/octet-stream, image/jpeg")
                .send(),
        )
        .await
        {
            Ok(Ok(mut response)) if response.status().is_success() => {
                let mut pending = Vec::new();
                let mut last_frame: Option<Instant> = None;
                loop {
                    if context.is_cancelled() {
                        return Ok(());
                    }
                    match response.chunk().await {
                        Ok(Some(chunk)) => {
                            pending.extend_from_slice(&chunk);
                            for frame in extract_frames(&mut pending, &mut last_frame) {
                                context
                                    .send_stream_payload(encode(
                                        &EmulatorServiceStreamFramesResponse {
                                            event: Some(Event::Frame(EmulatorStreamFrame {
                                                data: frame,
                                            })),
                                        },
                                    ))
                                    .await?;
                            }
                        }
                        Ok(None) => break,
                        Err(error) => {
                            send_stream_error(context, error.to_string()).await?;
                            break;
                        }
                    }
                }
            }
            Ok(Ok(response)) => {
                send_stream_error(
                    context,
                    format!("Simulator stream returned HTTP {}.", response.status()),
                )
                .await?;
            }
            Ok(Err(error)) => send_stream_error(context, error.to_string()).await?,
            Err(_) => send_stream_error(context, "Simulator stream timed out.".to_owned()).await?,
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
    Ok(())
}

async fn send_stream_error(context: &ProtocolCallContext, message: String) -> Result<(), Status> {
    context
        .send_stream_payload(encode(&EmulatorServiceStreamFramesResponse {
            event: Some(Event::Error(EmulatorStreamError { message })),
        }))
        .await
}

fn gesture_point(
    point: yiru_protocol::runtime::v1::EmulatorGesturePoint,
) -> Result<GesturePoint, Status> {
    let kind = match EmulatorGesturePointKind::try_from(point.kind) {
        Ok(EmulatorGesturePointKind::Begin) => GesturePointKind::Begin,
        Ok(EmulatorGesturePointKind::Move) => GesturePointKind::Move,
        Ok(EmulatorGesturePointKind::End) => GesturePointKind::End,
        _ => {
            return Err(status(
                StatusCode::InvalidArgument,
                "Invalid gesture point type",
            ));
        }
    };
    if point.edge.is_some_and(|edge| edge > 4) {
        return Err(status(StatusCode::InvalidArgument, "Invalid gesture edge"));
    }
    Ok(GesturePoint {
        x: point.x,
        y: point.y,
        kind,
        edge: point.edge,
    })
}

fn emulator_status(error: EmulatorError) -> Status {
    let code = match error.code() {
        "emulator_device_not_found" | "emulator_no_active" => StatusCode::NotFound,
        "emulator_disabled" | "emulator_unsupported" | "emulator_not_macos" => {
            StatusCode::FailedPrecondition
        }
        _ => StatusCode::Internal,
    };
    status(code, error.message())
}

fn status(code: StatusCode, message: &str) -> Status {
    Status {
        code: code as i32,
        message: message.to_owned(),
        details: Vec::new(),
    }
}

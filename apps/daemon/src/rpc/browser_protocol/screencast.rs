use std::time::Duration;

use tokio::time::sleep;
use yiru_protocol::protocol::v1::{Status, StatusCode};
use yiru_protocol::runtime::v1::browser_screencast_event::Event as ScreencastEvent;
use yiru_protocol::runtime::v1::execute_request::Command as RequestCommand;
use yiru_protocol::runtime::v1::execute_response::Result as ResponseResult;
use yiru_protocol::runtime::v1::{
    BrowserScreencastEvent, BrowserScreencastFrame, BrowserScreencastFrameMetadata,
    BrowserScreencastReady, BrowserScreencastSubscribeRequest, BrowserTarget, EvalCommand,
    ScreenshotCommand, TargetCommand, ViewportCommand,
};
use yiru_protocol::transport::{decode, encode};

use super::{BrowserProtocolRpc, execute_command, principal_authority_id, random_uuid, status};
use crate::rpc::protocol_call::ProtocolCallContext;

const COMMAND_TIMEOUT: Duration = Duration::from_secs(30);
const DEFAULT_FRAME_INTERVAL_MS: f64 = 150.0;
const MIN_FRAME_INTERVAL_MS: f64 = 100.0;
const MAX_FRAME_INTERVAL_MS: f64 = 1_000.0;
const METADATA_EXPRESSION: &str = "JSON.stringify({deviceWidth:innerWidth,deviceHeight:innerHeight,imageWidth:innerWidth*devicePixelRatio,imageHeight:innerHeight*devicePixelRatio,pageScaleFactor:devicePixelRatio,scrollOffsetX:scrollX,scrollOffsetY:scrollY,timestamp:performance.now()})";

// Why: screencast is a forward call (CLI/workbench/mobile calls the daemon); pixel frames used to
// ride a raw binary side channel, but at this size and rate they fit an ordinary protobuf
// server-stream, so cancelling this call is now the unsubscribe — there is no separate rpc for it.
pub(in crate::rpc) async fn screencast(
    rpc: &BrowserProtocolRpc,
    payload: &[u8],
    context: &ProtocolCallContext,
) -> Result<(), Status> {
    let request = decode::<BrowserScreencastSubscribeRequest>(payload)?;
    let authority_id = principal_authority_id(context);
    if let (Some(width), Some(height)) = (request.viewport_width, request.viewport_height) {
        execute_command(
            rpc,
            authority_id.clone(),
            RequestCommand::Viewport(ViewportCommand {
                target: request.target.clone(),
                width,
                height,
                device_scale_factor: request.device_scale_factor,
                mobile: request.mobile,
            }),
            context,
            COMMAND_TIMEOUT,
        )
        .await?;
    }
    let tab = tab_show(rpc, authority_id.clone(), &request.target, context).await?;
    let format = if request.format.is_empty() {
        "jpeg".to_owned()
    } else {
        request.format.clone()
    };
    let subscription_id = random_uuid()?;
    context
        .send_stream_payload(encode(&BrowserScreencastEvent {
            event: Some(ScreencastEvent::Ready(BrowserScreencastReady {
                subscription_id,
                browser_page_id: tab.browser_page_id,
                format: format.clone(),
                tab_url: tab.url,
                tab_title: tab.title,
            })),
        }))
        .await?;
    let interval = frame_interval(request.min_frame_interval_ms);
    let mut sequence: u32 = 0;
    loop {
        if context.is_cancelled() {
            return Ok(());
        }
        let screenshot = execute_command(
            rpc,
            authority_id.clone(),
            RequestCommand::Screenshot(ScreenshotCommand {
                target: request.target.clone(),
                format: format.clone(),
            }),
            context,
            COMMAND_TIMEOUT,
        )
        .await?;
        let ResponseResult::Screenshot(screenshot) = screenshot else {
            return Err(status(
                StatusCode::DataLoss,
                "browser_screencast_response_invalid",
            ));
        };
        let metadata = frame_metadata(rpc, authority_id.clone(), &request.target, context).await?;
        context
            .send_stream_payload(encode(&BrowserScreencastEvent {
                event: Some(ScreencastEvent::Frame(BrowserScreencastFrame {
                    sequence,
                    format: screenshot.format,
                    metadata: Some(metadata),
                    image: screenshot.data,
                })),
            }))
            .await?;
        sequence = sequence.wrapping_add(1);
        tokio::select! {
            () = sleep(interval) => {}
            () = context.cancelled() => return Ok(()),
        }
    }
}

struct ShownTab {
    browser_page_id: String,
    title: String,
    url: String,
}

async fn tab_show(
    rpc: &BrowserProtocolRpc,
    authority_id: Option<String>,
    target: &Option<BrowserTarget>,
    context: &ProtocolCallContext,
) -> Result<ShownTab, Status> {
    let response = execute_command(
        rpc,
        authority_id,
        RequestCommand::TabShow(TargetCommand {
            target: target.clone(),
        }),
        context,
        COMMAND_TIMEOUT,
    )
    .await?;
    let ResponseResult::TabShow(tab_result) = response else {
        return Err(status(
            StatusCode::DataLoss,
            "browser_screencast_response_invalid",
        ));
    };
    let tab = tab_result
        .tab
        .ok_or_else(|| status(StatusCode::NotFound, "browser_tab_not_found"))?;
    Ok(ShownTab {
        browser_page_id: tab.browser_page_id,
        title: tab.title,
        url: tab.url,
    })
}

async fn frame_metadata(
    rpc: &BrowserProtocolRpc,
    authority_id: Option<String>,
    target: &Option<BrowserTarget>,
    context: &ProtocolCallContext,
) -> Result<BrowserScreencastFrameMetadata, Status> {
    let response = execute_command(
        rpc,
        authority_id,
        RequestCommand::Eval(EvalCommand {
            target: target.clone(),
            expression: METADATA_EXPRESSION.to_owned(),
        }),
        context,
        COMMAND_TIMEOUT,
    )
    .await?;
    let ResponseResult::Eval(eval_result) = response else {
        return Err(status(
            StatusCode::DataLoss,
            "browser_screencast_response_invalid",
        ));
    };
    let parsed: serde_json::Value =
        serde_json::from_str(&eval_result.result).unwrap_or(serde_json::Value::Null);
    Ok(BrowserScreencastFrameMetadata {
        device_height: read_number(&parsed, "deviceHeight"),
        device_width: read_number(&parsed, "deviceWidth"),
        image_height: read_number(&parsed, "imageHeight"),
        image_width: read_number(&parsed, "imageWidth"),
        page_scale_factor: read_number(&parsed, "pageScaleFactor"),
        scroll_offset_x: read_number(&parsed, "scrollOffsetX"),
        scroll_offset_y: read_number(&parsed, "scrollOffsetY"),
        timestamp: read_number(&parsed, "timestamp"),
    })
}

fn read_number(value: &serde_json::Value, key: &str) -> Option<f64> {
    value.get(key).and_then(serde_json::Value::as_f64)
}

fn frame_interval(requested_ms: Option<f64>) -> Duration {
    let interval_ms = requested_ms
        .unwrap_or(DEFAULT_FRAME_INTERVAL_MS)
        .clamp(MIN_FRAME_INTERVAL_MS, MAX_FRAME_INTERVAL_MS);
    Duration::from_secs_f64(interval_ms / 1_000.0)
}

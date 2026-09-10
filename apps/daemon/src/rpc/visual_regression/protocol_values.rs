// Why: the capture record is persisted as a `serde_json`-shaped row shared
// with the legacy JSON surface; this is the single place that reads it into
// the typed protobuf wire message.
use agentstart_protocol::protocol::v1::{Status, StatusCode};
use agentstart_protocol::runtime::v1::{
    VisualRegressionCapture, VisualRegressionServiceCaptureResponse,
};
use serde_json::Value;

pub(super) fn capture_response(
    capture: &Value,
) -> Result<VisualRegressionServiceCaptureResponse, Status> {
    Ok(VisualRegressionServiceCaptureResponse {
        capture: Some(capture_message(capture)?),
    })
}

fn capture_message(capture: &Value) -> Result<VisualRegressionCapture, Status> {
    Ok(VisualRegressionCapture {
        id: text(capture, "id"),
        page_url: text(capture, "pageUrl"),
        project_id: text(capture, "projectId"),
        worktree_id: text(capture, "worktreeId"),
        diff_ratio: capture.get("diffRatio").and_then(Value::as_f64),
        width: integer(capture, "width")?,
        height: integer(capture, "height")?,
        image_artifact_id: text(capture, "imageArtifactId"),
        created_at: integer(capture, "createdAt")?,
    })
}

fn text(capture: &Value, key: &str) -> String {
    capture
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned()
}

fn integer(capture: &Value, key: &str) -> Result<i64, Status> {
    capture
        .get(key)
        .and_then(Value::as_i64)
        .ok_or_else(|| data_loss(&format!("Visual regression capture {key} is missing")))
}

fn data_loss(message: &str) -> Status {
    status(StatusCode::DataLoss, message)
}

fn status(code: StatusCode, message: &str) -> Status {
    Status {
        code: code as i32,
        message: message.to_owned(),
        details: Vec::new(),
    }
}

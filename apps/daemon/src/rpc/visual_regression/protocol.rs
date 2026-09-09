use yiru_protocol::protocol::v1::{Status, StatusCode};
use yiru_protocol::runtime::v1::visual_regression_diff_ratio::Value as DiffRatio;
use yiru_protocol::runtime::v1::{
    VisualRegressionServiceLatestRequest, VisualRegressionServiceSaveRequest,
};
use yiru_protocol::transport::{decode, encode};

use crate::persistence::visual_regression::VisualRegressionSave;
use crate::rpc::zod_input::{is_uuid, normalize_url};

use super::VisualRegressionRpc;
use super::input::VisualRegressionIdentity;
use super::protocol_values::capture_response;

pub(in crate::rpc) async fn latest(
    rpc: &VisualRegressionRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<VisualRegressionServiceLatestRequest>(payload)?;
    let identity = identity(&request.page_url, &request.project_id, &request.worktree_id)?;
    let capture = rpc.latest(identity).await.map_err(rpc_status)?;
    Ok(encode(&capture_response(&capture)?))
}

pub(in crate::rpc) async fn save(
    rpc: &VisualRegressionRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<VisualRegressionServiceSaveRequest>(payload)?;
    let identity = identity(&request.page_url, &request.project_id, &request.worktree_id)?;
    // Why: the legacy surface requires diffRatio to be present but nullable,
    // so a missing wrapper is a 400 exactly like an absent JSON field.
    let diff_ratio = request
        .diff_ratio
        .as_ref()
        .ok_or_else(|| invalid_argument("diffRatio is required"))?;
    let diff_ratio = match diff_ratio.value {
        Some(DiffRatio::Null(_)) => None,
        Some(DiffRatio::Ratio(ratio)) if (0.0..=1.0).contains(&ratio) => Some(ratio),
        Some(DiffRatio::Ratio(_)) | None => {
            return Err(invalid_argument(
                "diffRatio must be a ratio between 0 and 1",
            ));
        }
    };
    let width = bounded_dimension(request.width, "width")?;
    let height = bounded_dimension(request.height, "height")?;
    if !is_uuid(&request.image_artifact_id) {
        return Err(invalid_argument("imageArtifactId must be a UUID"));
    }
    let save = VisualRegressionSave {
        diff_ratio,
        height,
        image_artifact_id: request.image_artifact_id,
        page_url: identity.page_url.clone(),
        project_id: identity.project_id.clone(),
        width,
        worktree_id: identity.worktree_id.clone(),
    };
    let capture = rpc.save(save).await.map_err(rpc_status)?;
    Ok(encode(&capture_response(&capture)?))
}

fn identity(
    page_url: &str,
    project_id: &str,
    worktree_id: &str,
) -> Result<VisualRegressionIdentity, Status> {
    // Why: the authority's preview probe parses the page URL unconditionally,
    // so the same normalization the legacy zod rule applies guards the proto
    // path too and both surfaces accept identical inputs.
    let page_url = normalize_url(page_url)
        .filter(|page_url| page_url.encode_utf16().count() <= 8_192)
        .ok_or_else(|| invalid_argument("pageUrl must be a URL"))?;
    if project_id.is_empty() || worktree_id.is_empty() {
        return Err(invalid_argument(
            "projectId and worktreeId must not be empty",
        ));
    }
    Ok(VisualRegressionIdentity {
        page_url,
        project_id: project_id.to_owned(),
        worktree_id: worktree_id.to_owned(),
    })
}

// Why: the legacy zod rule bounds both dimensions to a positive integer of at
// most 32_768, so the typed int64 fields get the same gate.
fn bounded_dimension(value: i64, name: &str) -> Result<i64, Status> {
    if value <= 0 || value > 32_768 {
        return Err(invalid_argument(&format!(
            "{name} must be a positive integer of at most 32768"
        )));
    }
    Ok(value)
}

use super::VisualRegressionRpcError;

fn rpc_status(error: VisualRegressionRpcError) -> Status {
    // Why: identity failures answer with a bare 400 before this mapping and
    // everything else with a bare 500; the store's artifact gate is the one
    // storage failure that is the caller's fault, so it keeps a 400.
    let code = match error {
        VisualRegressionRpcError::Storage(
            crate::persistence::visual_regression::VisualRegressionStoreError::ArtifactInvalid,
        ) => StatusCode::InvalidArgument,
        _ => StatusCode::Internal,
    };
    status(code, &error.to_string())
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

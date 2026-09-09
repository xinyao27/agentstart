use yiru_protocol::protocol::v1::{Status, StatusCode};
use yiru_protocol::runtime::v1::{
    ProjectContextMatch, ProjectContextServiceResolveRequest, ProjectContextServiceResolveResponse,
};
use yiru_protocol::transport::{decode, encode};

use super::ProjectContextRpc;

pub(in crate::rpc) async fn resolve(
    rpc: &ProjectContextRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<ProjectContextServiceResolveRequest>(payload)?;
    if request.canonical_key.is_empty() {
        return Err(invalid_argument("canonicalKey must not be empty"));
    }
    let matches = rpc
        .projects
        .resolve(request.canonical_key)
        .await
        .map_err(|error| status(StatusCode::Internal, &error.to_string()))?;
    Ok(encode(&ProjectContextServiceResolveResponse {
        matches: matches
            .iter()
            .map(|project| ProjectContextMatch {
                project_id: project.id.clone(),
                display_name: project.display_name.clone(),
                path: project.path.clone(),
            })
            .collect(),
    }))
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

use yiru_protocol::protocol::v1::{Status, StatusCode};
use yiru_protocol::runtime::v1::{
    BrowserCommandServiceOpenRequest, BrowserCommandServiceOpenResponse,
    BrowserOpenTabRequestedEvent, BrowserOpenTabRequestedPayload,
};
use yiru_protocol::transport::{decode, encode};

use crate::persistence::WorkspaceEventPayload;
use crate::rpc::protocol_call::status;

use super::{BrowserCommandRpc, EVENT_KIND, EVENT_SCOPE};

const MAX_IDENTIFIER_LENGTH: usize = 4_096;

pub(in crate::rpc) async fn open(
    rpc: &BrowserCommandRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<BrowserCommandServiceOpenRequest>(payload)?;
    let project_id = optional_identifier(request.project_id)?;
    let worktree_id = optional_identifier(request.worktree_id)?;
    url::Url::parse(&request.url)
        .map_err(|_| status(StatusCode::InvalidArgument, "browser_command_url_invalid"))?;
    let mut payload = WorkspaceEventPayload::new();
    if let Some(project_id) = project_id.clone() {
        payload.insert(
            "projectId".to_owned(),
            serde_json::Value::String(project_id),
        );
    }
    payload.insert(
        "url".to_owned(),
        serde_json::Value::String(request.url.clone()),
    );
    if let Some(worktree_id) = worktree_id.clone() {
        payload.insert(
            "worktreeId".to_owned(),
            serde_json::Value::String(worktree_id),
        );
    }
    let event = rpc
        .journal
        .append(EVENT_SCOPE.to_owned(), EVENT_KIND.to_owned(), payload)
        .await
        .map_err(|error| status(StatusCode::Internal, &error.to_string()))?;
    Ok(encode(&BrowserCommandServiceOpenResponse {
        event: Some(BrowserOpenTabRequestedEvent {
            id: event.id,
            kind: event.kind,
            occurred_at: event.occurred_at,
            payload: Some(BrowserOpenTabRequestedPayload {
                url: request.url,
                project_id,
                worktree_id,
            }),
            revision: event.revision,
            scope: event.scope,
        }),
    }))
}

fn optional_identifier(value: Option<String>) -> Result<Option<String>, Status> {
    let Some(value) = value else {
        return Ok(None);
    };
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed.len() > MAX_IDENTIFIER_LENGTH {
        return Err(status(
            StatusCode::InvalidArgument,
            "browser_command_identifier_invalid",
        ));
    }
    Ok(Some(trimmed.to_owned()))
}

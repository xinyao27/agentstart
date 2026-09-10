use agentstart_protocol::protocol::v1::{Status, StatusCode};
use agentstart_protocol::runtime::v1::{
    ShellAgentStartProfilesServiceCreateLocalRequest,
    ShellAgentStartProfilesServiceFindProjectProfilesRequest,
    ShellAgentStartProfilesServiceListRequest, ShellAgentStartProfilesServiceSwitchProfileRequest,
    ShellAgentStartProfilesServiceTransferProjectRequest, ShellAgentStartProfilesTransferMode,
};
use agentstart_protocol::transport::{decode, encode};

use super::ProfilesRpc;
use super::protocol_values::{create_value, find_value, list_value, switch_value, transfer_value};

pub(in crate::rpc) async fn list(rpc: &ProfilesRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    decode::<ShellAgentStartProfilesServiceListRequest>(payload)?;
    let profiles = rpc.list_profiles().await.map_err(profiles_status)?;
    Ok(encode(&list_value(&profiles)?))
}

pub(in crate::rpc) async fn create_local(
    rpc: &ProfilesRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<ShellAgentStartProfilesServiceCreateLocalRequest>(payload)?;
    let name = request
        .name
        .filter(|name| !name.trim().is_empty())
        .map(|name| name.trim().to_owned());
    let profiles = rpc.create_local(name).await.map_err(profiles_status)?;
    Ok(encode(&create_value(&profiles)?))
}

pub(in crate::rpc) async fn switch_profile(
    rpc: &ProfilesRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<ShellAgentStartProfilesServiceSwitchProfileRequest>(payload)?;
    let profile_id = required_trimmed(&request.profile_id, "profileId")?;
    let profiles = rpc
        .switch_profile(profile_id)
        .await
        .map_err(profiles_status)?;
    Ok(encode(&switch_value(&profiles)?))
}

pub(in crate::rpc) async fn transfer_project(
    rpc: &ProfilesRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<ShellAgentStartProfilesServiceTransferProjectRequest>(payload)?;
    let mode = match request.mode() {
        ShellAgentStartProfilesTransferMode::Move => "move",
        ShellAgentStartProfilesTransferMode::Copy => "copy",
        ShellAgentStartProfilesTransferMode::Unspecified => {
            return Err(invalid_argument("Transfer mode is invalid"));
        }
    };
    let source = required_trimmed(&request.source_profile_id, "sourceProfileId")?;
    let target = required_trimmed(&request.target_profile_id, "targetProfileId")?;
    let repo = required_trimmed(&request.repo_id, "repoId")?;
    let profiles = rpc
        .transfer_project(source, target, repo, mode.to_owned())
        .await
        .map_err(profiles_status)?;
    Ok(encode(&transfer_value(&profiles)?))
}

pub(in crate::rpc) async fn find_project_profiles(
    rpc: &ProfilesRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<ShellAgentStartProfilesServiceFindProjectProfilesRequest>(payload)?;
    let path = required_trimmed(&request.path, "path")?;
    let execution_host_id = optional_trimmed(request.execution_host_id);
    if let Some(host) = execution_host_id.as_deref()
        && !super::valid_host_id(host)
    {
        return Err(invalid_argument("Execution host id is invalid"));
    }
    let profiles = rpc
        .find_project_profiles(
            path,
            optional_trimmed(request.connection_id),
            execution_host_id,
            optional_trimmed(request.exclude_profile_id),
        )
        .await
        .map_err(profiles_status)?;
    Ok(encode(&find_value(&profiles)?))
}

fn required_trimmed(value: &str, field: &str) -> Result<String, Status> {
    let value = value.trim();
    if value.is_empty() {
        return Err(invalid_argument(format!("Missing {field}")));
    }
    Ok(value.to_owned())
}

fn optional_trimmed(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

// Why: the legacy surface answered profile authority failures with the same
// 400 the typed request path cannot trigger, so only genuinely bad arguments
// surface as InvalidArgument here.
fn profiles_status(error: super::ProfilesRpcError) -> Status {
    match error {
        super::ProfilesRpcError::InvalidInput | super::ProfilesRpcError::Profile(_) => {
            status(StatusCode::InvalidArgument, &error.to_string())
        }
        super::ProfilesRpcError::Settings(_) | super::ProfilesRpcError::Worker(_) => {
            status(StatusCode::Internal, &error.to_string())
        }
    }
}

fn invalid_argument(message: impl Into<String>) -> Status {
    status(StatusCode::InvalidArgument, &message.into())
}

fn status(code: StatusCode, message: &str) -> Status {
    Status {
        code: code as i32,
        message: message.to_owned(),
        details: Vec::new(),
    }
}

use agentstart_protocol::protocol::v1::{Status, StatusCode};
use agentstart_protocol::runtime::v1::{
    ShellCacheServiceGetGitHubRequest, ShellCacheServiceSetGitHubRequest,
    ShellCacheServiceSetGitHubResponse, ShellOnboardingServiceGetRequest,
    ShellOnboardingServiceUpdateRequest,
};
use agentstart_protocol::transport::{decode, encode};

use crate::shell_state::GitHubCacheError;

use super::ShellStateRpc;
use super::protocol_values::{
    github_cache, github_cache_update_value, onboarding_state, onboarding_update_value,
};

pub(in crate::rpc) async fn get_github_cache(
    rpc: &ShellStateRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    decode::<ShellCacheServiceGetGitHubRequest>(payload)?;
    Ok(encode(&github_cache(&rpc.state.get_github_cache())))
}

pub(in crate::rpc) async fn set_github_cache(
    rpc: &ShellStateRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<ShellCacheServiceSetGitHubRequest>(payload)?;
    let cache = github_cache_update_value(&request)?;
    rpc.state
        .set_github_cache(&cache)
        .await
        .map_err(cache_status)?;
    Ok(encode(&ShellCacheServiceSetGitHubResponse {}))
}

pub(in crate::rpc) async fn get_onboarding(
    rpc: &ShellStateRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    decode::<ShellOnboardingServiceGetRequest>(payload)?;
    Ok(encode(&onboarding_state(&rpc.state.get_onboarding())))
}

pub(in crate::rpc) async fn update_onboarding(
    rpc: &ShellStateRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<ShellOnboardingServiceUpdateRequest>(payload)?;
    let update = onboarding_update_value(&request)?;
    Ok(encode(&onboarding_state(
        &rpc.state.update_onboarding(&update),
    )))
}

// Why: the legacy shell.cache verbs answered an invalid cache document with a
// bare 400 and everything else with a bare 500, so the protobuf surface
// mirrors that instead of inventing finer statuses.
fn cache_status(error: GitHubCacheError) -> Status {
    let code = match error {
        GitHubCacheError::Invalid => StatusCode::InvalidArgument,
        GitHubCacheError::Io(_) | GitHubCacheError::Json(_) => StatusCode::Internal,
    };
    status(code, &error.to_string())
}

fn status(code: StatusCode, message: &str) -> Status {
    Status {
        code: code as i32,
        message: message.to_owned(),
        details: Vec::new(),
    }
}

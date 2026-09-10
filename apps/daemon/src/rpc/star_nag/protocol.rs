use agentstart_protocol::protocol::v1::Status;
use agentstart_protocol::runtime::v1::{
    StarNagPromptMode as ProtocolPromptMode, StarNagShellServiceAgentValueMomentRequest,
    StarNagShellServiceAgentValueMomentResponse, StarNagShellServiceCompleteRequest,
    StarNagShellServiceCompleteResponse, StarNagShellServiceDismissRequest,
    StarNagShellServiceDismissResponse, StarNagShellServiceLaterRequest,
    StarNagShellServiceLaterResponse, StarNagShellServiceOnboardingCompletedRequest,
    StarNagShellServiceOnboardingCompletedResponse, StarNagShellServiceOpenWebRequest,
    StarNagShellServiceOpenWebResponse, StarNagShellServiceShowAgentValueMomentRequest,
    StarNagShellServiceShowAgentValueMomentResponse, StarNagShellServiceStarAgentStartRequest,
    StarNagShellServiceStarAgentStartResponse,
};
use agentstart_protocol::transport::{decode, encode};

use crate::star_nag::{AgentValueMomentPreparation, StarNagDomainPromptMode};

use super::StarNagRpc;

pub(in crate::rpc) async fn dismiss(rpc: &StarNagRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let _ = decode::<StarNagShellServiceDismissRequest>(payload)?;
    rpc.authority.dismiss().await;
    Ok(encode(&StarNagShellServiceDismissResponse {}))
}

pub(in crate::rpc) async fn later(rpc: &StarNagRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let _ = decode::<StarNagShellServiceLaterRequest>(payload)?;
    rpc.authority.later().await;
    Ok(encode(&StarNagShellServiceLaterResponse {}))
}

pub(in crate::rpc) async fn complete(rpc: &StarNagRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let _ = decode::<StarNagShellServiceCompleteRequest>(payload)?;
    rpc.authority.complete().await;
    Ok(encode(&StarNagShellServiceCompleteResponse {}))
}

pub(in crate::rpc) async fn open_web(rpc: &StarNagRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let _ = decode::<StarNagShellServiceOpenWebRequest>(payload)?;
    rpc.authority.open_web().await;
    Ok(encode(&StarNagShellServiceOpenWebResponse {}))
}

pub(in crate::rpc) async fn star_agentstart(
    rpc: &StarNagRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let _ = decode::<StarNagShellServiceStarAgentStartRequest>(payload)?;
    let starred = rpc.authority.star_agentstart().await;
    Ok(encode(&StarNagShellServiceStarAgentStartResponse {
        starred,
    }))
}

pub(in crate::rpc) async fn agent_value_moment(
    rpc: &StarNagRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let _ = decode::<StarNagShellServiceAgentValueMomentRequest>(payload)?;
    let mode = match rpc.authority.agent_value_moment_preparation().await {
        AgentValueMomentPreparation::Ready(mode) => Some(protocol_mode(mode) as i32),
        AgentValueMomentPreparation::Skipped => None,
    };
    Ok(encode(&StarNagShellServiceAgentValueMomentResponse {
        mode,
    }))
}

pub(in crate::rpc) async fn show_agent_value_moment(
    rpc: &StarNagRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let _ = decode::<StarNagShellServiceShowAgentValueMomentRequest>(payload)?;
    rpc.authority.show_agent_value_moment().await;
    Ok(encode(&StarNagShellServiceShowAgentValueMomentResponse {}))
}

pub(in crate::rpc) async fn onboarding_completed(
    rpc: &StarNagRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let _ = decode::<StarNagShellServiceOnboardingCompletedRequest>(payload)?;
    rpc.authority.onboarding_completed().await;
    Ok(encode(&StarNagShellServiceOnboardingCompletedResponse {}))
}

pub(in crate::rpc) fn protocol_mode(mode: StarNagDomainPromptMode) -> ProtocolPromptMode {
    match mode {
        StarNagDomainPromptMode::Gh => ProtocolPromptMode::Gh,
        StarNagDomainPromptMode::Web => ProtocolPromptMode::Web,
    }
}

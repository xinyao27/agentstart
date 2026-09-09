use yiru_protocol::runtime::v1::AgentTrustPreset as ProtocolAgentTrustPreset;
use yiru_protocol::transport::{decode, encode};

use crate::agent_trust::{AgentTrustInput, AgentTrustPreset, AgentTrustService};

// Why: the legacy `host.agentTrust.markTrusted` JSON surface is retired; only
// the protobuf mount remains, backed by the same trust service.
#[derive(Clone)]
pub(super) struct AgentTrustRpc {
    service: AgentTrustService,
}

fn parse_preset(preset: ProtocolAgentTrustPreset) -> Option<AgentTrustPreset> {
    match preset {
        ProtocolAgentTrustPreset::Cursor => Some(AgentTrustPreset::Cursor),
        ProtocolAgentTrustPreset::Copilot => Some(AgentTrustPreset::Copilot),
        ProtocolAgentTrustPreset::Codex => Some(AgentTrustPreset::Codex),
        ProtocolAgentTrustPreset::Unspecified => None,
    }
}

impl AgentTrustRpc {
    pub(super) fn new(service: AgentTrustService) -> Self {
        Self { service }
    }

    pub(in crate::rpc) async fn protocol_mark_trusted(
        &self,
        payload: &[u8],
    ) -> Result<Vec<u8>, yiru_protocol::protocol::v1::Status> {
        use yiru_protocol::runtime::v1::{
            HostRegistryServiceMarkAgentTrustedRequest, HostRegistryServiceMarkAgentTrustedResponse,
        };

        let request = decode::<HostRegistryServiceMarkAgentTrustedRequest>(payload)?;
        // Why: the legacy handler treated malformed opaque input as a
        // successful no-op (an unrecognized preset or non-string path wrote
        // nothing and still answered), so the typed mount keeps that no-op
        // instead of raising InvalidArgument.
        if let Some(input) = parse_preset(request.preset()).map(|preset| AgentTrustInput {
            preset,
            workspace_path: request.workspace_path,
        }) {
            self.service.mark_trusted(input).await;
        }
        Ok(encode(&HostRegistryServiceMarkAgentTrustedResponse {}))
    }
}

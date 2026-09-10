use std::time::Duration;

use agentstart_protocol::protocol::v1::PeerKind;
use tokio::time::{Instant, timeout_at};

use super::records::RuntimeEnvironmentProfile;
use super::transport::RuntimeWebSocket;
use crate::transport::{PeerIdentity, ProtocolClient, ProtocolPeerError};

const INITIAL_CALL_CREDIT_BYTES: u64 = 1024 * 1024;
const MAX_FRAME_BYTES: u32 = 1024 * 1024;

pub(super) async fn connect(
    environment: &RuntimeEnvironmentProfile,
) -> Result<ProtocolClient, ProtocolPeerError> {
    let deadline = Instant::now()
        .checked_add(Duration::from_secs(10))
        .ok_or(ProtocolPeerError::Protocol("deadline_invalid"))?;
    let (peer, _) = connect_before(environment, deadline).await?;
    Ok(peer)
}

async fn connect_before(
    environment: &RuntimeEnvironmentProfile,
    deadline: Instant,
) -> Result<(ProtocolClient, String), ProtocolPeerError> {
    let endpoint = environment
        .endpoints
        .iter()
        .find(|endpoint| endpoint.id == environment.preferred_endpoint_id)
        .ok_or(ProtocolPeerError::Protocol("runtime_endpoint_missing"))?;
    let (transport, authenticated_runtime_id) = timeout_at(
        deadline,
        RuntimeWebSocket::connect(
            &endpoint.endpoint,
            &endpoint.token,
            endpoint.pinned_public_key,
        ),
    )
    .await
    .map_err(|_| ProtocolPeerError::ConnectionTimeout)??;
    let identity = PeerIdentity::new(
        PeerKind::Daemon,
        "agentstart-runtime",
        env!("CARGO_PKG_VERSION"),
        MAX_FRAME_BYTES,
        INITIAL_CALL_CREDIT_BYTES,
    )?;
    let peer = timeout_at(
        deadline,
        ProtocolClient::negotiate(transport, identity, Some(authenticated_runtime_id.as_str())),
    )
    .await
    .map_err(|_| ProtocolPeerError::ConnectionTimeout)??;
    Ok((peer, authenticated_runtime_id))
}

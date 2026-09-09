use std::time::Duration;

use yiru_protocol::method_metadata::methods::YiruRuntimeV1StatusServiceGetStatus as GetStatusMethod;
use yiru_protocol::protocol::v1::{Status, StatusCode};
use yiru_protocol::runtime::v1::{
    GetStatusRequest, RuntimeAuthorizedPeer, RuntimeDeviceScope, RuntimeEnvironment,
    RuntimeEnvironmentEndpoint, RuntimeEnvironmentEndpointKind,
    RuntimeEnvironmentServiceDisconnectRequest, RuntimeEnvironmentServiceDisconnectResponse,
    RuntimeEnvironmentServiceGenerateOfferRequest, RuntimeEnvironmentServiceGenerateOfferResponse,
    RuntimeEnvironmentServiceGetStatusRequest, RuntimeEnvironmentServiceGetStatusResponse,
    RuntimeEnvironmentServiceImportRequest, RuntimeEnvironmentServiceImportResponse,
    RuntimeEnvironmentServiceListPeersRequest, RuntimeEnvironmentServiceListPeersResponse,
    RuntimeEnvironmentServiceListRequest, RuntimeEnvironmentServiceListResponse,
    RuntimeEnvironmentServiceRemoveRequest, RuntimeEnvironmentServiceRemoveResponse,
    RuntimeEnvironmentServiceRevokePeerRequest, RuntimeEnvironmentServiceRevokePeerResponse,
};
use yiru_protocol::transport::{decode, encode};

use crate::profiles::ProfilesAuthority;
use crate::runtime_environment::{
    AuthorizedRuntimePeer, RuntimeEnvironmentAuthority, RuntimeEnvironmentError,
    RuntimeEnvironmentRoute, RuntimeEnvironmentRouteError, RuntimeEnvironmentSummary,
};
use crate::settings::SettingsAuthority;
use crate::transport::ProtocolPeerError;

const MAX_STATUS_TIMEOUT_MS: u32 = 120_000;

#[derive(Clone)]
pub(super) struct RuntimeEnvironmentRpc {
    authority: RuntimeEnvironmentAuthority,
    settings: SettingsAuthority,
    profiles: ProfilesAuthority,
}

impl RuntimeEnvironmentRpc {
    pub(super) fn new(
        authority: RuntimeEnvironmentAuthority,
        settings: SettingsAuthority,
        profiles: ProfilesAuthority,
    ) -> Self {
        Self {
            authority,
            settings,
            profiles,
        }
    }

    pub(super) async fn protocol_generate_offer(&self, payload: &[u8]) -> Result<Vec<u8>, Status> {
        let request = decode::<RuntimeEnvironmentServiceGenerateOfferRequest>(payload)?;
        let offer = self
            .authority
            .generate_offer(&request.name, &request.address, request.endpoint.as_deref())
            .await
            .map_err(environment_status)?;
        Ok(encode(&RuntimeEnvironmentServiceGenerateOfferResponse {
            endpoint: offer.endpoint,
            pairing_offer: offer.pairing_offer,
            peer_id: offer.peer_id,
        }))
    }

    pub(super) async fn protocol_import(&self, payload: &[u8]) -> Result<Vec<u8>, Status> {
        let request = decode::<RuntimeEnvironmentServiceImportRequest>(payload)?;
        let environment = self
            .authority
            .import(
                &request.name,
                &request.pairing_offer,
                request.replace_environment_id.as_deref(),
            )
            .await
            .map_err(environment_status)?;
        Ok(encode(&RuntimeEnvironmentServiceImportResponse {
            environment: Some(protocol_environment(environment)),
        }))
    }

    pub(super) fn protocol_list(&self, payload: &[u8]) -> Result<Vec<u8>, Status> {
        decode::<RuntimeEnvironmentServiceListRequest>(payload)?;
        let environments = self
            .authority
            .list()
            .map_err(environment_status)?
            .into_iter()
            .map(protocol_environment)
            .collect();
        Ok(encode(&RuntimeEnvironmentServiceListResponse {
            environments,
        }))
    }

    pub(super) async fn protocol_get_status(&self, payload: &[u8]) -> Result<Vec<u8>, Status> {
        let request = decode::<RuntimeEnvironmentServiceGetStatusRequest>(payload)?;
        if request.timeout_ms == 0 || request.timeout_ms > MAX_STATUS_TIMEOUT_MS {
            return Err(status(
                StatusCode::InvalidArgument,
                "Runtime environment timeout is invalid",
            ));
        }
        let environment = self
            .authority
            .resolve(&request.selector)
            .map_err(environment_status)?;
        let timeout = Duration::from_millis(u64::from(request.timeout_ms));
        let route = self
            .authority
            .route(&environment.id)
            .await
            .map_err(route_status)?;
        let remote_status = route
            .unary::<GetStatusMethod>(&GetStatusRequest {}, timeout)
            .await
            .map_err(peer_status)?;
        if remote_status.runtime_id != route.runtime_id()
            || RuntimeDeviceScope::try_from(remote_status.device_scope)
                != Ok(RuntimeDeviceScope::Runtime)
        {
            route.invalidate().await;
            return Err(peer_status(ProtocolPeerError::RuntimeMismatch));
        }
        let environment = self
            .authority
            .resolve(&environment.id)
            .map_err(environment_status)?;
        Ok(encode(&RuntimeEnvironmentServiceGetStatusResponse {
            environment: Some(protocol_environment(environment)),
            status: Some(remote_status),
        }))
    }

    pub(super) async fn protocol_remove(&self, payload: &[u8]) -> Result<Vec<u8>, Status> {
        let request = decode::<RuntimeEnvironmentServiceRemoveRequest>(payload)?;
        let removed = self
            .authority
            .remove(&request.selector, &self.settings, &self.profiles)
            .await
            .map_err(environment_status)?;
        Ok(encode(&RuntimeEnvironmentServiceRemoveResponse {
            removed: Some(protocol_environment(removed)),
        }))
    }

    pub(super) fn protocol_list_peers(&self, payload: &[u8]) -> Result<Vec<u8>, Status> {
        decode::<RuntimeEnvironmentServiceListPeersRequest>(payload)?;
        Ok(encode(&RuntimeEnvironmentServiceListPeersResponse {
            peers: self
                .authority
                .list_peers()
                .into_iter()
                .map(protocol_peer)
                .collect(),
        }))
    }

    pub(super) async fn protocol_revoke_peer(&self, payload: &[u8]) -> Result<Vec<u8>, Status> {
        let request = decode::<RuntimeEnvironmentServiceRevokePeerRequest>(payload)?;
        let revoked = self
            .authority
            .revoke_peer(&request.peer_id)
            .await
            .map_err(environment_status)?;
        Ok(encode(&RuntimeEnvironmentServiceRevokePeerResponse {
            revoked: Some(protocol_peer(revoked)),
        }))
    }

    pub(super) async fn routed_connection(
        &self,
        environment_id: &str,
    ) -> Result<RuntimeEnvironmentRoute, Status> {
        self.authority
            .route(environment_id)
            .await
            .map_err(route_status)
    }

    pub(super) async fn protocol_disconnect(&self, payload: &[u8]) -> Result<Vec<u8>, Status> {
        let request = decode::<RuntimeEnvironmentServiceDisconnectRequest>(payload)?;
        let disconnected = self
            .authority
            .disconnect(&request.selector)
            .await
            .map_err(environment_status)?;
        Ok(encode(&RuntimeEnvironmentServiceDisconnectResponse {
            disconnected: Some(protocol_environment(disconnected)),
        }))
    }
}

fn protocol_environment(environment: impl Into<RuntimeEnvironmentSummary>) -> RuntimeEnvironment {
    let environment = environment.into();
    RuntimeEnvironment {
        id: environment.id,
        name: environment.name,
        created_at_unix_ms: environment.created_at_unix_ms,
        updated_at_unix_ms: environment.updated_at_unix_ms,
        last_used_at_unix_ms: environment.last_used_at_unix_ms,
        runtime_id: environment.runtime_id,
        endpoints: environment
            .endpoints
            .into_iter()
            .map(|endpoint| RuntimeEnvironmentEndpoint {
                id: endpoint.id,
                kind: RuntimeEnvironmentEndpointKind::Websocket as i32,
                label: endpoint.label,
                endpoint: endpoint.endpoint,
            })
            .collect(),
        preferred_endpoint_id: environment.preferred_endpoint_id,
        pairing_required: environment.pairing_required,
    }
}

fn protocol_peer(peer: AuthorizedRuntimePeer) -> RuntimeAuthorizedPeer {
    RuntimeAuthorizedPeer {
        id: peer.id,
        name: peer.name,
        created_at_unix_ms: peer.created_at_unix_ms,
        last_seen_at_unix_ms: peer.last_seen_at_unix_ms,
    }
}

fn environment_status(error: RuntimeEnvironmentError) -> Status {
    let code = match error {
        RuntimeEnvironmentError::PairingRequired => StatusCode::FailedPrecondition,
        RuntimeEnvironmentError::Duplicate(_) => StatusCode::AlreadyExists,
        RuntimeEnvironmentError::ConnectionCapacity | RuntimeEnvironmentError::StateCapacity => {
            StatusCode::ResourceExhausted
        }
        RuntimeEnvironmentError::EnvironmentNotFound(_)
        | RuntimeEnvironmentError::PeerNotFound(_) => StatusCode::NotFound,
        RuntimeEnvironmentError::AddressInvalid
        | RuntimeEnvironmentError::EndpointInvalid
        | RuntimeEnvironmentError::EnvironmentAmbiguous(_)
        | RuntimeEnvironmentError::NameInvalid
        | RuntimeEnvironmentError::OfferInvalid => StatusCode::InvalidArgument,
        RuntimeEnvironmentError::CommittedSecureFile(_)
        | RuntimeEnvironmentError::InvalidState
        | RuntimeEnvironmentError::InstallationConflict
        | RuntimeEnvironmentError::LegacyInvalid
        | RuntimeEnvironmentError::LegacyConflict
        | RuntimeEnvironmentError::Io(_)
        | RuntimeEnvironmentError::Random(_)
        | RuntimeEnvironmentError::Profiles(_)
        | RuntimeEnvironmentError::RemovalCommittedCleanup { .. }
        | RuntimeEnvironmentError::SecureFile(_)
        | RuntimeEnvironmentError::Settings(_)
        | RuntimeEnvironmentError::Serialization(_)
        | RuntimeEnvironmentError::Task(_) => StatusCode::Internal,
    };
    status(code, &error.to_string())
}

fn peer_status(error: ProtocolPeerError) -> Status {
    let code = match &error {
        ProtocolPeerError::ConnectionTimeout => StatusCode::DeadlineExceeded,
        ProtocolPeerError::RuntimeMismatch => StatusCode::FailedPrecondition,
        ProtocolPeerError::ConnectionFailed | ProtocolPeerError::Protocol(_) => {
            StatusCode::Unavailable
        }
        ProtocolPeerError::Remote(remote) => return remote.status().clone(),
    };
    status(code, &error.to_string())
}

fn route_status(error: RuntimeEnvironmentRouteError) -> Status {
    match error {
        RuntimeEnvironmentRouteError::Environment(error) => environment_status(error),
        RuntimeEnvironmentRouteError::Peer(error) => peer_status(error),
    }
}

fn status(code: StatusCode, message: &str) -> Status {
    Status {
        code: code as i32,
        message: message.to_owned(),
        details: Vec::new(),
    }
}

mod activity;
mod authority;
mod authorization;
mod client;
mod connections;
mod legacy;
mod offer;
mod records;
mod routes;
pub(crate) mod server;
mod state_file;
mod transport;
mod wire;

const MAX_HANDSHAKE_TEXT_BYTES: usize = 4 * 1024;
pub(crate) const MAX_RUNTIME_MESSAGE_BYTES: usize =
    1024 * 1024 + crate::transport::e2ee::E2EE_FRAME_OVERHEAD_BYTES;

pub(crate) use authority::{
    RuntimeEnvironmentAuthority, RuntimeEnvironmentError, RuntimeEnvironmentRouteError,
};
pub(crate) use authorization::RuntimeAuthorization;
pub(crate) use connections::{RuntimeConnectionLease, RuntimeConnections};
pub(crate) use records::{AuthorizedRuntimePeer, RuntimeEnvironmentSummary};
pub(crate) use routes::RuntimeEnvironmentRoute;

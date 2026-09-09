mod discovery;
pub(crate) mod e2ee;
mod extension_admission;
mod extension_rpc;
mod extension_socket;
mod protocol_client;
pub(crate) mod secure_file;

pub use discovery::{ExtensionDiscovery, ExtensionDiscoveryError};
pub use extension_rpc::{
    ExtensionRpcConfig, ExtensionRpcServer, ExtensionRpcServerError, generate_auth_token,
    read_allowed_extension_origins,
};
pub(crate) use protocol_client::LocalProtocolClient;
pub use protocol_client::{
    FrameTransport, FrameTransportEvent, FrameTransportReader, FrameTransportWriter, PeerIdentity,
    ProtocolClient, ProtocolPeerError, ProtocolStream, RawDuplexWriter, RawProtocolStream,
};

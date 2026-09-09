mod frame;
mod handshake;
mod schedule;
mod session;
mod transcript;

pub(crate) use frame::E2EE_FRAME_OVERHEAD_BYTES;
pub(crate) use handshake::{ClientHandshake, ServerHandshake};
pub(crate) use session::{EncryptedReceiver, EncryptedSession, EncryptedWriter};

#[derive(Clone, Copy)]
pub(crate) struct E2eeProfile {
    forward_label: &'static str,
    info_label: &'static [u8],
    initiator: &'static str,
    protocol: &'static str,
    responder: &'static str,
    reverse_label: &'static str,
    salt_label: &'static [u8],
    server_nonce_label: &'static str,
    server_public_key_label: &'static str,
    transcript_domain: &'static str,
    transport: &'static str,
    vocabulary: ReadyVocabulary,
}

pub(crate) const MOBILE_PROFILE: E2eeProfile = E2eeProfile {
    forward_label: "mobile-to-desktop",
    info_label: b"yiru-mobile-e2ee/v2/session\0",
    initiator: "mobile",
    protocol: "yiru-mobile-e2ee",
    responder: "desktop",
    reverse_label: "desktop-to-mobile",
    salt_label: b"yiru-mobile-e2ee/v2/salt\0",
    server_nonce_label: "desktop-nonce",
    server_public_key_label: "desktop-public-key",
    transcript_domain: "yiru-mobile-e2ee/v2/transcript",
    transport: "direct",
    vocabulary: ReadyVocabulary::Mobile,
};

pub(crate) const RUNTIME_PROFILE: E2eeProfile = E2eeProfile {
    forward_label: "runtime-client-to-server",
    info_label: b"yiru-runtime-e2ee/v2/session\0",
    initiator: "runtime-client",
    protocol: "yiru-runtime-e2ee",
    responder: "runtime-server",
    reverse_label: "runtime-server-to-client",
    salt_label: b"yiru-runtime-e2ee/v2/salt\0",
    server_nonce_label: "server-nonce",
    server_public_key_label: "server-public-key",
    transcript_domain: "yiru-runtime-e2ee/v2/transcript",
    transport: "direct",
    vocabulary: ReadyVocabulary::Runtime,
};

#[derive(Clone, Copy)]
enum ReadyVocabulary {
    Mobile,
    Runtime,
}

#[derive(Debug, thiserror::Error)]
pub(crate) enum E2eeError {
    #[error("E2EE counter is exhausted")]
    CounterExhausted,
    #[error("E2EE cryptography failed")]
    Cryptography,
    #[error("e2ee_frame_invalid")]
    FrameInvalid,
    #[error("e2ee_hello_invalid")]
    HelloInvalid,
    #[error("E2EE random source failed: {0}")]
    Random(#[from] getrandom::Error),
    #[error("E2EE JSON serialization failed: {0}")]
    Serialization(#[from] serde_json::Error),
}

#[derive(Clone, Copy)]
enum Direction {
    InitiatorToResponder,
    ResponderToInitiator,
}

#[derive(Clone, Copy)]
enum PayloadKind {
    Text,
    Binary,
}

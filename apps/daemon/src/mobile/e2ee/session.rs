use crate::mobile::MobileKeypair;
use crate::transport::e2ee::{E2eeError, EncryptedSession, MOBILE_PROFILE, ServerHandshake};

pub(crate) struct MobileE2eeSession {
    encrypted: EncryptedSession,
    ready_text: String,
}

impl MobileE2eeSession {
    pub(crate) fn create(hello_text: &str, keypair: &MobileKeypair) -> Result<Self, E2eeError> {
        let handshake = ServerHandshake::accept(hello_text, keypair.secret_key, MOBILE_PROFILE)?;
        let ready_text = handshake.ready_text.clone();
        Ok(Self {
            encrypted: EncryptedSession::responder(handshake),
            ready_text,
        })
    }

    pub(crate) fn ready_text(&self) -> &str {
        &self.ready_text
    }

    pub(crate) fn transcript_hash_b64(&self) -> &str {
        self.encrypted.transcript_hash_b64()
    }

    pub(crate) fn open_text(&mut self, frame_b64: &str) -> Result<String, E2eeError> {
        self.encrypted.open_text(frame_b64)
    }

    pub(crate) fn open_binary(&mut self, frame: &[u8]) -> Result<Vec<u8>, E2eeError> {
        self.encrypted.open_binary(frame)
    }

    pub(crate) fn seal_text(&mut self, plaintext: &str) -> Result<String, E2eeError> {
        self.encrypted.seal_text(plaintext)
    }

    pub(crate) fn seal_binary(&mut self, plaintext: &[u8]) -> Result<Vec<u8>, E2eeError> {
        self.encrypted.seal_binary(plaintext)
    }
}

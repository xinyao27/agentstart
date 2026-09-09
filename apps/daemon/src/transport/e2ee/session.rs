use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as BASE64;

use super::frame;
use super::schedule::KeySchedule;
use super::{Direction, E2eeError, PayloadKind, ServerHandshake};

pub(crate) struct EncryptedSession {
    inbound_counter: Option<u64>,
    inbound_direction: Direction,
    inbound_key: [u8; 32],
    outbound_counter: Option<u64>,
    outbound_direction: Direction,
    outbound_key: [u8; 32],
    session_id: [u8; 32],
    transcript_hash_b64: String,
}

pub(crate) struct EncryptedReceiver {
    counter: Option<u64>,
    direction: Direction,
    key: [u8; 32],
    session_id: [u8; 32],
}

pub(crate) struct EncryptedWriter {
    counter: Option<u64>,
    direction: Direction,
    key: [u8; 32],
    session_id: [u8; 32],
}

impl EncryptedSession {
    pub(crate) fn initiator(schedule: KeySchedule) -> Self {
        Self::new(
            schedule,
            Direction::ResponderToInitiator,
            Direction::InitiatorToResponder,
        )
    }

    pub(crate) fn responder(handshake: ServerHandshake) -> Self {
        Self::new(
            handshake.schedule,
            Direction::InitiatorToResponder,
            Direction::ResponderToInitiator,
        )
    }

    pub(crate) fn transcript_hash_b64(&self) -> &str {
        &self.transcript_hash_b64
    }

    pub(crate) fn open_text(&mut self, frame_b64: &str) -> Result<String, E2eeError> {
        let frame = decode_canonical_base64(frame_b64)?;
        let plaintext = self.open(&frame, PayloadKind::Text)?;
        String::from_utf8(plaintext).map_err(|_| E2eeError::FrameInvalid)
    }

    pub(crate) fn open_binary(&mut self, frame: &[u8]) -> Result<Vec<u8>, E2eeError> {
        self.open(frame, PayloadKind::Binary)
    }

    pub(crate) fn seal_text(&mut self, plaintext: &str) -> Result<String, E2eeError> {
        self.seal(plaintext.as_bytes(), PayloadKind::Text)
            .map(|frame| BASE64.encode(frame))
    }

    pub(crate) fn seal_binary(&mut self, plaintext: &[u8]) -> Result<Vec<u8>, E2eeError> {
        self.seal(plaintext, PayloadKind::Binary)
    }

    pub(crate) fn split(self) -> (EncryptedReceiver, EncryptedWriter) {
        (
            EncryptedReceiver {
                counter: self.inbound_counter,
                direction: self.inbound_direction,
                key: self.inbound_key,
                session_id: self.session_id,
            },
            EncryptedWriter {
                counter: self.outbound_counter,
                direction: self.outbound_direction,
                key: self.outbound_key,
                session_id: self.session_id,
            },
        )
    }

    fn new(
        schedule: KeySchedule,
        inbound_direction: Direction,
        outbound_direction: Direction,
    ) -> Self {
        let (inbound_key, outbound_key) = match inbound_direction {
            Direction::InitiatorToResponder => (
                schedule.initiator_to_responder_key,
                schedule.responder_to_initiator_key,
            ),
            Direction::ResponderToInitiator => (
                schedule.responder_to_initiator_key,
                schedule.initiator_to_responder_key,
            ),
        };
        Self {
            inbound_counter: Some(0),
            inbound_direction,
            inbound_key,
            outbound_counter: Some(0),
            outbound_direction,
            outbound_key,
            session_id: schedule.session_id,
            transcript_hash_b64: BASE64.encode(schedule.transcript_hash),
        }
    }

    fn open(&mut self, encrypted: &[u8], kind: PayloadKind) -> Result<Vec<u8>, E2eeError> {
        let counter = self.inbound_counter.ok_or(E2eeError::CounterExhausted)?;
        let plaintext = frame::open(
            encrypted,
            &self.inbound_key,
            &self.session_id,
            self.inbound_direction,
            kind,
            counter,
        )?;
        self.inbound_counter = counter.checked_add(1);
        Ok(plaintext)
    }

    fn seal(&mut self, plaintext: &[u8], kind: PayloadKind) -> Result<Vec<u8>, E2eeError> {
        let counter = self.outbound_counter.ok_or(E2eeError::CounterExhausted)?;
        let encrypted = frame::seal(
            plaintext,
            &self.outbound_key,
            &self.session_id,
            self.outbound_direction,
            kind,
            counter,
        )?;
        self.outbound_counter = counter.checked_add(1);
        Ok(encrypted)
    }
}

impl EncryptedReceiver {
    pub(crate) fn open_binary(&mut self, encrypted: &[u8]) -> Result<Vec<u8>, E2eeError> {
        let counter = self.counter.ok_or(E2eeError::CounterExhausted)?;
        let plaintext = frame::open(
            encrypted,
            &self.key,
            &self.session_id,
            self.direction,
            PayloadKind::Binary,
            counter,
        )?;
        self.counter = counter.checked_add(1);
        Ok(plaintext)
    }
}

impl EncryptedWriter {
    pub(crate) fn seal_binary(&mut self, plaintext: &[u8]) -> Result<Vec<u8>, E2eeError> {
        let counter = self.counter.ok_or(E2eeError::CounterExhausted)?;
        let encrypted = frame::seal(
            plaintext,
            &self.key,
            &self.session_id,
            self.direction,
            PayloadKind::Binary,
            counter,
        )?;
        self.counter = counter.checked_add(1);
        Ok(encrypted)
    }
}

fn decode_canonical_base64(value: &str) -> Result<Vec<u8>, E2eeError> {
    let bytes = BASE64.decode(value).map_err(|_| E2eeError::FrameInvalid)?;
    if BASE64.encode(&bytes) != value {
        return Err(E2eeError::FrameInvalid);
    }
    Ok(bytes)
}

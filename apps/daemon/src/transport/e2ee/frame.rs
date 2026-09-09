use crypto_secretbox::aead::{Aead, KeyInit};
use crypto_secretbox::{Key, Nonce, XSalsa20Poly1305};
use subtle::ConstantTimeEq;

use super::{Direction, E2eeError, PayloadKind};

const NONCE_BYTES: usize = 24;
const SESSION_ID_BYTES: usize = 32;
const HEADER_BYTES: usize = SESSION_ID_BYTES + 1 + 1 + 8;
const TAG_BYTES: usize = 16;
pub(crate) const E2EE_FRAME_OVERHEAD_BYTES: usize = NONCE_BYTES + HEADER_BYTES + TAG_BYTES;

pub(super) fn seal(
    payload: &[u8],
    key: &[u8; 32],
    session_id: &[u8; 32],
    direction: Direction,
    kind: PayloadKind,
    counter: u64,
) -> Result<Vec<u8>, E2eeError> {
    let nonce = encode_nonce(session_id, direction, kind, counter);
    let header = encode_header(session_id, direction, kind, counter);
    let mut plaintext = Vec::with_capacity(HEADER_BYTES + payload.len());
    plaintext.extend(header);
    plaintext.extend(payload);
    let cipher = XSalsa20Poly1305::new(Key::from_slice(key));
    let ciphertext = cipher
        .encrypt(Nonce::from_slice(&nonce), plaintext.as_slice())
        .map_err(|_| E2eeError::Cryptography)?;
    let mut frame = Vec::with_capacity(NONCE_BYTES + ciphertext.len());
    frame.extend(nonce);
    frame.extend(ciphertext);
    Ok(frame)
}

pub(super) fn open(
    frame: &[u8],
    key: &[u8; 32],
    session_id: &[u8; 32],
    direction: Direction,
    kind: PayloadKind,
    counter: u64,
) -> Result<Vec<u8>, E2eeError> {
    if frame.len() < NONCE_BYTES + TAG_BYTES + HEADER_BYTES {
        return Err(E2eeError::FrameInvalid);
    }
    let nonce = encode_nonce(session_id, direction, kind, counter);
    if !bool::from(frame[..NONCE_BYTES].ct_eq(&nonce)) {
        return Err(E2eeError::FrameInvalid);
    }
    let cipher = XSalsa20Poly1305::new(Key::from_slice(key));
    let plaintext = cipher
        .decrypt(Nonce::from_slice(&nonce), &frame[NONCE_BYTES..])
        .map_err(|_| E2eeError::FrameInvalid)?;
    let expected_header = encode_header(session_id, direction, kind, counter);
    if !bool::from(plaintext[..HEADER_BYTES].ct_eq(&expected_header)) {
        return Err(E2eeError::FrameInvalid);
    }
    Ok(plaintext[HEADER_BYTES..].to_vec())
}

fn encode_header(
    session_id: &[u8; 32],
    direction: Direction,
    kind: PayloadKind,
    counter: u64,
) -> [u8; HEADER_BYTES] {
    let mut header = [0_u8; HEADER_BYTES];
    header[..SESSION_ID_BYTES].copy_from_slice(session_id);
    header[SESSION_ID_BYTES] = direction_byte(direction);
    header[SESSION_ID_BYTES + 1] = kind_byte(kind);
    header[SESSION_ID_BYTES + 2..].copy_from_slice(&counter.to_be_bytes());
    header
}

fn encode_nonce(
    session_id: &[u8; 32],
    direction: Direction,
    kind: PayloadKind,
    counter: u64,
) -> [u8; NONCE_BYTES] {
    let mut nonce = [0_u8; NONCE_BYTES];
    nonce[..12].copy_from_slice(&session_id[..12]);
    nonce[12] = 2;
    nonce[13] = direction_byte(direction);
    nonce[14] = kind_byte(kind);
    nonce[15] = 0;
    nonce[16..].copy_from_slice(&counter.to_be_bytes());
    nonce
}

fn direction_byte(direction: Direction) -> u8 {
    match direction {
        Direction::InitiatorToResponder => 0,
        Direction::ResponderToInitiator => 1,
    }
}

fn kind_byte(kind: PayloadKind) -> u8 {
    match kind {
        PayloadKind::Text => 0,
        PayloadKind::Binary => 1,
    }
}

use salsa20::cipher::consts::{U10, U16};
use salsa20::cipher::generic_array::GenericArray;
use salsa20::{Key, hsalsa};
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;
use x25519_dalek::x25519;

use super::{E2eeError, E2eeProfile};

pub(crate) struct KeySchedule {
    pub(super) initiator_to_responder_key: [u8; 32],
    pub(super) responder_to_initiator_key: [u8; 32],
    pub(super) session_id: [u8; 32],
    pub(super) transcript_hash: [u8; 32],
}

pub(super) fn derive_key_schedule(
    profile: E2eeProfile,
    own_secret_key: [u8; 32],
    peer_public_key: [u8; 32],
    client_nonce: [u8; 32],
    server_nonce: [u8; 32],
    transcript: &[u8],
) -> Result<KeySchedule, E2eeError> {
    let shared_secret = box_before(own_secret_key, peer_public_key)?;
    let transcript_hash = Sha256::digest(transcript);
    let salt = Sha256::new()
        .chain_update(profile.salt_label)
        .chain_update(client_nonce)
        .chain_update(server_nonce)
        .finalize();
    let mut info = Vec::with_capacity(profile.info_label.len() + transcript_hash.len());
    info.extend(profile.info_label);
    info.extend(transcript_hash);
    let expanded = hkdf_sha256(&salt, &shared_secret, &info);
    Ok(KeySchedule {
        initiator_to_responder_key: expanded[0..32]
            .try_into()
            .map_err(|_| E2eeError::Cryptography)?,
        responder_to_initiator_key: expanded[32..64]
            .try_into()
            .map_err(|_| E2eeError::Cryptography)?,
        session_id: expanded[64..96]
            .try_into()
            .map_err(|_| E2eeError::Cryptography)?,
        transcript_hash: transcript_hash.into(),
    })
}

fn hkdf_sha256(salt: &[u8], input_key_material: &[u8], info: &[u8]) -> [u8; 96] {
    let pseudorandom_key = hmac_sha256(salt, input_key_material);
    let mut expanded = [0_u8; 96];
    let mut previous = Vec::new();
    for block in 1_u8..=3 {
        let mut input = Vec::with_capacity(previous.len() + info.len() + 1);
        input.extend(&previous);
        input.extend(info);
        input.push(block);
        previous = hmac_sha256(&pseudorandom_key, &input).to_vec();
        let start = usize::from(block - 1) * 32;
        expanded[start..start + 32].copy_from_slice(&previous);
    }
    expanded
}

fn hmac_sha256(key: &[u8], message: &[u8]) -> [u8; 32] {
    const BLOCK_BYTES: usize = 64;
    let mut normalized_key = [0_u8; BLOCK_BYTES];
    if key.len() > BLOCK_BYTES {
        normalized_key[..32].copy_from_slice(&Sha256::digest(key));
    } else {
        normalized_key[..key.len()].copy_from_slice(key);
    }
    let mut inner_pad = [0x36_u8; BLOCK_BYTES];
    let mut outer_pad = [0x5c_u8; BLOCK_BYTES];
    for index in 0..BLOCK_BYTES {
        inner_pad[index] ^= normalized_key[index];
        outer_pad[index] ^= normalized_key[index];
    }
    let inner = Sha256::new()
        .chain_update(inner_pad)
        .chain_update(message)
        .finalize();
    Sha256::new()
        .chain_update(outer_pad)
        .chain_update(inner)
        .finalize()
        .into()
}

fn box_before(own_secret_key: [u8; 32], peer_public_key: [u8; 32]) -> Result<[u8; 32], E2eeError> {
    let x25519_shared = x25519(own_secret_key, peer_public_key);
    if bool::from(x25519_shared.ct_eq(&[0_u8; 32])) {
        return Err(E2eeError::Cryptography);
    }
    let key = Key::from_slice(&x25519_shared);
    let zero_input = GenericArray::<u8, U16>::default();
    Ok(hsalsa::<U10>(key, &zero_input).into())
}

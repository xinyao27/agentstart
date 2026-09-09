use std::error::Error;
use std::fmt::{Display, Formatter};

use prost::{DecodeError, Message};

use crate::CURRENT_PROTOCOL_VERSION;
use crate::protocol::v1::{Frame, ProtocolVersion, Status, StatusCode};

pub const FRAME_PREAMBLE_BYTES: usize = 5;
const FRAME_MAGIC: [u8; 4] = *b"YIRU";
const FRAME_WIRE_VERSION: u8 = ProtocolVersion::V2 as u8;

#[derive(Debug)]
pub enum FrameCodecError {
    EnvelopeVersion { envelope: u32, wire: u8 },
    LengthOverflow,
    Malformed(DecodeError),
    MissingBody,
    TruncatedPreamble,
    UnsupportedVersion(u8),
}

impl Display for FrameCodecError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::EnvelopeVersion { envelope, wire } => write!(
                formatter,
                "frame envelope version {envelope} does not match wire version {wire}"
            ),
            Self::Malformed(error) => write!(formatter, "malformed protobuf frame: {error}"),
            Self::LengthOverflow => formatter.write_str("Yiru frame length cannot be represented"),
            Self::MissingBody => formatter.write_str("protobuf frame has no body"),
            Self::TruncatedPreamble => formatter.write_str("Yiru frame preamble is truncated"),
            Self::UnsupportedVersion(version) => {
                write!(formatter, "unsupported Yiru wire version {version}")
            }
        }
    }
}

impl Error for FrameCodecError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Malformed(error) => Some(error),
            Self::EnvelopeVersion { .. }
            | Self::LengthOverflow
            | Self::MissingBody
            | Self::TruncatedPreamble
            | Self::UnsupportedVersion(_) => None,
        }
    }
}

pub fn has_frame_preamble(bytes: &[u8]) -> bool {
    bytes.starts_with(&FRAME_MAGIC)
}

pub fn decode_frame(bytes: &[u8]) -> Result<Option<Frame>, FrameCodecError> {
    if !has_frame_preamble(bytes) {
        return Ok(None);
    }
    if bytes.len() < FRAME_PREAMBLE_BYTES {
        return Err(FrameCodecError::TruncatedPreamble);
    }
    let wire_version = bytes[FRAME_MAGIC.len()];
    if wire_version != FRAME_WIRE_VERSION {
        return Err(FrameCodecError::UnsupportedVersion(wire_version));
    }
    let frame =
        Frame::decode(&bytes[FRAME_PREAMBLE_BYTES..]).map_err(FrameCodecError::Malformed)?;
    if frame.protocol_version != u32::from(wire_version) {
        return Err(FrameCodecError::EnvelopeVersion {
            envelope: frame.protocol_version,
            wire: wire_version,
        });
    }
    if frame.body.is_none() {
        return Err(FrameCodecError::MissingBody);
    }
    Ok(Some(frame))
}

pub fn encode_frame(frame: &Frame) -> Result<Vec<u8>, FrameCodecError> {
    if frame.protocol_version != CURRENT_PROTOCOL_VERSION {
        return Err(FrameCodecError::EnvelopeVersion {
            envelope: frame.protocol_version,
            wire: FRAME_WIRE_VERSION,
        });
    }
    if frame.body.is_none() {
        return Err(FrameCodecError::MissingBody);
    }
    let capacity = FRAME_PREAMBLE_BYTES
        .checked_add(frame.encoded_len())
        .ok_or(FrameCodecError::LengthOverflow)?;
    let mut bytes = Vec::with_capacity(capacity);
    bytes.extend_from_slice(&FRAME_MAGIC);
    bytes.push(FRAME_WIRE_VERSION);
    // Why: `Vec` grows on demand, so encoding in place after the preamble cannot run out of
    // buffer; `encode` would only add an error path that can never be taken.
    frame.encode_raw(&mut bytes);
    Ok(bytes)
}

pub fn decode<M>(payload: &[u8]) -> Result<M, Status>
where
    M: Message + Default,
{
    M::decode(payload).map_err(|error| Status {
        code: StatusCode::InvalidArgument as i32,
        message: error.to_string(),
        details: Vec::new(),
    })
}

pub fn encode<M>(message: &M) -> Vec<u8>
where
    M: Message,
{
    message.encode_to_vec()
}

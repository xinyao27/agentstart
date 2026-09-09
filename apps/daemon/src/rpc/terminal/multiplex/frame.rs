use std::sync::LazyLock;

use super::*;

pub(super) fn encode_frame(
    opcode: u8,
    route_id: u32,
    epoch: u64,
    sequence: u64,
    correlation_id: u32,
    payload: &[u8],
) -> Result<Vec<u8>, SessionError> {
    if payload.len() > DEFAULT_MAX_FRAME_BYTES
        || (matches!(opcode, OP_EPOCH | OP_HEARTBEAT) && route_id != 0)
        || (!matches!(opcode, OP_EPOCH | OP_HEARTBEAT) && route_id == 0)
    {
        return Err(SessionError::InvalidTerminalFrame);
    }
    let mut bytes = vec![0_u8; FRAME_HEADER_BYTES + payload.len()];
    bytes[0] = 0x74;
    bytes[1] = 1;
    bytes[2] = opcode;
    bytes[4..6].copy_from_slice(&(FRAME_HEADER_BYTES as u16).to_le_bytes());
    bytes[8..12].copy_from_slice(&route_id.to_le_bytes());
    bytes[12..16].copy_from_slice(&(payload.len() as u32).to_le_bytes());
    bytes[16..24].copy_from_slice(&epoch.to_le_bytes());
    bytes[24..32].copy_from_slice(&sequence.to_le_bytes());
    bytes[32..36].copy_from_slice(&correlation_id.to_le_bytes());
    bytes[FRAME_HEADER_BYTES..].copy_from_slice(payload);
    Ok(bytes)
}

pub(super) struct FrameDecodeFailure {
    pub(super) close_code: u16,
    pub(super) reason: &'static str,
}

pub(super) fn decode_frame(mut bytes: Vec<u8>) -> Result<Frame, FrameDecodeFailure> {
    if bytes.len() < FRAME_HEADER_BYTES
        || bytes[0] != 0x74
        || bytes[1] != 1
        || bytes[3] != 0
        || read_u16(&bytes, 4) != FRAME_HEADER_BYTES as u16
        || read_u16(&bytes, 6) != 0
        || read_u32(&bytes, 36) != 0
    {
        return Err(FrameDecodeFailure {
            close_code: 1002,
            reason: "invalid terminal frame header",
        });
    }
    let opcode = bytes[2];
    let route_id = read_u32(&bytes, 8);
    let payload_bytes = read_u32(&bytes, 12) as usize;
    if payload_bytes > DEFAULT_MAX_FRAME_BYTES || bytes.len() != FRAME_HEADER_BYTES + payload_bytes
    {
        return Err(FrameDecodeFailure {
            close_code: 1009,
            reason: "invalid terminal frame length",
        });
    }
    if (matches!(opcode, OP_EPOCH | OP_HEARTBEAT) && route_id != 0)
        || (!matches!(opcode, OP_EPOCH | OP_HEARTBEAT) && route_id == 0)
    {
        return Err(FrameDecodeFailure {
            close_code: 1002,
            reason: "invalid terminal frame route",
        });
    }
    let correlation_id = read_u32(&bytes, 32);
    let epoch = read_u64(&bytes, 16);
    let sequence = read_u64(&bytes, 24);
    bytes.drain(..FRAME_HEADER_BYTES);
    Ok(Frame {
        correlation_id,
        epoch,
        opcode,
        payload: bytes,
        route_id,
        sequence,
    })
}

pub(super) fn valid_epoch_accept(payload: &[u8], generation: u32) -> bool {
    payload.len() == EPOCH_BYTES
        && payload[0] == 1
        && payload[1] == 0
        && read_u16(payload, 2) == 0
        && read_u32(payload, 4) == DEFAULT_MAX_FRAME_BYTES as u32
        && read_u32(payload, 8) == MAX_STREAMS as u32
        && read_u32(payload, 12) == HEARTBEAT.as_millis() as u32
        && read_u32(payload, 16) == generation
        && read_u32(payload, 20) == 0
}

pub(super) fn decode_heartbeat(payload: &[u8]) -> Option<(u8, u64)> {
    if payload.len() != HEARTBEAT_BYTES
        || payload[0] > 1
        || payload[1] > 2
        || read_u16(payload, 2) != 0
    {
        return None;
    }
    Some((payload[0], read_u64(payload, 8)))
}

pub(super) fn decode_subscribe(payload: &[u8]) -> Option<SubscribeRecord> {
    let record = serde_json::from_slice::<SubscribeRecord>(payload).ok()?;
    parse_decimal_u64(&record.last_parsed_seq)?;
    let client_type = record.client.r#type.as_str();
    let priority = record.delivery.priority.as_str();
    let viewport_valid = record.viewport.is_none_or(|viewport| {
        (1..=1_000).contains(&viewport.cols) && (1..=500).contains(&viewport.rows)
    });
    (!record.terminal.is_empty()
        && !record.transport_generation.is_empty()
        && !record.client.id.is_empty()
        && matches!(client_type, "desktop" | "mobile" | "web")
        && matches!(priority, "parked" | "visible" | "active")
        && record.snapshot_max_bytes <= u64::from(u32::MAX)
        && record.capabilities.dual_screen_snapshot == 1
        && record.capabilities.explicit_write_ack == 1
        && record.capabilities.parse_ack == 1
        && viewport_valid
        && is_uuid(&record.transport_generation))
    .then_some(record)
}

pub(super) fn parse_decimal_u64(value: &str) -> Option<u64> {
    if value == "0" {
        return Some(0);
    }
    if value.starts_with('0') || !value.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    value.parse().ok()
}

pub(super) fn is_uuid(value: &str) -> bool {
    if matches!(
        value,
        "00000000-0000-0000-0000-000000000000" | "ffffffff-ffff-ffff-ffff-ffffffffffff"
    ) {
        return true;
    }
    value.len() == 36
        && value.bytes().enumerate().all(|(index, byte)| match index {
            8 | 13 | 18 | 23 => byte == b'-',
            14 => matches!(byte, b'1'..=b'8'),
            19 => matches!(byte, b'8' | b'9' | b'a' | b'b' | b'A' | b'B'),
            _ => byte.is_ascii_hexdigit(),
        })
}

pub(super) fn decode_ack(payload: &[u8]) -> Option<(u8, u8, u32, u64, u32)> {
    if payload.len() != ACK_BYTES || payload[0] > 3 || payload[1] > 3 || read_u32(payload, 20) != 0
    {
        return None;
    }
    Some((
        payload[0],
        payload[1],
        read_u32(payload, 4),
        read_u64(payload, 8),
        read_u32(payload, 16),
    ))
}

pub(super) fn decode_credit(payload: &[u8]) -> Option<(u8, u32, u32, u32)> {
    if payload.len() != CREDIT_BYTES
        || payload[0] > 1
        || payload[1] > 3
        || read_u16(payload, 2) != 0
    {
        return None;
    }
    Some((
        payload[0],
        read_u32(payload, 4),
        read_u32(payload, 8),
        read_u32(payload, 12),
    ))
}

pub(super) fn decode_input(payload: &[u8]) -> Option<(u8, Vec<u8>)> {
    if payload.len() < 8
        || payload[0] > 1
        || payload[1] != 0
        || read_u16(payload, 2) != 0
        || read_u32(payload, 4) as usize != payload.len() - 8
        || payload.len() - 8 > DEFAULT_MAX_FRAME_BYTES
        || std::str::from_utf8(&payload[8..]).is_err()
    {
        return None;
    }
    Some((payload[0], payload[8..].to_vec()))
}

pub(super) fn decode_visibility(payload: &[u8]) -> Option<(bool, bool, u8, u32)> {
    if payload.len() != 8 || payload[0] > 1 || payload[1] > 1 || payload[2] > 2 || payload[3] != 0 {
        return None;
    }
    Some((
        payload[0] == 1,
        payload[1] == 1,
        payload[2],
        read_u32(payload, 4),
    ))
}

pub(super) fn decode_kill(payload: &[u8]) -> Option<bool> {
    (payload.len() == 8
        && payload[0] <= 1
        && payload[1] == 1
        && read_u16(payload, 2) == 0
        && read_u32(payload, 4) == 0)
        .then_some(payload[0] == 1)
}

pub(super) fn parse_viewport(record: &serde_json::Map<String, Value>) -> Option<Viewport> {
    let cols = u16::try_from(record.get("cols")?.as_u64()?).ok()?;
    let rows = u16::try_from(record.get("rows")?.as_u64()?).ok()?;
    ((1..=1_000).contains(&cols) && (1..=500).contains(&rows)).then_some(Viewport { cols, rows })
}

pub(super) fn random_nonzero_u64() -> Result<u64, getrandom::Error> {
    loop {
        let mut bytes = [0_u8; 8];
        getrandom::fill(&mut bytes)?;
        let value = u64::from_le_bytes(bytes);
        if value != 0 {
            return Ok(value);
        }
    }
}

pub(super) fn random_u32() -> Result<u32, getrandom::Error> {
    let mut bytes = [0_u8; 4];
    getrandom::fill(&mut bytes)?;
    Ok(u32::from_le_bytes(bytes))
}

pub(super) fn monotonic_micros() -> u64 {
    static START: LazyLock<Instant> = LazyLock::new(Instant::now);
    u64::try_from(START.elapsed().as_micros()).unwrap_or(u64::MAX)
}

pub(super) fn read_u16(bytes: &[u8], offset: usize) -> u16 {
    bytes
        .get(offset..offset + 2)
        .and_then(|value| value.try_into().ok())
        .map(u16::from_le_bytes)
        .unwrap_or_default()
}

pub(super) fn read_u32(bytes: &[u8], offset: usize) -> u32 {
    bytes
        .get(offset..offset + 4)
        .and_then(|value| value.try_into().ok())
        .map(u32::from_le_bytes)
        .unwrap_or_default()
}

pub(super) fn read_u64(bytes: &[u8], offset: usize) -> u64 {
    bytes
        .get(offset..offset + 8)
        .and_then(|value| value.try_into().ok())
        .map(u64::from_le_bytes)
        .unwrap_or_default()
}

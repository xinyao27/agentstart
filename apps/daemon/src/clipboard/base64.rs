pub(super) fn decode_node_base64(value: String) -> Vec<u8> {
    let mut bytes = value.into_bytes();
    let padding = bytes.iter().rev().take_while(|byte| **byte == b'=').count();
    let source_length = bytes.len().saturating_sub(padding);
    let complete_length = source_length / 4 * 4;
    let mut input = 0;
    let mut output = 0;
    while input < complete_length {
        let bits = (u32::from(base64_value(bytes[input])) << 18)
            | (u32::from(base64_value(bytes[input + 1])) << 12)
            | (u32::from(base64_value(bytes[input + 2])) << 6)
            | u32::from(base64_value(bytes[input + 3]));
        bytes[output] = (bits >> 16) as u8;
        bytes[output + 1] = (bits >> 8) as u8;
        bytes[output + 2] = bits as u8;
        input += 4;
        output += 3;
    }
    let remainder = source_length - complete_length;
    if remainder >= 2 {
        let first = bytes[complete_length];
        let second = bytes[complete_length + 1];
        bytes[output] = (base64_value(first) << 2) | (base64_value(second) >> 4);
        output += 1;
        if remainder >= 3 {
            let third = bytes[complete_length + 2];
            bytes[output] = (base64_value(second) << 4) | (base64_value(third) >> 2);
            output += 1;
        }
    }
    bytes.truncate(output);
    bytes
}

pub(crate) fn is_valid_base64(value: &str) -> bool {
    if value.len() % 4 == 1 {
        return false;
    }
    let mut padding = 0;
    for byte in value.bytes().rev() {
        if byte == b'=' && padding < 2 {
            padding += 1;
        } else {
            break;
        }
    }
    value.as_bytes()[..value.len() - padding]
        .iter()
        .all(|byte| byte.is_ascii_alphanumeric() || matches!(*byte, b'+' | b'/'))
        && value.as_bytes()[value.len() - padding..]
            .iter()
            .all(|byte| *byte == b'=')
}

fn base64_value(byte: u8) -> u8 {
    match byte {
        b'A'..=b'Z' => byte - b'A',
        b'a'..=b'z' => byte - b'a' + 26,
        b'0'..=b'9' => byte - b'0' + 52,
        b'+' => 62,
        b'/' => 63,
        // Why: the RPC validator owns the alphabet, keeping this hot decode loop branch-light.
        _ => 0,
    }
}

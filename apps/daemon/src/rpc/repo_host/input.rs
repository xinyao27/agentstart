pub(super) fn normalize_host_id(value: &str) -> Option<String> {
    let value = value.trim_matches(is_ecmascript_whitespace);
    if value == "local" {
        return Some(value.to_owned());
    }
    let encoded = ["runtime:", "ssh:", "wsl:"]
        .into_iter()
        .find_map(|prefix| value.strip_prefix(prefix))?;
    (!encoded.is_empty() && decode_component(encoded).is_some()).then(|| value.to_owned())
}

fn decode_component(value: &str) -> Option<String> {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            decoded.push(hex(*bytes.get(index + 1)?)? * 16 + hex(*bytes.get(index + 2)?)?);
            index += 3;
        } else {
            decoded.push(bytes[index]);
            index += 1;
        }
    }
    String::from_utf8(decoded)
        .ok()
        .filter(|value| !value.is_empty())
}

fn hex(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

fn is_ecmascript_whitespace(character: char) -> bool {
    matches!(
        character,
        '\u{0009}'..='\u{000d}'
            | '\u{0020}'
            | '\u{00a0}'
            | '\u{1680}'
            | '\u{2000}'..='\u{200a}'
            | '\u{2028}'
            | '\u{2029}'
            | '\u{202f}'
            | '\u{205f}'
            | '\u{3000}'
            | '\u{feff}'
    )
}

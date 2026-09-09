pub(crate) fn normalize_host_id(value: &str) -> Option<String> {
    let value = value.trim();
    if value == "local" {
        return Some(value.to_owned());
    }
    let encoded = value
        .strip_prefix("runtime:")
        .or_else(|| value.strip_prefix("ssh:"))
        .or_else(|| value.strip_prefix("wsl:"))?;
    if encoded.is_empty() || decode_component(encoded).is_none_or(|decoded| decoded.is_empty()) {
        return None;
    }
    Some(value.to_owned())
}

fn decode_component(value: &str) -> Option<String> {
    let mut bytes = Vec::with_capacity(value.len());
    let mut input = value.as_bytes().iter().copied();
    while let Some(byte) = input.next() {
        if byte != b'%' {
            bytes.push(byte);
            continue;
        }
        let high = hex(input.next()?)?;
        let low = hex(input.next()?)?;
        bytes.push((high << 4) | low);
    }
    String::from_utf8(bytes).ok()
}

fn hex(value: u8) -> Option<u8> {
    match value {
        b'0'..=b'9' => Some(value - b'0'),
        b'a'..=b'f' => Some(value - b'a' + 10),
        b'A'..=b'F' => Some(value - b'A' + 10),
        _ => None,
    }
}

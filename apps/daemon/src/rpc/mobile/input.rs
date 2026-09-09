use std::net::Ipv4Addr;

use regex::Regex;

use crate::mobile::MobileDevelopmentPairingInput;

pub(super) fn parse_development_values(
    address: &str,
    device_name: &str,
) -> Result<MobileDevelopmentPairingInput, ()> {
    let address = trim_ecmascript(address);
    let device_name = trim_ecmascript(device_name);
    if !is_manual_network_address(&address)
        || device_name.is_empty()
        || device_name.encode_utf16().count() > 256
    {
        return Err(());
    }
    Ok(MobileDevelopmentPairingInput {
        address,
        device_name,
    })
}

fn is_manual_network_address(value: &str) -> bool {
    if value.is_empty() || value.chars().any(is_ecmascript_whitespace) {
        return false;
    }
    let Some((host, port)) = split_host_port(value) else {
        return false;
    };
    if host.is_empty() || host.len() > 253 || port.is_some_and(|port| !is_valid_port(port)) {
        return false;
    }
    if is_ipv4(host) {
        return true;
    }
    let last_label = host.rsplit('.').next().unwrap_or_default();
    if last_label.bytes().all(|byte| byte.is_ascii_digit()) || is_hex_numeric_label(last_label) {
        return false;
    }
    Regex::new(
        r"(?i)^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$",
    )
    .expect("hostname regex is valid")
    .is_match(host)
}

fn split_host_port(value: &str) -> Option<(&str, Option<&str>)> {
    let Some(first_colon) = value.find(':') else {
        return Some((value, None));
    };
    if value[first_colon + 1..].contains(':') {
        return Some((value, None));
    }
    Some((&value[..first_colon], Some(&value[first_colon + 1..])))
}

fn is_valid_port(value: &str) -> bool {
    !value.is_empty()
        && !value.starts_with('0')
        && value.bytes().all(|byte| byte.is_ascii_digit())
        && value.parse::<u16>().is_ok_and(|port| port > 0)
}

fn is_ipv4(value: &str) -> bool {
    if value.parse::<Ipv4Addr>().is_ok() {
        return true;
    }
    let octets = value.split('.').collect::<Vec<_>>();
    octets.len() == 4
        && octets.iter().all(|octet| {
            !octet.is_empty()
                && octet.len() <= 3
                && octet.bytes().all(|byte| byte.is_ascii_digit())
                && octet.parse::<u16>().is_ok_and(|value| value <= 255)
        })
}

fn is_hex_numeric_label(value: &str) -> bool {
    value
        .get(..2)
        .is_some_and(|prefix| prefix.eq_ignore_ascii_case("0x"))
        && value[2..].bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn trim_ecmascript(value: &str) -> String {
    value.trim_matches(is_ecmascript_whitespace).to_owned()
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

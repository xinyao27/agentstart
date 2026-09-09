use serde_json::Value;

#[derive(Clone, Copy, Eq, PartialEq)]
enum IpVersion {
    V4,
    V6,
}

#[derive(Clone, Copy)]
struct ParsedIpAddress {
    bits: u8,
    value: u128,
    version: IpVersion,
}

#[derive(Clone, Copy)]
struct IpRange {
    end: u128,
    start: u128,
    version: IpVersion,
}

pub(super) fn has_sufficient_remote_scope(
    rule_scopes: Option<&Value>,
    local_address: Option<&Value>,
    local_prefix_length: Option<&Value>,
) -> bool {
    let local_subnet = parse_subnet(local_address, local_prefix_length);
    match rule_scopes.and_then(Value::as_array) {
        Some(rules) => rules
            .iter()
            .any(|rule| rule_has_sufficient_scope(rule, local_subnet)),
        None => rule_scopes.is_some_and(|rule| rule_has_sufficient_scope(rule, local_subnet)),
    }
}

fn rule_has_sufficient_scope(rule: &Value, local_subnet: Option<IpRange>) -> bool {
    let Some(rule) = rule.as_object() else {
        return false;
    };
    let addresses = rule.get("remoteAddresses");
    match addresses.and_then(Value::as_array) {
        Some(addresses) => addresses.iter().any(|address| {
            address
                .as_str()
                .is_some_and(|scope| address_scope_is_sufficient(scope, local_subnet))
        }),
        None => addresses
            .and_then(Value::as_str)
            .is_some_and(|scope| address_scope_is_sufficient(scope, local_subnet)),
    }
}

fn address_scope_is_sufficient(scope: &str, local_subnet: Option<IpRange>) -> bool {
    let normalized = scope.trim().to_ascii_lowercase();
    if matches!(normalized.as_str(), "any" | "localsubnet") {
        return true;
    }
    if matches!(
        normalized.as_str(),
        "any4" | "any6" | "localsubnet4" | "localsubnet6"
    ) {
        let expected = if normalized.ends_with('4') {
            IpVersion::V4
        } else {
            IpVersion::V6
        };
        return local_subnet.is_some_and(|subnet| subnet.version == expected);
    }
    let Some(local_subnet) = local_subnet else {
        return false;
    };
    // Why: a single-host VPN subnet is only the daemon and cannot prove phone access.
    let Some(explicit_range) = parse_ip_range(scope) else {
        return false;
    };
    local_subnet.start != local_subnet.end
        && explicit_range.version == local_subnet.version
        && explicit_range.start <= local_subnet.start
        && explicit_range.end >= local_subnet.end
}

fn parse_subnet(address: Option<&Value>, prefix_length: Option<&Value>) -> Option<IpRange> {
    let address = address?.as_str()?;
    let prefix_length = prefix_length?.as_f64()?;
    if !prefix_length.is_finite() || prefix_length.fract() != 0.0 {
        return None;
    }
    let parsed = parse_ip_address(address)?;
    subnet_from_parsed(parsed, prefix_length as i32)
}

fn subnet_from_parsed(parsed: ParsedIpAddress, prefix_length: i32) -> Option<IpRange> {
    if !(0..=i32::from(parsed.bits)).contains(&prefix_length) {
        return None;
    }
    let host_bits = u32::from(parsed.bits) - prefix_length as u32;
    let host_mask = match host_bits {
        0 => 0,
        128 => u128::MAX,
        bits => (1_u128 << bits) - 1,
    };
    let start = parsed.value & !host_mask;
    Some(IpRange {
        end: start | host_mask,
        start,
        version: parsed.version,
    })
}

fn mask_prefix_length(mask_text: &str, version: IpVersion) -> Option<i32> {
    let mask = parse_ip_address(mask_text)?;
    if mask.version != version {
        return None;
    }
    let full_mask = if mask.bits == 128 {
        u128::MAX
    } else {
        (1_u128 << mask.bits) - 1
    };
    let host_part = !mask.value & full_mask;
    if host_part & host_part.wrapping_add(1) != 0 {
        return None;
    }
    Some(i32::from(mask.bits) - host_part.count_ones() as i32)
}

fn parse_ip_range(scope: &str) -> Option<IpRange> {
    let trimmed = scope.trim();
    if let Some(dash_index) = trimmed.find('-') {
        if dash_index != trimmed.rfind('-')? {
            return None;
        }
        let start = parse_ip_address(&trimmed[..dash_index])?;
        let end = parse_ip_address(&trimmed[dash_index + 1..])?;
        if start.version != end.version || start.value > end.value {
            return None;
        }
        return Some(IpRange {
            end: end.value,
            start: start.value,
            version: start.version,
        });
    }
    if let Some(slash_index) = trimmed.find('/') {
        if slash_index != trimmed.rfind('/')? {
            return None;
        }
        let address = parse_ip_address(&trimmed[..slash_index])?;
        let suffix = &trimmed[slash_index + 1..];
        let prefix_length =
            if !suffix.is_empty() && suffix.bytes().all(|byte| byte.is_ascii_digit()) {
                suffix.parse::<i32>().ok()?
            } else {
                mask_prefix_length(suffix, address.version)?
            };
        return subnet_from_parsed(address, prefix_length);
    }
    let address = parse_ip_address(trimmed)?;
    Some(IpRange {
        end: address.value,
        start: address.value,
        version: address.version,
    })
}

fn parse_ip_address(input: &str) -> Option<ParsedIpAddress> {
    let trimmed = input.trim();
    let bracketed = trimmed.starts_with('[') || trimmed.ends_with(']');
    if bracketed && !(trimmed.starts_with('[') && trimmed.ends_with(']')) {
        return None;
    }
    let address = if bracketed {
        &trimmed[1..trimmed.len() - 1]
    } else {
        trimmed
    };
    let address = address.split('%').next().unwrap_or_default();
    if address.contains(':') {
        parse_ipv6(address)
    } else {
        parse_ipv4(address)
    }
}

fn parse_ipv4(address: &str) -> Option<ParsedIpAddress> {
    let octets = address.split('.').collect::<Vec<_>>();
    if octets.len() != 4
        || octets.iter().any(|octet| {
            octet.is_empty() || octet.len() > 3 || !octet.bytes().all(|byte| byte.is_ascii_digit())
        })
    {
        return None;
    }
    let mut value = 0_u128;
    for octet in octets {
        let octet = octet.parse::<u16>().ok()?;
        if octet > 255 {
            return None;
        }
        value = (value << 8) | u128::from(octet);
    }
    Some(ParsedIpAddress {
        bits: 32,
        value,
        version: IpVersion::V4,
    })
}

fn parse_ipv6(address: &str) -> Option<ParsedIpAddress> {
    let expanded_address = expand_embedded_ipv4(address)?;
    let halves = expanded_address.split("::").collect::<Vec<_>>();
    if halves.len() > 2 {
        return None;
    }
    let left = split_ipv6_half(halves.first().copied().unwrap_or_default())?;
    let right = split_ipv6_half(halves.get(1).copied().unwrap_or_default())?;
    let has_compression = halves.len() == 2;
    let missing_groups = 8_i32 - left.len() as i32 - right.len() as i32;
    if (!has_compression && missing_groups != 0) || (has_compression && missing_groups < 1) {
        return None;
    }
    let mut value = 0_u128;
    for group in left
        .into_iter()
        .chain(std::iter::repeat_n(0, missing_groups as usize))
        .chain(right)
    {
        value = (value << 16) | u128::from(group);
    }
    Some(ParsedIpAddress {
        bits: 128,
        value,
        version: IpVersion::V6,
    })
}

fn expand_embedded_ipv4(address: &str) -> Option<String> {
    if !address.contains('.') {
        return Some(address.to_owned());
    }
    let last_colon = address.rfind(':')?;
    let ipv4 = parse_ipv4(&address[last_colon + 1..])?;
    let high = (ipv4.value >> 16) & 0xffff;
    let low = ipv4.value & 0xffff;
    Some(format!("{}:{high:x}:{low:x}", &address[..last_colon]))
}

fn split_ipv6_half(half: &str) -> Option<Vec<u16>> {
    if half.is_empty() {
        return Some(Vec::new());
    }
    half.split(':')
        .map(|group| {
            if group.is_empty()
                || group.len() > 4
                || !group.bytes().all(|byte| byte.is_ascii_hexdigit())
            {
                return None;
            }
            u16::from_str_radix(group, 16).ok()
        })
        .collect()
}

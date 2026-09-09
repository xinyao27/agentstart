use std::collections::HashSet;

use crate::workspace_ports::RawWorkspacePort;

#[derive(Clone, Debug, Default)]
pub(super) struct ProcessMetadata {
    pub(super) command_line: Option<String>,
    pub(super) cwd: Option<String>,
    pub(super) process_name: Option<String>,
}

pub(super) fn parse_lsof(output: &str) -> Vec<RawWorkspacePort> {
    let mut ports = Vec::new();
    let mut pid = None;
    let mut process_name = None;
    for line in output.lines().filter(|line| !line.is_empty()) {
        let (tag, value) = line.split_at(1);
        match tag {
            "p" => {
                pid = value.parse().ok();
                process_name = None;
            }
            "c" => process_name = nonempty(value),
            "n" => {
                if let Some((bind_host, port)) = parse_address(value) {
                    ports.push(RawWorkspacePort {
                        bind_host,
                        command_line: None,
                        cwd: None,
                        pid,
                        port,
                        process_name: process_name.clone(),
                    });
                }
            }
            _ => {}
        }
    }
    dedupe(ports)
}

pub(super) fn parse_netstat(output: &str) -> Vec<RawWorkspacePort> {
    let mut ports = Vec::new();
    for line in output.lines() {
        let fields = line.split_whitespace().collect::<Vec<_>>();
        if !fields
            .first()
            .is_some_and(|field| field.eq_ignore_ascii_case("TCP"))
        {
            continue;
        }
        let Some(state_index) = fields
            .iter()
            .position(|field| field.eq_ignore_ascii_case("LISTENING"))
        else {
            continue;
        };
        if state_index < 2 {
            continue;
        }
        let Some((bind_host, port)) = fields.get(1).and_then(|value| parse_address(value)) else {
            continue;
        };
        ports.push(RawWorkspacePort {
            bind_host,
            command_line: None,
            cwd: None,
            pid: fields
                .get(state_index + 1)
                .and_then(|value| value.parse().ok()),
            port,
            process_name: None,
        });
    }
    dedupe(ports)
}

pub(super) fn parse_proc_net(output: &str) -> Vec<(String, u16, u64)> {
    output
        .lines()
        .filter_map(|line| {
            let fields = line.split_whitespace().collect::<Vec<_>>();
            if fields.len() < 10 || fields.get(3) != Some(&"0A") {
                return None;
            }
            let (host, port) = parse_proc_address(fields[1])?;
            let inode = fields[9].parse().ok()?;
            (inode != 0).then_some((host, port, inode))
        })
        .collect()
}

pub(super) fn dedupe(ports: Vec<RawWorkspacePort>) -> Vec<RawWorkspacePort> {
    let mut seen = HashSet::new();
    ports
        .into_iter()
        .filter(|port| {
            seen.insert((
                connect_host(&port.bind_host).to_owned(),
                port.port,
                port.pid,
            ))
        })
        .collect()
}

fn parse_address(value: &str) -> Option<(String, u16)> {
    let value = value.trim().trim_end_matches(" (LISTEN)");
    if let Some(value) = value.strip_prefix('[') {
        let (host, port) = value.rsplit_once("]:")?;
        return valid_port(port).map(|port| (host.to_owned(), port));
    }
    let (host, port) = value.rsplit_once(':')?;
    valid_port(port).map(|port| (host.to_owned(), port))
}

fn valid_port(value: &str) -> Option<u16> {
    value.parse().ok().filter(|port| *port > 0)
}

fn parse_proc_address(value: &str) -> Option<(String, u16)> {
    let (address, port) = value.split_once(':')?;
    let port = u16::from_str_radix(port, 16)
        .ok()
        .filter(|port| *port > 0)?;
    match address.len() {
        8 => {
            let bytes = [6, 4, 2, 0]
                .map(|offset| u8::from_str_radix(&address[offset..offset + 2], 16).ok())
                .into_iter()
                .collect::<Option<Vec<_>>>()?;
            Some((
                bytes
                    .iter()
                    .map(u8::to_string)
                    .collect::<Vec<_>>()
                    .join("."),
                port,
            ))
        }
        32 if address == "00000000000000000000000000000000" => Some(("::".to_owned(), port)),
        32 if address == "00000000000000000000000001000000" => Some(("::1".to_owned(), port)),
        32 => Some((format_ipv6(address)?, port)),
        _ => None,
    }
}

fn format_ipv6(value: &str) -> Option<String> {
    let mut groups = Vec::with_capacity(8);
    for offset in (0..32).step_by(8) {
        let chunk = &value[offset..offset + 8];
        let reversed = format!(
            "{}{}{}{}",
            &chunk[6..8],
            &chunk[4..6],
            &chunk[2..4],
            &chunk[0..2]
        );
        groups.push(trim_hex(&reversed[0..4]));
        groups.push(trim_hex(&reversed[4..8]));
    }
    Some(groups.join(":"))
}

fn trim_hex(value: &str) -> String {
    let trimmed = value.trim_start_matches('0');
    if trimmed.is_empty() { "0" } else { trimmed }.to_owned()
}

fn connect_host(bind_host: &str) -> &str {
    if matches!(bind_host, "*" | "0.0.0.0" | "::") {
        "localhost"
    } else {
        bind_host
    }
}

pub(super) fn nonempty(value: &str) -> Option<String> {
    (!value.is_empty()).then(|| value.to_owned())
}

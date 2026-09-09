use std::collections::{HashMap, HashSet};
use std::sync::OnceLock;

use regex::Regex;

use super::advertised_urls::AdvertisedUrls;
use super::{
    RawWorkspacePort, WorkspacePort, WorkspacePortAttributionConfidence,
    WorkspacePortClassification, WorkspacePortOwner, WorkspacePortPlatform, WorkspacePortProbe,
    WorkspacePortProtocol,
};

const MAX_PORTS: usize = 200;
const HTTP_PORTS: &[u16] = &[80, 3000, 3001, 4200, 5000, 5173, 5174, 8000, 8080, 8888];
const HTTPS_PORTS: &[u16] = &[443, 8443];

pub(super) struct NormalizedProbe {
    normalized_path: String,
    platform: WorkspacePortPlatform,
    probe: WorkspacePortProbe,
}

pub(super) fn normalize_probes(
    probes: impl IntoIterator<Item = WorkspacePortProbe>,
    platform: WorkspacePortPlatform,
) -> Vec<NormalizedProbe> {
    probes
        .into_iter()
        .map(|mut probe| {
            if probe.display_name.is_empty() {
                probe.display_name = basename(&probe.path).to_owned();
            }
            NormalizedProbe {
                normalized_path: normalize_path(&probe.path, platform),
                platform,
                probe,
            }
        })
        .collect()
}

pub(super) fn reconcile_advertised_urls(
    raw_ports: &[RawWorkspacePort],
    probes: &[NormalizedProbe],
    advertised_urls: &AdvertisedUrls,
) {
    let mut observations = probes
        .iter()
        .map(|probe| (probe.probe.worktree_id.clone(), Vec::new()))
        .collect::<HashMap<_, Vec<(u16, Option<u32>)>>>();
    for port in raw_ports {
        if let Some(owner) = attribute(port, probes) {
            observations
                .entry(owner.worktree_id)
                .or_default()
                .push((port.port, port.pid));
        }
    }
    for (worktree_id, listeners) in observations {
        advertised_urls.reconcile(&worktree_id, &listeners);
    }
}

pub(super) fn enrich_ports(
    raw_ports: Vec<RawWorkspacePort>,
    probes: &[NormalizedProbe],
    advertised_urls: &AdvertisedUrls,
) -> Vec<WorkspacePort> {
    let mut seen = HashSet::new();
    let mut ports = raw_ports
        .into_iter()
        .filter(|port| seen.insert((connect_host(&port.bind_host), port.port, port.pid)))
        .map(|port| enrich(port, probes, advertised_urls))
        .collect::<Vec<_>>();
    ports.sort_by(|left, right| {
        classification_rank(&left.classification)
            .cmp(&classification_rank(&right.classification))
            .then_with(|| left.port.cmp(&right.port))
            .then_with(|| left.connect_host.cmp(&right.connect_host))
    });
    ports.truncate(MAX_PORTS);
    ports
}

fn enrich(
    port: RawWorkspacePort,
    probes: &[NormalizedProbe],
    advertised_urls: &AdvertisedUrls,
) -> WorkspacePort {
    let owner = attribute(&port, probes);
    let inferred_protocol = infer_protocol(port.port);
    let (classification, protocol) = match owner {
        Some(owner) => {
            let advertised = advertised_urls.lookup(&owner.worktree_id, port.port, port.pid);
            (
                WorkspacePortClassification::Workspace {
                    owner,
                    advertised_url: advertised.as_ref().map(|value| value.origin.clone()),
                },
                advertised
                    .map(|value| value.protocol)
                    .unwrap_or(inferred_protocol),
            )
        }
        None if is_container_process(&port) => {
            (WorkspacePortClassification::Container, inferred_protocol)
        }
        None => (WorkspacePortClassification::External, inferred_protocol),
    };
    WorkspacePort {
        id: format!(
            "{}:{}:{}",
            port.bind_host,
            port.port,
            port.pid
                .map(|pid| pid.to_string())
                .unwrap_or_else(|| "unknown".to_owned())
        ),
        bind_host: port.bind_host.clone(),
        connect_host: connect_host(&port.bind_host),
        port: port.port,
        pid: port.pid,
        process_name: port.process_name,
        protocol,
        classification,
    }
}

fn attribute(port: &RawWorkspacePort, probes: &[NormalizedProbe]) -> Option<WorkspacePortOwner> {
    let platform = probes.first()?.platform;
    if let Some(cwd) = &port.cwd {
        let cwd = normalize_path(cwd, platform);
        if let Some(probe) = pick_deepest(probes, |probe| {
            is_same_or_descendant(&cwd, &probe.normalized_path)
        }) {
            return Some(owner(probe, WorkspacePortAttributionConfidence::Cwd));
        }
    }
    let command = port.command_line.as_ref()?;
    let command = normalize_text(command, platform);
    pick_deepest(probes, |probe| {
        includes_path_boundary(&command, &probe.normalized_path)
    })
    .map(|probe| owner(probe, WorkspacePortAttributionConfidence::Command))
}

fn owner(
    probe: &NormalizedProbe,
    confidence: WorkspacePortAttributionConfidence,
) -> WorkspacePortOwner {
    WorkspacePortOwner {
        confidence,
        display_name: probe.probe.display_name.clone(),
        path: probe.probe.path.clone(),
        repo_id: probe.probe.repo_id.clone(),
        worktree_id: probe.probe.worktree_id.clone(),
    }
}

fn pick_deepest(
    probes: &[NormalizedProbe],
    predicate: impl Fn(&NormalizedProbe) -> bool,
) -> Option<&NormalizedProbe> {
    probes
        .iter()
        .filter(|probe| predicate(probe))
        .max_by_key(|probe| probe.normalized_path.len())
}

fn is_same_or_descendant(candidate: &str, parent: &str) -> bool {
    candidate == parent
        || candidate
            .strip_prefix(parent)
            .is_some_and(|suffix| suffix.starts_with('/'))
}

fn includes_path_boundary(command: &str, path: &str) -> bool {
    let mut offset = 0;
    while let Some(relative) = command[offset..].find(path) {
        let index = offset + relative;
        let before = command[..index].chars().next_back();
        let after = command[index + path.len()..].chars().next();
        if before.is_none_or(is_command_prefix) && after.is_none_or(is_command_suffix) {
            return true;
        }
        offset = index + path.len();
        if offset >= command.len() {
            break;
        }
    }
    false
}

fn is_command_prefix(character: char) -> bool {
    character.is_whitespace() || matches!(character, '"' | '\'' | '=')
}

fn is_command_suffix(character: char) -> bool {
    character.is_whitespace() || matches!(character, '"' | '\'' | '/' | ':')
}

fn normalize_path(path: &str, platform: WorkspacePortPlatform) -> String {
    let has_root = path.starts_with(['/', '\\']);
    let is_absolute = has_root || has_windows_drive(path);
    let normalized = normalize_text(path, platform);
    let mut parts = Vec::new();
    for part in normalized.split('/') {
        match part {
            "" | "." => {}
            ".." if parts.last().is_some_and(|part| *part != "..") => {
                parts.pop();
            }
            ".." if !is_absolute => parts.push(part),
            ".." => {}
            _ => parts.push(part),
        }
    }
    let joined = parts.join("/");
    if has_root {
        if joined.is_empty() {
            "/".to_owned()
        } else {
            format!("/{joined}")
        }
    } else {
        joined.trim_end_matches('/').to_owned()
    }
}

fn normalize_text(text: &str, platform: WorkspacePortPlatform) -> String {
    let mut normalized = String::with_capacity(text.len());
    let mut last_was_slash = false;
    for character in text.chars() {
        let character = if character == '\\' { '/' } else { character };
        if character == '/' && last_was_slash {
            continue;
        }
        last_was_slash = character == '/';
        normalized.push(character);
    }
    if platform == WorkspacePortPlatform::Windows {
        normalized.make_ascii_lowercase();
    }
    normalized
}

fn has_windows_drive(path: &str) -> bool {
    let bytes = path.as_bytes();
    bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':'
}

fn basename(path: &str) -> &str {
    path.trim_end_matches(['/', '\\'])
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or(path)
}

fn connect_host(bind_host: &str) -> String {
    if matches!(bind_host, "*" | "0.0.0.0" | "::") {
        "localhost".to_owned()
    } else {
        bind_host.to_owned()
    }
}

fn infer_protocol(port: u16) -> WorkspacePortProtocol {
    if HTTPS_PORTS.contains(&port) {
        WorkspacePortProtocol::Https
    } else if HTTP_PORTS.contains(&port) {
        WorkspacePortProtocol::Http
    } else {
        WorkspacePortProtocol::Unknown
    }
}

fn is_container_process(port: &RawWorkspacePort) -> bool {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    let pattern = PATTERN.get_or_init(|| {
        Regex::new(
            r"(?i)\b(com\.[A-Za-z0-9_.-]+\.backend|com\.container[A-Za-z0-9_]*|container[A-Za-z0-9_]*)\b",
        )
        .expect("container process pattern is valid")
    });
    pattern.is_match(&format!(
        "{} {}",
        port.process_name.as_deref().unwrap_or_default(),
        port.command_line.as_deref().unwrap_or_default()
    ))
}

fn classification_rank(classification: &WorkspacePortClassification) -> u8 {
    match classification {
        WorkspacePortClassification::Workspace { .. } => 0,
        WorkspacePortClassification::Container => 1,
        WorkspacePortClassification::External => 2,
    }
}

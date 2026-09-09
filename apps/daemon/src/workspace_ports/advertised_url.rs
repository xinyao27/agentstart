use std::net::Ipv6Addr;

use url::{Host, Url};

use super::WorkspacePortProtocol;

#[derive(Clone, Debug)]
pub(super) struct AdvertisedUrl {
    pub(super) last_seen_at: i64,
    pub(super) origin: String,
    pub(super) port: u16,
    pub(super) protocol: WorkspacePortProtocol,
    pub(super) pty_id: String,
    pub(super) validated_listener_pid: Option<u32>,
    host_kind: HostKind,
}

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
enum HostKind {
    PublicIp,
    PrivateIp,
    Loopback,
    Custom,
}

pub(super) fn parse(url: &str, pty_id: &str, observed_at: i64) -> Option<AdvertisedUrl> {
    let url = Url::parse(url).ok()?;
    let protocol = match url.scheme() {
        "http" => WorkspacePortProtocol::Http,
        "https" => WorkspacePortProtocol::Https,
        _ => return None,
    };
    let host = url.host()?;
    if host_is_unspecified(&host) {
        return None;
    }
    let port = url.port_or_known_default()?;
    Some(AdvertisedUrl {
        host_kind: classify_host(&host),
        last_seen_at: observed_at,
        origin: url.origin().ascii_serialization(),
        port,
        protocol,
        pty_id: pty_id.to_owned(),
        validated_listener_pid: None,
    })
}

pub(super) fn should_replace(existing: &AdvertisedUrl, candidate: &AdvertisedUrl) -> bool {
    if candidate.host_kind != existing.host_kind {
        return candidate.host_kind > existing.host_kind;
    }
    if candidate.protocol != existing.protocol {
        return candidate.protocol == WorkspacePortProtocol::Https;
    }
    candidate.last_seen_at >= existing.last_seen_at
}

fn classify_host(host: &Host<&str>) -> HostKind {
    match host {
        Host::Domain(domain) if domain.eq_ignore_ascii_case("localhost") => HostKind::Loopback,
        Host::Domain(_) => HostKind::Custom,
        Host::Ipv4(address) if address.is_loopback() => HostKind::Loopback,
        Host::Ipv4(address) if address.is_private() || address.is_link_local() => {
            HostKind::PrivateIp
        }
        Host::Ipv4(_) => HostKind::PublicIp,
        Host::Ipv6(address) if address.is_loopback() => HostKind::Loopback,
        Host::Ipv6(address) if is_private_ipv6(*address) => HostKind::PrivateIp,
        Host::Ipv6(_) => HostKind::PublicIp,
    }
}

fn host_is_unspecified(host: &Host<&str>) -> bool {
    match host {
        Host::Domain(domain) => *domain == "*",
        Host::Ipv4(address) => address.is_unspecified(),
        Host::Ipv6(address) => address.is_unspecified(),
    }
}

fn is_private_ipv6(address: Ipv6Addr) -> bool {
    let first = address.segments()[0];
    (first & 0xfe00) == 0xfc00 || (first & 0xffc0) == 0xfe80
}

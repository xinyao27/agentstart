use std::net::{Ipv4Addr, Ipv6Addr};

use thiserror::Error;
use url::Host;

pub(super) struct LocalPreview {
    pub(super) port: u16,
}

#[derive(Debug, Error)]
pub(crate) enum PreviewIdentityError {
    #[error("visual_capture_requires_local_preview")]
    RequiresLocalPreview,
    #[error("visual_capture_workspace_identity_mismatch")]
    WorkspaceMismatch,
}

pub(super) fn require_local_preview(page_url: &str) -> Result<LocalPreview, PreviewIdentityError> {
    let page =
        url::Url::parse(page_url).expect("visual regression input validation accepts only URLs");
    if !matches!(page.scheme(), "http" | "https") || !is_allowed_host(page.host()) {
        return Err(PreviewIdentityError::RequiresLocalPreview);
    }
    let port = page
        .port()
        .unwrap_or_else(|| if page.scheme() == "https" { 443 } else { 80 });
    Ok(LocalPreview { port })
}

pub(super) fn workspace_mismatch() -> PreviewIdentityError {
    PreviewIdentityError::WorkspaceMismatch
}

fn is_allowed_host(host: Option<Host<&str>>) -> bool {
    match host {
        Some(Host::Domain(host)) => host.eq_ignore_ascii_case("localhost"),
        Some(Host::Ipv4(host)) => host == Ipv4Addr::new(127, 0, 0, 1),
        Some(Host::Ipv6(host)) => host == Ipv6Addr::LOCALHOST,
        None => false,
    }
}

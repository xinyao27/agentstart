use crate::star_nag::StarNagAuthority;

pub(super) mod protocol;

/// Why a single-field wrapper: unlike `GitHubRpc`, every collaborator this feature needs
/// (`GitHubAuthority`, `TelemetryAuthority`, `StatsAuthority`, `UiAuthority`) already lives inside
/// `StarNagAuthority` itself — see that module's top-of-file comment. This wrapper only exists to
/// match the `protocol_call.rs` dispatch shape every other RPC service uses (`UpdaterRpc` is the
/// same one-field shape).
#[derive(Clone)]
pub(super) struct StarNagRpc {
    authority: StarNagAuthority,
}

impl StarNagRpc {
    pub(super) fn new(authority: StarNagAuthority) -> Self {
        Self { authority }
    }
}

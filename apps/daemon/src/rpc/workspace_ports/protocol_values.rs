// Why: the ports authority answers with typed scan and kill structs; this is
// the single place that renders those structs into the protobuf wire messages,
// mirroring the legacy serde camelCase projection.
use yiru_protocol::runtime::v1::workspace_ports_classification::Kind as ClassificationKind;
use yiru_protocol::runtime::v1::{
    WorkspacePortsAttributionConfidence, WorkspacePortsClassification, WorkspacePortsContainer,
    WorkspacePortsExternal, WorkspacePortsOwner, WorkspacePortsPlatform, WorkspacePortsPort,
    WorkspacePortsProtocol, WorkspacePortsServiceKillResponse, WorkspacePortsServiceScanResponse,
    WorkspacePortsWorkspace,
};

use crate::workspace_ports::{
    WorkspacePort, WorkspacePortAttributionConfidence as AuthorityConfidence,
    WorkspacePortClassification as AuthorityClassification, WorkspacePortKillResult,
    WorkspacePortPlatform as AuthorityPlatform, WorkspacePortProtocol as AuthorityProtocol,
    WorkspacePortScanResult,
};

pub(super) fn scan_result(result: &WorkspacePortScanResult) -> WorkspacePortsServiceScanResponse {
    WorkspacePortsServiceScanResponse {
        platform: protocol_platform(result.platform) as i32,
        scanned_at: result.scanned_at,
        ports: result.ports.iter().map(port).collect(),
        unavailable_reason: result.unavailable_reason.clone(),
    }
}

pub(super) fn kill_result(result: &WorkspacePortKillResult) -> WorkspacePortsServiceKillResponse {
    WorkspacePortsServiceKillResponse {
        ok: result.ok,
        reason: result.reason.clone(),
    }
}

fn port(port: &WorkspacePort) -> WorkspacePortsPort {
    WorkspacePortsPort {
        id: port.id.clone(),
        port: u32::from(port.port),
        bind_host: port.bind_host.clone(),
        connect_host: port.connect_host.clone(),
        protocol: protocol_protocol(port.protocol) as i32,
        pid: port.pid,
        process_name: port.process_name.clone(),
        classification: Some(WorkspacePortsClassification {
            kind: Some(match &port.classification {
                AuthorityClassification::Workspace {
                    owner,
                    advertised_url,
                } => ClassificationKind::Workspace(WorkspacePortsWorkspace {
                    owner: Some(WorkspacePortsOwner {
                        confidence: protocol_confidence(owner.confidence) as i32,
                        display_name: owner.display_name.clone(),
                        path: owner.path.clone(),
                        repo_id: owner.repo_id.clone(),
                        worktree_id: owner.worktree_id.clone(),
                    }),
                    advertised_url: advertised_url.clone(),
                }),
                AuthorityClassification::Container => {
                    ClassificationKind::Container(WorkspacePortsContainer {})
                }
                AuthorityClassification::External => {
                    ClassificationKind::External(WorkspacePortsExternal {})
                }
            }),
        }),
    }
}

fn protocol_platform(platform: AuthorityPlatform) -> WorkspacePortsPlatform {
    match platform {
        AuthorityPlatform::Aix => WorkspacePortsPlatform::Aix,
        AuthorityPlatform::Android => WorkspacePortsPlatform::Android,
        AuthorityPlatform::Cygwin => WorkspacePortsPlatform::Cygwin,
        AuthorityPlatform::Darwin => WorkspacePortsPlatform::Darwin,
        AuthorityPlatform::Freebsd => WorkspacePortsPlatform::Freebsd,
        AuthorityPlatform::Haiku => WorkspacePortsPlatform::Haiku,
        AuthorityPlatform::Linux => WorkspacePortsPlatform::Linux,
        AuthorityPlatform::Netbsd => WorkspacePortsPlatform::Netbsd,
        AuthorityPlatform::Openbsd => WorkspacePortsPlatform::Openbsd,
        AuthorityPlatform::Sunos => WorkspacePortsPlatform::Sunos,
        AuthorityPlatform::Windows => WorkspacePortsPlatform::Windows,
        AuthorityPlatform::Unknown => WorkspacePortsPlatform::Unknown,
    }
}

fn protocol_protocol(protocol: AuthorityProtocol) -> WorkspacePortsProtocol {
    match protocol {
        AuthorityProtocol::Http => WorkspacePortsProtocol::Http,
        AuthorityProtocol::Https => WorkspacePortsProtocol::Https,
        AuthorityProtocol::Unknown => WorkspacePortsProtocol::Unknown,
    }
}

fn protocol_confidence(confidence: AuthorityConfidence) -> WorkspacePortsAttributionConfidence {
    match confidence {
        AuthorityConfidence::Command => WorkspacePortsAttributionConfidence::Command,
        AuthorityConfidence::Cwd => WorkspacePortsAttributionConfidence::Cwd,
        AuthorityConfidence::None => WorkspacePortsAttributionConfidence::None,
    }
}

use yiru_protocol::protocol::v1::{Status, StatusCode};
use yiru_protocol::runtime::v1::preflight_project_runtime::Runtime as ProtocolRuntimeKind;
use yiru_protocol::runtime::v1::preflight_resolved_runtime::Kind as ProtocolResolvedKind;
use yiru_protocol::runtime::v1::{
    PreflightContext as ProtocolContext, PreflightLocalHostRuntime, PreflightPathSource,
    PreflightRepairReason, PreflightResolvedRuntime, PreflightServiceCheckRequest,
    PreflightServiceCheckResponse, PreflightServiceDetectAgentsRequest,
    PreflightServiceDetectAgentsResponse, PreflightServiceDetectRemoteAgentsRequest,
    PreflightServiceRefreshAgentsRequest, PreflightServiceRefreshAgentsResponse,
    PreflightShellHydrationFailureReason, PreflightWindowsHostRuntime, PreflightWslRuntime,
};
use yiru_protocol::transport::{decode, encode};

use crate::preflight::{
    PreflightContext, PreflightRequest, ProjectRuntime, ResolvedRuntime,
    ShellHydrationFailureReason,
};

use super::PreflightRpc;

pub(in crate::rpc) async fn check(rpc: &PreflightRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<PreflightServiceCheckRequest>(payload)?;
    let request = PreflightRequest::Check {
        context: context(request.context),
        force: request.force,
    };
    let crate::preflight::PreflightResponse::Status(status) =
        rpc.execute(request).await.map_err(preflight_status)?
    else {
        return Err(data_loss("Preflight check returned an unexpected result"));
    };
    Ok(encode(&PreflightServiceCheckResponse {
        git: Some(yiru_protocol::runtime::v1::PreflightToolStatus {
            installed: status.git.installed,
        }),
        gh: Some(yiru_protocol::runtime::v1::PreflightCliStatus {
            installed: status.gh.installed,
            authenticated: status.gh.authenticated,
        }),
    }))
}

pub(in crate::rpc) async fn detect_agents(
    rpc: &PreflightRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<PreflightServiceDetectAgentsRequest>(payload)?;
    let request = PreflightRequest::DetectAgents(context(request.context));
    let crate::preflight::PreflightResponse::Agents(agents) =
        rpc.execute(request).await.map_err(preflight_status)?
    else {
        return Err(data_loss(
            "Preflight agent detection returned an unexpected result",
        ));
    };
    Ok(encode(&PreflightServiceDetectAgentsResponse { agents }))
}

pub(in crate::rpc) async fn detect_remote_agents(
    rpc: &PreflightRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<PreflightServiceDetectRemoteAgentsRequest>(payload)?;
    if request.connection_id.is_empty() {
        return Err(invalid_argument(
            "connectionId must contain at least 1 character",
        ));
    }
    let crate::preflight::PreflightResponse::Agents(agents) = rpc
        .execute(PreflightRequest::DetectRemoteAgents)
        .await
        .map_err(preflight_status)?
    else {
        return Err(data_loss(
            "Preflight agent detection returned an unexpected result",
        ));
    };
    Ok(encode(&PreflightServiceDetectAgentsResponse { agents }))
}

pub(in crate::rpc) async fn refresh_agents(
    rpc: &PreflightRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<PreflightServiceRefreshAgentsRequest>(payload)?;
    let request = PreflightRequest::RefreshAgents(context(request.context));
    let crate::preflight::PreflightResponse::Refresh(result) =
        rpc.execute(request).await.map_err(preflight_status)?
    else {
        return Err(data_loss(
            "Preflight agent refresh returned an unexpected result",
        ));
    };
    Ok(encode(&PreflightServiceRefreshAgentsResponse {
        agents: result.agents,
        added_path_segments: result.added_path_segments,
        shell_hydration_ok: result.shell_hydration_ok,
        path_source: match result.path_source {
            "shell_hydrate" => PreflightPathSource::ShellHydrate,
            _ => PreflightPathSource::SyncSeedOnly,
        } as i32,
        path_failure_reason: i32::from(protocol_failure_reason(result.path_failure_reason)),
    }))
}

fn context(context: Option<ProtocolContext>) -> PreflightContext {
    let Some(context) = context else {
        return PreflightContext::default();
    };
    PreflightContext {
        project_runtime: context
            .project_runtime
            .and_then(|runtime| match runtime.runtime {
                Some(ProtocolRuntimeKind::Resolved(resolved)) => {
                    Some(resolved_project_runtime(resolved))
                }
                Some(ProtocolRuntimeKind::RepairRequired(repair)) => {
                    Some(ProjectRuntime::RepairRequired {
                        reason: repair_reason(repair.reason).to_owned(),
                    })
                }
                None => None,
            }),
        wsl_default: context.wsl_default,
        wsl_distro: context
            .wsl_distro
            .map(|value| value.trim().to_owned())
            .filter(|value| !value.is_empty()),
    }
}

fn resolved_project_runtime(resolved: PreflightResolvedRuntime) -> ProjectRuntime {
    match resolved.kind {
        Some(ProtocolResolvedKind::LocalHost(PreflightLocalHostRuntime {})) => {
            ProjectRuntime::Resolved(ResolvedRuntime::Local)
        }
        Some(ProtocolResolvedKind::WindowsHost(PreflightWindowsHostRuntime {})) => {
            ProjectRuntime::Resolved(ResolvedRuntime::Windows)
        }
        Some(ProtocolResolvedKind::Wsl(PreflightWslRuntime { distro })) => {
            ProjectRuntime::Resolved(ResolvedRuntime::Wsl { distro })
        }
        None => ProjectRuntime::Resolved(ResolvedRuntime::Local),
    }
}

fn repair_reason(reason: i32) -> &'static str {
    match PreflightRepairReason::try_from(reason) {
        Ok(PreflightRepairReason::WslDistroRequired) => "wsl-distro-required",
        Ok(PreflightRepairReason::WslDistroMissing) => "wsl-distro-missing",
        _ => "wsl-unavailable",
    }
}

fn protocol_failure_reason(
    reason: ShellHydrationFailureReason,
) -> PreflightShellHydrationFailureReason {
    match reason {
        ShellHydrationFailureReason::NoShell => PreflightShellHydrationFailureReason::NoShell,
        ShellHydrationFailureReason::Timeout => PreflightShellHydrationFailureReason::Timeout,
        ShellHydrationFailureReason::SpawnError => PreflightShellHydrationFailureReason::SpawnError,
        ShellHydrationFailureReason::EmptyPath => PreflightShellHydrationFailureReason::EmptyPath,
        ShellHydrationFailureReason::None => PreflightShellHydrationFailureReason::None,
    }
}

use crate::preflight::PreflightError;

fn preflight_status(error: PreflightError) -> Status {
    // Why: the legacy preflight verbs answered every authority failure —
    // including a repair-required project runtime — with a bare 500, so the
    // protobuf surface mirrors that instead of inventing finer statuses.
    status(StatusCode::Internal, &error.to_string())
}

fn data_loss(message: &str) -> Status {
    status(StatusCode::DataLoss, message)
}

fn invalid_argument(message: &str) -> Status {
    status(StatusCode::InvalidArgument, message)
}

fn status(code: StatusCode, message: &str) -> Status {
    Status {
        code: code as i32,
        message: message.to_owned(),
        details: Vec::new(),
    }
}

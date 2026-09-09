mod output;

use std::ffi::{OsStr, OsString};
use std::path::PathBuf;
use std::time::Duration;

use thiserror::Error;
use yiru_protocol::method_metadata::UnaryMethod;
use yiru_protocol::method_metadata::methods::{
    YiruRuntimeV1WorktreeServiceArchive as ArchiveMethod,
    YiruRuntimeV1WorktreeServiceCreate as CreateMethod,
    YiruRuntimeV1WorktreeServiceList as ListMethod,
    YiruRuntimeV1WorktreeServiceListArchives as ListArchivesMethod,
    YiruRuntimeV1WorktreeServiceRestore as RestoreMethod,
};
use yiru_protocol::protocol::v1::StatusCode;
use yiru_protocol::runtime::v1::{
    WorktreeRevisionConflict, WorktreeServiceArchiveRequest, WorktreeServiceCreateRequest,
    WorktreeServiceListArchivesRequest, WorktreeServiceListRequest, WorktreeServiceRestoreRequest,
};
use yiru_protocol::transport::decode;

use crate::transport::{LocalProtocolClient, ProtocolPeerError};

const CALL_TIMEOUT: Duration = Duration::from_secs(600);
const REVISION_CONFLICT_TYPE: &str = "yiru.runtime.v1.WorktreeRevisionConflict";

#[derive(Debug, Error)]
pub(super) enum WorktreeCommandError {
    #[error(transparent)]
    Bootstrap(#[from] crate::native_messaging::BootstrapError),
    #[error("cli_flag_invalid:{0}")]
    InvalidFlag(&'static str),
    #[error("worktree_response_invalid")]
    InvalidResponse,
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    #[error("cli_flag_required:{0}")]
    MissingFlag(&'static str),
    #[error(transparent)]
    Path(#[from] crate::paths::PathResolutionError),
    #[error(transparent)]
    Peer(ProtocolPeerError),
    #[error("daemon_not_ready")]
    RuntimeNotReady,
    #[error("daemon_not_running")]
    RuntimeNotRunning,
    #[error("worktree_action_unsupported")]
    UnsupportedAction,
    #[error(
        "workspaceRevisionConflict:expected_revision={expected_revision}:actual_revision={actual_revision}:scope={scope}"
    )]
    RevisionConflict {
        actual_revision: i64,
        expected_revision: i64,
        scope: String,
    },
}

pub(super) async fn run(args: &[OsString]) -> Result<(), WorktreeCommandError> {
    let user_data_path = read_flag(args, "--daemon-data")
        .map(PathBuf::from)
        .map(Ok)
        .unwrap_or_else(crate::paths::resolve_default_user_data_path)?;
    let metadata = crate::runtime_metadata::read_live(&user_data_path)
        .ok_or(WorktreeCommandError::RuntimeNotRunning)?;
    let bootstrap = crate::native_messaging::read_bootstrap_connection_if_exists(
        &user_data_path,
        metadata.pid,
    )?
    .ok_or(WorktreeCommandError::RuntimeNotReady)?;
    let protocol_version = bootstrap
        .protocol_version
        .as_u64()
        .and_then(|value| u32::try_from(value).ok())
        .ok_or(WorktreeCommandError::RuntimeNotReady)?;
    let expected_runtime_id = read_flag(args, "--runtime")
        .and_then(OsStr::to_str)
        .filter(|value| !value.is_empty());
    let peer = LocalProtocolClient::connect(
        &bootstrap.endpoint,
        &bootstrap.auth_token,
        protocol_version,
        &bootstrap.runtime_id,
        expected_runtime_id,
    )
    .await
    .map_err(map_peer_error)?;
    let result = run_action(&peer, args).await;
    peer.close().await;
    result
}

async fn run_action(
    peer: &LocalProtocolClient,
    args: &[OsString],
) -> Result<(), WorktreeCommandError> {
    match args.first().and_then(|value| value.to_str()) {
        Some("archive") => archive(peer, args).await,
        Some("list") => list(peer, args).await,
        Some("create") => create(peer, args).await,
        Some("archives") => archives(peer, args).await,
        Some("restore") => restore(peer, args).await,
        Some(_) | None => Err(WorktreeCommandError::UnsupportedAction),
    }
}

async fn archive(
    peer: &LocalProtocolClient,
    args: &[OsString],
) -> Result<(), WorktreeCommandError> {
    let response = unary::<ArchiveMethod>(
        peer,
        &WorktreeServiceArchiveRequest {
            worktree: required(args, "--worktree")?.to_owned(),
            expected_revision: nonnegative_integer(args, "--expected-revision")?,
            delete_branch: has_flag(args, "--delete-branch"),
        },
    )
    .await?;
    let archive = response
        .archive
        .ok_or(WorktreeCommandError::InvalidResponse)?;
    if has_flag(args, "--json") {
        println!(
            "{}",
            serde_json::to_string(&output::archive_response(archive, response.revision))?
        );
    } else {
        println!("Archived worktree {}", archive.original_worktree_id);
    }
    Ok(())
}

async fn list(peer: &LocalProtocolClient, args: &[OsString]) -> Result<(), WorktreeCommandError> {
    let response = unary::<ListMethod>(
        peer,
        &WorktreeServiceListRequest {
            repo: optional(args, "--repo"),
            limit: Some(500.0),
        },
    )
    .await?;
    if has_flag(args, "--json") {
        println!(
            "{}",
            serde_json::to_string(&output::list_response(response))?
        );
    } else {
        let lines = response
            .worktrees
            .iter()
            .map(|worktree| {
                format!(
                    "{}\t{}\t{}",
                    worktree.display_name, worktree.branch, worktree.path
                )
            })
            .collect::<Vec<_>>();
        println!(
            "{}",
            if lines.is_empty() {
                "No worktrees".to_owned()
            } else {
                lines.join("\n")
            }
        );
    }
    Ok(())
}

async fn create(peer: &LocalProtocolClient, args: &[OsString]) -> Result<(), WorktreeCommandError> {
    let response = unary::<CreateMethod>(
        peer,
        &WorktreeServiceCreateRequest {
            repo: required(args, "--repo")?.to_owned(),
            expected_revision: nonnegative_integer(args, "--expected-revision")?,
            name: Some(required(args, "--name")?.to_owned()),
            base_branch: optional(args, "--base-branch"),
            no_parent: has_flag(args, "--no-parent").then_some(true),
            startup_agent: optional(args, "--agent"),
            created_with_agent: optional(args, "--agent"),
            startup_command: optional(args, "--command"),
            startup_prompt: optional(args, "--prompt"),
            ..Default::default()
        },
    )
    .await?;
    let worktree = response
        .worktree
        .as_ref()
        .ok_or(WorktreeCommandError::InvalidResponse)?;
    if has_flag(args, "--json") {
        println!(
            "{}",
            serde_json::to_string(&output::create_response(response))?
        );
    } else {
        println!("Created worktree {}", worktree.display_name);
    }
    Ok(())
}

async fn archives(
    peer: &LocalProtocolClient,
    args: &[OsString],
) -> Result<(), WorktreeCommandError> {
    let response = unary::<ListArchivesMethod>(
        peer,
        &WorktreeServiceListArchivesRequest {
            repo: optional(args, "--repo"),
        },
    )
    .await?;
    if has_flag(args, "--json") {
        println!(
            "{}",
            serde_json::to_string(&output::archives_response(response))?
        );
    } else {
        let lines = response
            .archives
            .iter()
            .map(|archive| {
                format!(
                    "{}\t{}\t{}\t{}",
                    archive.id, archive.status, archive.branch, archive.path
                )
            })
            .collect::<Vec<_>>();
        println!(
            "{}",
            if lines.is_empty() {
                "No worktree archives".to_owned()
            } else {
                lines.join("\n")
            }
        );
    }
    Ok(())
}

async fn restore(
    peer: &LocalProtocolClient,
    args: &[OsString],
) -> Result<(), WorktreeCommandError> {
    let response = unary::<RestoreMethod>(
        peer,
        &WorktreeServiceRestoreRequest {
            archive: required(args, "--archive")?.to_owned(),
            expected_revision: nonnegative_integer(args, "--expected-revision")?,
        },
    )
    .await?;
    let archive = response
        .archive
        .ok_or(WorktreeCommandError::InvalidResponse)?;
    if has_flag(args, "--json") {
        println!(
            "{}",
            serde_json::to_string(&output::archive_response(archive, response.revision))?
        );
    } else {
        println!("Restored worktree archive {}", archive.id);
    }
    Ok(())
}

async fn unary<Method>(
    peer: &LocalProtocolClient,
    request: &Method::Request,
) -> Result<Method::Response, WorktreeCommandError>
where
    Method: UnaryMethod,
{
    peer.unary::<Method>(request, CALL_TIMEOUT)
        .await
        .map_err(map_peer_error)
}

fn map_peer_error(error: ProtocolPeerError) -> WorktreeCommandError {
    let Some(status) = error.remote_status() else {
        return WorktreeCommandError::Peer(error);
    };
    if status.code != StatusCode::Aborted as i32 || status.message != "workspaceRevisionConflict" {
        return WorktreeCommandError::Peer(error);
    }
    let Some(detail) = status
        .details
        .iter()
        .find(|detail| detail.type_name == REVISION_CONFLICT_TYPE)
    else {
        return WorktreeCommandError::InvalidResponse;
    };
    let Ok(conflict) = decode::<WorktreeRevisionConflict>(&detail.value) else {
        return WorktreeCommandError::InvalidResponse;
    };
    WorktreeCommandError::RevisionConflict {
        actual_revision: conflict.actual_revision,
        expected_revision: conflict.expected_revision,
        scope: conflict.scope,
    }
}

fn nonnegative_integer(args: &[OsString], flag: &'static str) -> Result<i64, WorktreeCommandError> {
    required(args, flag)?
        .parse::<i64>()
        .ok()
        .filter(|value| *value >= 0 && *value <= 9_007_199_254_740_991)
        .ok_or(WorktreeCommandError::InvalidFlag(flag))
}

fn required<'a>(args: &'a [OsString], flag: &'static str) -> Result<&'a str, WorktreeCommandError> {
    read_flag(args, flag)
        .and_then(OsStr::to_str)
        .filter(|value| !value.is_empty())
        .ok_or(WorktreeCommandError::MissingFlag(flag))
}

fn optional(args: &[OsString], flag: &str) -> Option<String> {
    read_flag(args, flag)
        .and_then(OsStr::to_str)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

fn read_flag<'a>(args: &'a [OsString], flag: &str) -> Option<&'a OsStr> {
    args.iter()
        .position(|value| value == flag)
        .and_then(|index| args.get(index + 1))
        .map(OsString::as_os_str)
}

fn has_flag(args: &[OsString], flag: &str) -> bool {
    args.iter().any(|value| value == flag)
}

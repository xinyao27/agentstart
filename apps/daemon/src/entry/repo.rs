use std::ffi::{OsStr, OsString};
use std::path::PathBuf;
use std::time::Duration;

use serde_json::{Value, json};
use thiserror::Error;
use yiru_protocol::method_metadata::UnaryMethod;
use yiru_protocol::method_metadata::methods::{
    YiruRuntimeV1RepoServiceAdd as AddMethod, YiruRuntimeV1RepoServiceList as ListMethod,
};
use yiru_protocol::protocol::v1::StatusCode;
use yiru_protocol::runtime::v1::{
    RepoKind, RepoRevisionConflict, RepoServiceAddRequest, RepoServiceListRequest,
};
use yiru_protocol::transport::decode;

use crate::transport::{LocalProtocolClient, ProtocolPeerError};

const CALL_TIMEOUT: Duration = Duration::from_secs(30);
const REVISION_CONFLICT_TYPE: &str = "yiru.runtime.v1.RepoRevisionConflict";

#[derive(Debug, Error)]
pub(super) enum RepoCommandError {
    #[error(transparent)]
    Bootstrap(#[from] crate::native_messaging::BootstrapError),
    #[error("cli_flag_invalid:{0}")]
    InvalidFlag(&'static str),
    #[error("repo_response_invalid")]
    InvalidResponse,
    #[error("host_id_invalid")]
    InvalidHostId,
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    #[error("cli_flag_required:{0}")]
    MissingFlag(&'static str),
    #[error("project_path_required")]
    ProjectPathRequired,
    #[error(transparent)]
    Path(#[from] crate::paths::PathResolutionError),
    #[error(transparent)]
    Peer(ProtocolPeerError),
    #[error("daemon_not_ready")]
    RuntimeNotReady,
    #[error("daemon_not_running")]
    RuntimeNotRunning,
    #[error("repo_action_unsupported")]
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

pub(super) async fn run(args: &[OsString]) -> Result<(), RepoCommandError> {
    let user_data_path = read_flag(args, "--daemon-data")
        .map(PathBuf::from)
        .map(Ok)
        .unwrap_or_else(crate::paths::resolve_default_user_data_path)?;
    let metadata = crate::runtime_metadata::read_live(&user_data_path)
        .ok_or(RepoCommandError::RuntimeNotRunning)?;
    let bootstrap = crate::native_messaging::read_bootstrap_connection_if_exists(
        &user_data_path,
        metadata.pid,
    )?
    .ok_or(RepoCommandError::RuntimeNotReady)?;
    let protocol_version = bootstrap
        .protocol_version
        .as_u64()
        .and_then(|value| u32::try_from(value).ok())
        .ok_or(RepoCommandError::RuntimeNotReady)?;
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

async fn run_action(peer: &LocalProtocolClient, args: &[OsString]) -> Result<(), RepoCommandError> {
    match args.first().and_then(|value| value.to_str()) {
        Some("list") => list(peer, args).await,
        Some("add") => add(peer, args).await,
        Some(_) | None => Err(RepoCommandError::UnsupportedAction),
    }
}

async fn list(peer: &LocalProtocolClient, args: &[OsString]) -> Result<(), RepoCommandError> {
    let response = unary::<ListMethod>(peer, &RepoServiceListRequest {}).await?;
    let repos = response
        .repos
        .into_iter()
        .map(crate::rpc::protocol_repo_value)
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| RepoCommandError::InvalidResponse)?;
    let output = json!({ "repos":repos, "revision":response.revision });
    if has_flag(args, "--json") {
        println!("{}", serde_json::to_string(&output)?);
    } else {
        println!("{}", list_text(&repos));
    }
    Ok(())
}

async fn add(peer: &LocalProtocolClient, args: &[OsString]) -> Result<(), RepoCommandError> {
    let path = read_flag(args, "--path")
        .or_else(|| args.get(1).map(OsString::as_os_str))
        .and_then(OsStr::to_str)
        .filter(|value| !value.is_empty())
        .ok_or(RepoCommandError::ProjectPathRequired)?;
    let response = unary::<AddMethod>(
        peer,
        &RepoServiceAddRequest {
            expected_revision: nonnegative_integer(args, "--expected-revision")?,
            path: path.to_owned(),
            kind: if has_flag(args, "--folder") {
                RepoKind::Folder as i32
            } else {
                RepoKind::Git as i32
            },
            host_id: optional_host(args)?,
        },
    )
    .await?;
    let repo =
        crate::rpc::protocol_repo_value(response.repo.ok_or(RepoCommandError::InvalidResponse)?)
            .map_err(|_| RepoCommandError::InvalidResponse)?;
    let display_name = repo
        .get("displayName")
        .and_then(Value::as_str)
        .ok_or(RepoCommandError::InvalidResponse)?;
    let output = json!({ "repo":repo, "revision":response.revision });
    if has_flag(args, "--json") {
        println!("{}", serde_json::to_string(&output)?);
    } else {
        println!("Added {display_name}");
    }
    Ok(())
}

fn list_text(repos: &[Value]) -> String {
    let lines = repos
        .iter()
        .filter_map(|repo| {
            Some(format!(
                "{}\t{}",
                repo.get("displayName")?.as_str()?,
                repo.get("path")?.as_str()?
            ))
        })
        .collect::<Vec<_>>();
    if lines.is_empty() {
        "No projects".to_owned()
    } else {
        lines.join("\n")
    }
}

async fn unary<Method>(
    peer: &LocalProtocolClient,
    request: &Method::Request,
) -> Result<Method::Response, RepoCommandError>
where
    Method: UnaryMethod,
{
    peer.unary::<Method>(request, CALL_TIMEOUT)
        .await
        .map_err(map_peer_error)
}

fn map_peer_error(error: ProtocolPeerError) -> RepoCommandError {
    let Some(status) = error.remote_status() else {
        return RepoCommandError::Peer(error);
    };
    if status.code != StatusCode::Aborted as i32 || status.message != "workspaceRevisionConflict" {
        return RepoCommandError::Peer(error);
    }
    let Some(detail) = status
        .details
        .iter()
        .find(|detail| detail.type_name == REVISION_CONFLICT_TYPE)
    else {
        return RepoCommandError::InvalidResponse;
    };
    let Ok(conflict) = decode::<RepoRevisionConflict>(&detail.value) else {
        return RepoCommandError::InvalidResponse;
    };
    if conflict.expected_revision < 0 || conflict.actual_revision < 0 || conflict.scope.is_empty() {
        return RepoCommandError::InvalidResponse;
    }
    RepoCommandError::RevisionConflict {
        actual_revision: conflict.actual_revision,
        expected_revision: conflict.expected_revision,
        scope: conflict.scope,
    }
}

fn optional_host(args: &[OsString]) -> Result<Option<String>, RepoCommandError> {
    let Some(value) = read_flag(args, "--host").and_then(OsStr::to_str) else {
        return Ok(None);
    };
    if value == "local" || value.starts_with("ssh:") || value.starts_with("wsl:") {
        Ok(Some(value.to_owned()))
    } else {
        Err(RepoCommandError::InvalidHostId)
    }
}

fn nonnegative_integer(args: &[OsString], name: &'static str) -> Result<i64, RepoCommandError> {
    let value = read_flag(args, name)
        .and_then(OsStr::to_str)
        .filter(|value| !value.is_empty())
        .ok_or(RepoCommandError::MissingFlag(name))?;
    let value = javascript_number(value).ok_or(RepoCommandError::InvalidFlag(name))?;
    if value.is_finite() && value.fract() == 0.0 && (0.0..=9_007_199_254_740_991.0).contains(&value)
    {
        Ok(value as i64)
    } else {
        Err(RepoCommandError::InvalidFlag(name))
    }
}

fn javascript_number(value: &str) -> Option<f64> {
    let value = value.trim();
    if value.is_empty() {
        return Some(0.0);
    }
    for (prefix, radix) in [
        ("0x", 16),
        ("0X", 16),
        ("0o", 8),
        ("0O", 8),
        ("0b", 2),
        ("0B", 2),
    ] {
        if let Some(digits) = value.strip_prefix(prefix) {
            return u64::from_str_radix(digits, radix)
                .ok()
                .map(|value| value as f64);
        }
    }
    value.parse().ok()
}

fn read_flag<'a>(args: &'a [OsString], name: &str) -> Option<&'a OsStr> {
    let index = args.iter().position(|argument| argument == name)?;
    let value = args.get(index + 1)?;
    (!value.to_string_lossy().starts_with("--")).then_some(value)
}

fn has_flag(args: &[OsString], name: &str) -> bool {
    args.iter().any(|argument| argument == name)
}

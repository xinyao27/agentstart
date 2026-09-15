use std::ffi::{OsStr, OsString};
use std::path::PathBuf;
use std::time::Duration;

use agentstart_protocol::method_metadata::UnaryMethod;
use agentstart_protocol::method_metadata::methods::{
    AgentStartRuntimeV1ProjectMemoryServiceAppend as AppendMethod,
    AgentStartRuntimeV1ProjectMemoryServiceList as ListMethod,
    AgentStartRuntimeV1ProjectMemoryServiceRead as ReadMethod,
};
use agentstart_protocol::runtime::v1::{
    ProjectMemoryServiceAppendRequest, ProjectMemoryServiceListRequest,
    ProjectMemoryServiceReadRequest,
};
use serde_json::json;
use thiserror::Error;

use crate::transport::{LocalProtocolClient, ProtocolPeerError};

const CALL_TIMEOUT: Duration = Duration::from_secs(30);
const USAGE: &str = "Usage: agentstart memory <read|append|list> [options]

Project memory is the shared context a project accumulates across every worktree and
every agent. It lives in one file per project and is handed to dispatched workers
through AGENTSTART_PROJECT_MEMORY.

  read   [--worktree <selector>] [--json]
  append --text <text> [--section <heading>] [--worktree <selector>] [--json]
  list   [--json]

--worktree names the project to read or write; run inside an AgentStart terminal it
defaults to that terminal's worktree.

Options
  --daemon-data <path>   override the daemon user-data directory
  --runtime <id>         require a specific daemon runtime id
";

#[derive(Debug, Error)]
pub(super) enum MemoryCommandError {
    #[error("memory_action_unsupported")]
    ActionUnsupported,
    #[error(transparent)]
    Bootstrap(#[from] crate::native_messaging::BootstrapError),
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
    #[error("worktree_identity_required")]
    WorktreeRequired,
}

pub(super) async fn run(args: &[OsString]) -> Result<(), MemoryCommandError> {
    let action = args.first().and_then(|value| value.to_str());
    if matches!(action, Some("help" | "--help" | "-h")) || action.is_none() {
        println!("{USAGE}");
        return Ok(());
    }
    let user_data_path = read_flag(args, "--daemon-data")
        .map(PathBuf::from)
        .map(Ok)
        .unwrap_or_else(crate::paths::resolve_default_user_data_path)?;
    let metadata = crate::runtime_metadata::read_live(&user_data_path)
        .ok_or(MemoryCommandError::RuntimeNotRunning)?;
    let bootstrap = crate::native_messaging::read_bootstrap_connection_if_exists(
        &user_data_path,
        metadata.pid,
    )?
    .ok_or(MemoryCommandError::RuntimeNotReady)?;
    let protocol_version = bootstrap
        .protocol_version
        .as_u64()
        .and_then(|value| u32::try_from(value).ok())
        .ok_or(MemoryCommandError::RuntimeNotReady)?;
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
    .map_err(MemoryCommandError::Peer)?;
    let result = run_action(&peer, args, action).await;
    peer.close().await;
    result
}

async fn run_action(
    peer: &LocalProtocolClient,
    args: &[OsString],
    action: Option<&str>,
) -> Result<(), MemoryCommandError> {
    match action {
        Some("read") => read(peer, args).await,
        Some("append") => append(peer, args).await,
        Some("list") => list(peer, args).await,
        _ => Err(MemoryCommandError::ActionUnsupported),
    }
}

async fn read(peer: &LocalProtocolClient, args: &[OsString]) -> Result<(), MemoryCommandError> {
    let response = unary::<ReadMethod>(
        peer,
        &ProjectMemoryServiceReadRequest {
            worktree: worktree_selector(args)?,
        },
    )
    .await?;
    if has_flag(args, "--json") {
        println!(
            "{}",
            serde_json::to_string(&json!({
                "projectId": response.project_id,
                "displayName": response.display_name,
                "path": response.path,
                "revision": response.revision,
                "content": response.content
            }))?
        );
    } else {
        println!("{}", response.content);
    }
    Ok(())
}

async fn append(peer: &LocalProtocolClient, args: &[OsString]) -> Result<(), MemoryCommandError> {
    let response = unary::<AppendMethod>(
        peer,
        &ProjectMemoryServiceAppendRequest {
            worktree: worktree_selector(args)?,
            section: optional_flag(args, "--section"),
            text: required_flag(args, "--text")?,
        },
    )
    .await?;
    if has_flag(args, "--json") {
        println!(
            "{}",
            serde_json::to_string(&json!({
                "projectId": response.project_id,
                "path": response.path,
                "revision": response.revision,
                "appended": response.appended
            }))?
        );
    } else if response.appended {
        println!(
            "recorded\trevision={}\t{}",
            response.revision, response.path
        );
    } else {
        println!(
            "already recorded\trevision={}\t{}",
            response.revision, response.path
        );
    }
    Ok(())
}

async fn list(peer: &LocalProtocolClient, args: &[OsString]) -> Result<(), MemoryCommandError> {
    let response = unary::<ListMethod>(peer, &ProjectMemoryServiceListRequest {}).await?;
    if has_flag(args, "--json") {
        let projects = response
            .projects
            .iter()
            .map(|project| {
                json!({
                    "projectId": project.project_id,
                    "displayName": project.display_name,
                    "projectPath": project.project_path,
                    "memoryPath": project.memory_path,
                    "revision": project.revision,
                    "byteCount": project.byte_count
                })
            })
            .collect::<Vec<_>>();
        println!(
            "{}",
            serde_json::to_string(&json!({ "projects": projects }))?
        );
        return Ok(());
    }
    if response.projects.is_empty() {
        println!("No projects");
        return Ok(());
    }
    let lines = response
        .projects
        .iter()
        .map(|project| {
            let path = if project.memory_path.is_empty() {
                "-"
            } else {
                project.memory_path.as_str()
            };
            format!(
                "{}\t{}\t{}\t{}",
                project.project_id, project.display_name, project.revision, path
            )
        })
        .collect::<Vec<_>>();
    println!("{}", lines.join("\n"));
    Ok(())
}

/// Why: memory is scoped to the project, but a command run in a terminal already knows the
/// worktree it belongs to, so naming the project by hand is only necessary outside one.
fn worktree_selector(args: &[OsString]) -> Result<String, MemoryCommandError> {
    if let Some(worktree) = optional_flag(args, "--worktree") {
        return Ok(worktree);
    }
    std::env::var("AGENTSTART_WORKTREE_ID")
        .ok()
        .filter(|value| !value.is_empty())
        .ok_or(MemoryCommandError::WorktreeRequired)
}

async fn unary<Method>(
    peer: &LocalProtocolClient,
    request: &Method::Request,
) -> Result<Method::Response, MemoryCommandError>
where
    Method: UnaryMethod,
{
    peer.unary::<Method>(request, CALL_TIMEOUT)
        .await
        .map_err(MemoryCommandError::Peer)
}

fn optional_flag(args: &[OsString], name: &str) -> Option<String> {
    read_flag(args, name)
        .and_then(OsStr::to_str)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

fn required_flag(args: &[OsString], name: &'static str) -> Result<String, MemoryCommandError> {
    optional_flag(args, name).ok_or(MemoryCommandError::MissingFlag(name))
}

fn read_flag<'a>(args: &'a [OsString], name: &str) -> Option<&'a OsStr> {
    let index = args.iter().position(|argument| argument == name)?;
    let value = args.get(index + 1)?;
    (!value.to_string_lossy().starts_with("--")).then_some(value)
}

fn has_flag(args: &[OsString], name: &str) -> bool {
    args.iter().any(|argument| argument == name)
}

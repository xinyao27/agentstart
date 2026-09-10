use std::ffi::{OsStr, OsString};
use std::path::PathBuf;
use std::time::Duration;

use agentstart_protocol::method_metadata::UnaryMethod;
use agentstart_protocol::method_metadata::methods::{
    AgentStartRuntimeV1LayoutServiceApply as ApplyMethod,
    AgentStartRuntimeV1LayoutServiceList as ListMethod,
};
use agentstart_protocol::protocol::v1::StatusCode;
use agentstart_protocol::runtime::v1::{
    LayoutAppliedPane, LayoutPane, LayoutRecipe, LayoutRevisionConflict, LayoutServiceApplyRequest,
    LayoutServiceListRequest, layout_pane,
};
use agentstart_protocol::transport::decode;
use serde_json::{Value, json};
use thiserror::Error;

use crate::transport::{LocalProtocolClient, ProtocolPeerError};

const CALL_TIMEOUT: Duration = Duration::from_secs(30);
const REVISION_CONFLICT_TYPE: &str = "agentstart.runtime.v1.LayoutRevisionConflict";

#[derive(Debug, Error)]
pub(super) enum LayoutCommandError {
    #[error("layout_action_unsupported")]
    ActionUnsupported,
    #[error(transparent)]
    Bootstrap(#[from] crate::native_messaging::BootstrapError),
    #[error("cli_flag_invalid:{0}")]
    InvalidFlag(&'static str),
    #[error("layout_response_invalid")]
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
    #[error(
        "workspaceRevisionConflict:expected_revision={expected_revision}:actual_revision={actual_revision}:scope={scope}"
    )]
    RevisionConflict {
        actual_revision: i64,
        expected_revision: i64,
        scope: String,
    },
}

pub(super) async fn run(args: &[OsString]) -> Result<(), LayoutCommandError> {
    let user_data_path = read_flag(args, "--daemon-data")
        .map(PathBuf::from)
        .map(Ok)
        .unwrap_or_else(crate::paths::resolve_default_user_data_path)?;
    let metadata = crate::runtime_metadata::read_live(&user_data_path)
        .ok_or(LayoutCommandError::RuntimeNotRunning)?;
    let bootstrap = crate::native_messaging::read_bootstrap_connection_if_exists(
        &user_data_path,
        metadata.pid,
    )?
    .ok_or(LayoutCommandError::RuntimeNotReady)?;
    let protocol_version = bootstrap
        .protocol_version
        .as_u64()
        .and_then(|value| u32::try_from(value).ok())
        .ok_or(LayoutCommandError::RuntimeNotReady)?;
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
) -> Result<(), LayoutCommandError> {
    match args.first().and_then(|value| value.to_str()) {
        Some("list") => list(peer, args).await,
        Some("apply") => apply(peer, args).await,
        Some(_) | None => Err(LayoutCommandError::ActionUnsupported),
    }
}

async fn list(peer: &LocalProtocolClient, args: &[OsString]) -> Result<(), LayoutCommandError> {
    let response = unary::<ListMethod>(
        peer,
        &LayoutServiceListRequest {
            worktree: required_flag(args, "--worktree")?,
        },
    )
    .await?;
    if has_flag(args, "--json") {
        let recipes = response
            .recipes
            .iter()
            .map(recipe_json)
            .collect::<Result<Vec<_>, _>>()?;
        println!("{}", serde_json::to_string(&json!({ "recipes": recipes }))?);
    } else {
        let lines = response
            .recipes
            .iter()
            .map(|recipe| format!("{}\t{}", recipe.name, recipe.panes.len()))
            .collect::<Vec<_>>();
        println!(
            "{}",
            if lines.is_empty() {
                "No layout recipes".to_owned()
            } else {
                lines.join("\n")
            }
        );
    }
    Ok(())
}

async fn apply(peer: &LocalProtocolClient, args: &[OsString]) -> Result<(), LayoutCommandError> {
    let response = unary::<ApplyMethod>(
        peer,
        &LayoutServiceApplyRequest {
            worktree: required_flag(args, "--worktree")?,
            expected_revision: nonnegative_integer(args, "--expected-revision")?,
            name: required_flag(args, "--name")?,
        },
    )
    .await?;
    let pane_count = response.panes.len();
    if has_flag(args, "--json") {
        let panes = response
            .panes
            .iter()
            .map(applied_pane_json)
            .collect::<Vec<_>>();
        println!(
            "{}",
            serde_json::to_string(&json!({ "panes": panes, "revision": response.revision }))?
        );
    } else {
        println!("Started {pane_count} layout panes");
    }
    Ok(())
}

fn recipe_json(recipe: &LayoutRecipe) -> Result<Value, LayoutCommandError> {
    let panes = recipe
        .panes
        .iter()
        .map(pane_json)
        .collect::<Result<Vec<_>, _>>()?;
    Ok(json!({ "name": recipe.name, "panes": panes }))
}

fn pane_json(pane: &LayoutPane) -> Result<Value, LayoutCommandError> {
    let title = &pane.title;
    match pane
        .kind
        .as_ref()
        .ok_or(LayoutCommandError::InvalidResponse)?
    {
        layout_pane::Kind::Command(command) => Ok(json!({
            "command": command.command,
            "kind": "command",
            "title": title,
        })),
        layout_pane::Kind::Agent(agent) => Ok(json!({
            "agent": agent.agent,
            "kind": "agent",
            "prompt": agent.prompt,
            "title": title,
        })),
        layout_pane::Kind::Shell(_) => Ok(json!({ "kind": "shell", "title": title })),
    }
}

fn applied_pane_json(pane: &LayoutAppliedPane) -> Value {
    json!({
        "sessionId": pane.session_id,
        "terminalHandle": pane.terminal_handle,
        "title": pane.title,
    })
}

async fn unary<Method>(
    peer: &LocalProtocolClient,
    request: &Method::Request,
) -> Result<Method::Response, LayoutCommandError>
where
    Method: UnaryMethod,
{
    peer.unary::<Method>(request, CALL_TIMEOUT)
        .await
        .map_err(map_peer_error)
}

fn map_peer_error(error: ProtocolPeerError) -> LayoutCommandError {
    let Some(status) = error.remote_status() else {
        return LayoutCommandError::Peer(error);
    };
    if status.code != StatusCode::Aborted as i32 || status.message != "workspaceRevisionConflict" {
        return LayoutCommandError::Peer(error);
    }
    let Some(detail) = status
        .details
        .iter()
        .find(|detail| detail.type_name == REVISION_CONFLICT_TYPE)
    else {
        return LayoutCommandError::InvalidResponse;
    };
    let Ok(conflict) = decode::<LayoutRevisionConflict>(&detail.value) else {
        return LayoutCommandError::InvalidResponse;
    };
    LayoutCommandError::RevisionConflict {
        actual_revision: conflict.actual_revision,
        expected_revision: conflict.expected_revision,
        scope: conflict.scope,
    }
}

fn nonnegative_integer(args: &[OsString], name: &'static str) -> Result<i64, LayoutCommandError> {
    let value = read_flag(args, name)
        .and_then(OsStr::to_str)
        .filter(|value| !value.is_empty())
        .ok_or(LayoutCommandError::MissingFlag(name))?;
    let value = javascript_number(value).ok_or(LayoutCommandError::InvalidFlag(name))?;
    if value.is_finite() && value.fract() == 0.0 && (0.0..=9_007_199_254_740_991.0).contains(&value)
    {
        Ok(value as i64)
    } else {
        Err(LayoutCommandError::InvalidFlag(name))
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

fn required_flag(args: &[OsString], name: &'static str) -> Result<String, LayoutCommandError> {
    read_flag(args, name)
        .and_then(OsStr::to_str)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
        .ok_or(LayoutCommandError::MissingFlag(name))
}

fn read_flag<'a>(args: &'a [OsString], name: &str) -> Option<&'a OsStr> {
    let index = args.iter().position(|argument| argument == name)?;
    let value = args.get(index + 1)?;
    (!value.to_string_lossy().starts_with("--")).then_some(value)
}

fn has_flag(args: &[OsString], name: &str) -> bool {
    args.iter().any(|argument| argument == name)
}

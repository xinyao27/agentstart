use std::ffi::{OsStr, OsString};
use std::path::PathBuf;
use std::time::Duration;

use serde_json::{Value, json};
use thiserror::Error;
use yiru_protocol::method_metadata::methods::{
    YiruRuntimeV1WorkspaceEventsServiceList as ListMethod,
    YiruRuntimeV1WorkspaceEventsServiceWatch as WatchMethod,
};
use yiru_protocol::runtime::v1::workspace_events_service_watch_response::Event;
use yiru_protocol::runtime::v1::{
    WorkspaceEventsServiceListRequest, WorkspaceEventsServiceWatchRequest,
};

use crate::transport::{LocalProtocolClient, ProtocolPeerError};

const CALL_TIMEOUT: Duration = Duration::from_secs(30);
// Why: a watch has no natural deadline, so it runs to the transport's longest
// call window and ends when the caller stops it.
const WATCH_TIMEOUT: Duration = Duration::from_millis(u32::MAX as u64);
const LIST_PAGE_SIZE: u32 = 500;

#[derive(Debug, Error)]
pub(super) enum EventsCommandError {
    #[error(transparent)]
    Bootstrap(#[from] crate::native_messaging::BootstrapError),
    #[error("events_after_id_invalid")]
    InvalidAfterId,
    #[error("cli_flag_required:{0}")]
    MissingFlag(&'static str),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    #[error(transparent)]
    Path(#[from] crate::paths::PathResolutionError),
    #[error(transparent)]
    Peer(#[from] ProtocolPeerError),
    #[error("daemon_not_ready")]
    RuntimeNotReady,
    #[error("daemon_not_running")]
    RuntimeNotRunning,
    #[error("events_action_unsupported")]
    UnsupportedAction,
}

pub(super) async fn run(args: &[OsString]) -> Result<(), EventsCommandError> {
    // Why: the retained daemon validates its flags before it opens a session, so
    // a missing scope reports the flag rather than an unreachable daemon.
    let scope = required_scope(args)?;
    let after_id = after_id(args)?;
    let user_data_path = read_flag(args, "--daemon-data")
        .map(PathBuf::from)
        .map(Ok)
        .unwrap_or_else(crate::paths::resolve_default_user_data_path)?;
    let metadata = crate::runtime_metadata::read_live(&user_data_path)
        .ok_or(EventsCommandError::RuntimeNotRunning)?;
    let bootstrap = crate::native_messaging::read_bootstrap_connection_if_exists(
        &user_data_path,
        metadata.pid,
    )?
    .ok_or(EventsCommandError::RuntimeNotReady)?;
    let protocol_version = bootstrap
        .protocol_version
        .as_u64()
        .and_then(|value| u32::try_from(value).ok())
        .ok_or(EventsCommandError::RuntimeNotReady)?;
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
    .await?;
    let result = run_action(&peer, args, scope, after_id).await;
    peer.close().await;
    result
}

async fn run_action(
    peer: &LocalProtocolClient,
    args: &[OsString],
    scope: String,
    after_id: i64,
) -> Result<(), EventsCommandError> {
    match args.first().and_then(|value| value.to_str()) {
        Some("list") => list(peer, args, scope, after_id).await,
        Some("watch") => watch(peer, scope, after_id).await,
        Some(_) | None => Err(EventsCommandError::UnsupportedAction),
    }
}

async fn list(
    peer: &LocalProtocolClient,
    args: &[OsString],
    scope: String,
    after_id: i64,
) -> Result<(), EventsCommandError> {
    let response = peer
        .unary::<ListMethod>(
            &WorkspaceEventsServiceListRequest {
                scope,
                after_id: Some(after_id),
                limit: Some(LIST_PAGE_SIZE),
            },
            CALL_TIMEOUT,
        )
        .await?;
    let events = response
        .events
        .into_iter()
        .map(crate::rpc::protocol_workspace_event_value)
        .collect::<Vec<_>>();
    if has_flag(args, "--json") {
        let output = json!({
            "events": Value::Array(events),
            "latestId": response.latest_id,
            "revision": response.revision
        });
        println!("{}", serde_json::to_string(&output)?);
        return Ok(());
    }
    println!("{}", list_text(&events)?);
    Ok(())
}

async fn watch(
    peer: &LocalProtocolClient,
    scope: String,
    after_id: i64,
) -> Result<(), EventsCommandError> {
    let mut stream = peer
        .server_stream::<WatchMethod>(
            &WorkspaceEventsServiceWatchRequest {
                scope,
                after_id: Some(after_id),
            },
            WATCH_TIMEOUT,
        )
        .await?;
    // Why: a routed watch can restart from the request it was opened with, so a
    // replayed event is dropped instead of being printed twice.
    let mut cursor = after_id;
    while let Some(response) = stream.receive().await? {
        let Some(Event::Appended(event)) = response.event else {
            continue;
        };
        if event.id <= cursor {
            continue;
        }
        cursor = event.id;
        println!(
            "{}",
            serde_json::to_string(&crate::rpc::protocol_workspace_event_value(event))?
        );
    }
    Ok(())
}

fn list_text(events: &[Value]) -> Result<String, EventsCommandError> {
    let lines = events
        .iter()
        .map(serde_json::to_string)
        .collect::<Result<Vec<_>, _>>()?;
    Ok(if lines.is_empty() {
        "No events".to_owned()
    } else {
        lines.join("\n")
    })
}

fn required_scope(args: &[OsString]) -> Result<String, EventsCommandError> {
    read_flag(args, "--scope")
        .and_then(OsStr::to_str)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
        .ok_or(EventsCommandError::MissingFlag("--scope"))
}

fn after_id(args: &[OsString]) -> Result<i64, EventsCommandError> {
    let Some(value) = read_flag(args, "--after").and_then(OsStr::to_str) else {
        return Ok(0);
    };
    let value = javascript_number(value).ok_or(EventsCommandError::InvalidAfterId)?;
    if value.is_finite() && value.fract() == 0.0 && (0.0..=9_007_199_254_740_991.0).contains(&value)
    {
        Ok(value as i64)
    } else {
        Err(EventsCommandError::InvalidAfterId)
    }
}

// Why: mirrors `Number(value)` in the retained CLI, where a blank flag is zero
// and a radix prefix is honoured.
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

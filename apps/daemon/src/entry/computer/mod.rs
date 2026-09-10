mod output;
mod request;

use std::ffi::{OsStr, OsString};
use std::path::PathBuf;
use std::time::Duration;

use agentstart_protocol::method_metadata::UnaryMethod;
use agentstart_protocol::method_metadata::methods::{
    AgentStartRuntimeV1ComputerServiceCapabilities as CapabilitiesMethod,
    AgentStartRuntimeV1ComputerServiceClick as ClickMethod,
    AgentStartRuntimeV1ComputerServiceDrag as DragMethod,
    AgentStartRuntimeV1ComputerServiceGetAppState as GetAppStateMethod,
    AgentStartRuntimeV1ComputerServiceHotkey as HotkeyMethod,
    AgentStartRuntimeV1ComputerServiceListApps as ListAppsMethod,
    AgentStartRuntimeV1ComputerServiceListWindows as ListWindowsMethod,
    AgentStartRuntimeV1ComputerServicePasteText as PasteTextMethod,
    AgentStartRuntimeV1ComputerServicePerformSecondaryAction as PerformSecondaryActionMethod,
    AgentStartRuntimeV1ComputerServicePermissions as PermissionsMethod,
    AgentStartRuntimeV1ComputerServicePermissionsReset as PermissionsResetMethod,
    AgentStartRuntimeV1ComputerServicePermissionsStatus as PermissionsStatusMethod,
    AgentStartRuntimeV1ComputerServicePressKey as PressKeyMethod,
    AgentStartRuntimeV1ComputerServiceScroll as ScrollMethod,
    AgentStartRuntimeV1ComputerServiceSetValue as SetValueMethod,
    AgentStartRuntimeV1ComputerServiceTypeText as TypeTextMethod,
};
use agentstart_protocol::runtime::v1::{
    ComputerServiceCapabilitiesRequest, ComputerServiceListAppsRequest,
    ComputerServicePermissionsResetRequest, ComputerServicePermissionsStatusRequest,
};
use thiserror::Error;

use crate::transport::{LocalProtocolClient, ProtocolPeerError};

const CALL_TIMEOUT: Duration = Duration::from_secs(30);
const COMPUTER_USAGE: &str = "Usage: agentstart computer <capabilities|list-apps|permissions|permissions-status|permissions-reset|list-windows|get-app-state|click|perform-secondary-action|scroll|drag|type-text|press-key|hotkey|paste-text|set-value> [options]";

#[derive(Debug, Error)]
pub(super) enum ComputerCommandError {
    #[error("computer_action_unsupported:{0}")]
    ActionUnsupported(String),
    #[error(transparent)]
    Bootstrap(#[from] crate::native_messaging::BootstrapError),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error("cli_flag_invalid:{0}")]
    InvalidFlag(&'static str),
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
}

pub(super) async fn run(args: &[OsString]) -> Result<(), ComputerCommandError> {
    let action = args.first().and_then(|value| value.to_str());
    if action.is_none()
        || action == Some("help")
        || has_flag(args, "--help")
        || has_flag(args, "-h")
    {
        println!("{COMPUTER_USAGE}");
        return Ok(());
    }
    let user_data_path = read_flag(args, "--daemon-data")
        .map(PathBuf::from)
        .map(Ok)
        .unwrap_or_else(crate::paths::resolve_default_user_data_path)?;
    let metadata = crate::runtime_metadata::read_live(&user_data_path)
        .ok_or(ComputerCommandError::RuntimeNotRunning)?;
    let bootstrap = crate::native_messaging::read_bootstrap_connection_if_exists(
        &user_data_path,
        metadata.pid,
    )?
    .ok_or(ComputerCommandError::RuntimeNotReady)?;
    let protocol_version = bootstrap
        .protocol_version
        .as_u64()
        .and_then(|value| u32::try_from(value).ok())
        .ok_or(ComputerCommandError::RuntimeNotReady)?;
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
) -> Result<(), ComputerCommandError> {
    let json_mode = has_flag(args, "--json");
    match args.first().and_then(|value| value.to_str()) {
        Some("capabilities") => capabilities(peer, json_mode).await,
        Some("list-apps") => list_apps(peer, json_mode).await,
        Some("permissions") => permissions(peer, args, json_mode).await,
        Some("permissions-status") => permissions_status(peer, json_mode).await,
        Some("permissions-reset") => permissions_reset(peer, json_mode).await,
        Some("list-windows") => list_windows(peer, args, json_mode).await,
        Some("get-app-state") => get_app_state(peer, args, json_mode).await,
        Some("click") => click(peer, args, json_mode).await,
        Some("perform-secondary-action") => perform_secondary_action(peer, args, json_mode).await,
        Some("scroll") => scroll(peer, args, json_mode).await,
        Some("drag") => drag(peer, args, json_mode).await,
        Some("type-text") => type_text(peer, args, json_mode).await,
        Some("press-key") => press_key(peer, args, json_mode).await,
        Some("hotkey") => hotkey(peer, args, json_mode).await,
        Some("paste-text") => paste_text(peer, args, json_mode).await,
        Some("set-value") => set_value(peer, args, json_mode).await,
        other => Err(ComputerCommandError::ActionUnsupported(
            other.unwrap_or_default().to_owned(),
        )),
    }
}

async fn capabilities(
    peer: &LocalProtocolClient,
    json_mode: bool,
) -> Result<(), ComputerCommandError> {
    let response =
        unary::<CapabilitiesMethod>(peer, &ComputerServiceCapabilitiesRequest {}).await?;
    let summary = format!(
        "{} ({}, protocol {})",
        response.provider,
        output::platform_str(response.platform),
        response.protocol_version
    );
    output::write_output(json_mode, output::capabilities_json(&response), &summary);
    Ok(())
}

async fn list_apps(
    peer: &LocalProtocolClient,
    json_mode: bool,
) -> Result<(), ComputerCommandError> {
    let response = unary::<ListAppsMethod>(peer, &ComputerServiceListAppsRequest {}).await?;
    let summary = if response.apps.is_empty() {
        "No apps found".to_owned()
    } else {
        response
            .apps
            .iter()
            .map(|app| format!("{}\tpid:{}", app.name, app.pid))
            .collect::<Vec<_>>()
            .join("\n")
    };
    output::write_output(json_mode, output::list_apps_json(&response), &summary);
    Ok(())
}

async fn permissions(
    peer: &LocalProtocolClient,
    args: &[OsString],
    json_mode: bool,
) -> Result<(), ComputerCommandError> {
    let response = unary::<PermissionsMethod>(peer, &request::permissions(args)?).await?;
    let summary = output::permissions_summary(&response.permissions);
    output::write_output(
        json_mode,
        output::permissions_setup_json(&response),
        &summary,
    );
    Ok(())
}

async fn permissions_status(
    peer: &LocalProtocolClient,
    json_mode: bool,
) -> Result<(), ComputerCommandError> {
    let response =
        unary::<PermissionsStatusMethod>(peer, &ComputerServicePermissionsStatusRequest {}).await?;
    let summary = output::permissions_summary(&response.permissions);
    output::write_output(
        json_mode,
        output::permissions_status_json(&response),
        &summary,
    );
    Ok(())
}

async fn permissions_reset(
    peer: &LocalProtocolClient,
    json_mode: bool,
) -> Result<(), ComputerCommandError> {
    let response =
        unary::<PermissionsResetMethod>(peer, &ComputerServicePermissionsResetRequest {}).await?;
    let summary = output::permissions_summary(&response.permissions);
    output::write_output(
        json_mode,
        output::permissions_reset_json(&response),
        &summary,
    );
    Ok(())
}

async fn list_windows(
    peer: &LocalProtocolClient,
    args: &[OsString],
    json_mode: bool,
) -> Result<(), ComputerCommandError> {
    let response = unary::<ListWindowsMethod>(peer, &request::list_windows(args)?).await?;
    let summary = if response.windows.is_empty() {
        "No windows found".to_owned()
    } else {
        response
            .windows
            .iter()
            .map(|entry| {
                let title = entry
                    .window
                    .as_ref()
                    .map(|window| window.title.as_str())
                    .unwrap_or("");
                format!("[{}] {title}", entry.index)
            })
            .collect::<Vec<_>>()
            .join("\n")
    };
    output::write_output(json_mode, output::list_windows_json(&response), &summary);
    Ok(())
}

async fn get_app_state(
    peer: &LocalProtocolClient,
    args: &[OsString],
    json_mode: bool,
) -> Result<(), ComputerCommandError> {
    let response = unary::<GetAppStateMethod>(peer, &request::get_app_state(args)?).await?;
    let summary = response
        .snapshot
        .as_ref()
        .map(|snapshot| snapshot.tree_text.clone())
        .unwrap_or_default();
    output::write_output(json_mode, output::get_app_state_json(&response), &summary);
    Ok(())
}

async fn click(
    peer: &LocalProtocolClient,
    args: &[OsString],
    json_mode: bool,
) -> Result<(), ComputerCommandError> {
    let response = unary::<ClickMethod>(peer, &request::click(args)?).await?;
    write_action_output(json_mode, &response);
    Ok(())
}

async fn perform_secondary_action(
    peer: &LocalProtocolClient,
    args: &[OsString],
    json_mode: bool,
) -> Result<(), ComputerCommandError> {
    let response =
        unary::<PerformSecondaryActionMethod>(peer, &request::perform_secondary_action(args)?)
            .await?;
    write_action_output(json_mode, &response);
    Ok(())
}

async fn scroll(
    peer: &LocalProtocolClient,
    args: &[OsString],
    json_mode: bool,
) -> Result<(), ComputerCommandError> {
    let response = unary::<ScrollMethod>(peer, &request::scroll(args)?).await?;
    write_action_output(json_mode, &response);
    Ok(())
}

async fn drag(
    peer: &LocalProtocolClient,
    args: &[OsString],
    json_mode: bool,
) -> Result<(), ComputerCommandError> {
    let response = unary::<DragMethod>(peer, &request::drag(args)?).await?;
    write_action_output(json_mode, &response);
    Ok(())
}

async fn type_text(
    peer: &LocalProtocolClient,
    args: &[OsString],
    json_mode: bool,
) -> Result<(), ComputerCommandError> {
    let response = unary::<TypeTextMethod>(peer, &request::type_text(args)?).await?;
    write_action_output(json_mode, &response);
    Ok(())
}

async fn press_key(
    peer: &LocalProtocolClient,
    args: &[OsString],
    json_mode: bool,
) -> Result<(), ComputerCommandError> {
    let response = unary::<PressKeyMethod>(peer, &request::press_key(args)?).await?;
    write_action_output(json_mode, &response);
    Ok(())
}

async fn hotkey(
    peer: &LocalProtocolClient,
    args: &[OsString],
    json_mode: bool,
) -> Result<(), ComputerCommandError> {
    let response = unary::<HotkeyMethod>(peer, &request::hotkey(args)?).await?;
    write_action_output(json_mode, &response);
    Ok(())
}

async fn paste_text(
    peer: &LocalProtocolClient,
    args: &[OsString],
    json_mode: bool,
) -> Result<(), ComputerCommandError> {
    let response = unary::<PasteTextMethod>(peer, &request::paste_text(args)?).await?;
    write_action_output(json_mode, &response);
    Ok(())
}

async fn set_value(
    peer: &LocalProtocolClient,
    args: &[OsString],
    json_mode: bool,
) -> Result<(), ComputerCommandError> {
    let response = unary::<SetValueMethod>(peer, &request::set_value(args)?).await?;
    write_action_output(json_mode, &response);
    Ok(())
}

fn write_action_output(
    json_mode: bool,
    response: &agentstart_protocol::runtime::v1::ComputerServiceActionResponse,
) {
    output::write_output(
        json_mode,
        output::action_json(response),
        "Computer action completed",
    );
}

async fn unary<Method>(
    peer: &LocalProtocolClient,
    request: &Method::Request,
) -> Result<Method::Response, ComputerCommandError>
where
    Method: UnaryMethod,
{
    peer.unary::<Method>(request, CALL_TIMEOUT)
        .await
        .map_err(map_peer_error)
}

fn map_peer_error(error: ProtocolPeerError) -> ComputerCommandError {
    ComputerCommandError::Peer(error)
}

fn has_flag(args: &[OsString], name: &str) -> bool {
    args.iter().any(|argument| argument == name)
}

fn read_flag<'a>(args: &'a [OsString], name: &str) -> Option<&'a OsStr> {
    let index = args.iter().position(|argument| argument == name)?;
    let value = args.get(index + 1)?;
    (!value.to_string_lossy().starts_with("--")).then_some(value)
}

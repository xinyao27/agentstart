use std::ffi::OsString;

use serde::Serialize;

use super::CliError;
use super::flags::{has_flag, read_flag};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ConnectionOutput<'a> {
    auth_token: &'a str,
    endpoint: &'a str,
    protocol_version: &'a serde_json::Number,
    runtime_id: &'a str,
}

pub(super) fn run(args: &[OsString]) -> Result<(), CliError> {
    if args.first().and_then(|value| value.to_str()) != Some("show") {
        return Err(CliError::Unsupported("connection_action_unsupported"));
    }
    let user_data_path = crate::paths::resolve_default_user_data_path()?;
    let metadata = crate::runtime_metadata::read_live(&user_data_path)
        .ok_or(CliError::Unavailable("daemon_not_running"))?;
    let bootstrap =
        crate::native_messaging::read_bootstrap_connection(&user_data_path, metadata.pid)?;
    let mut endpoint = url::Url::parse(&bootstrap.endpoint)?;
    if let Some(host) = read_flag(args, "--host") {
        let host = host.to_string_lossy();
        let host = host.trim();
        if !host.is_empty() {
            endpoint.set_host(Some(host))?;
        }
    }
    let endpoint = endpoint.to_string();
    let output = ConnectionOutput {
        auth_token: &bootstrap.auth_token,
        endpoint: &endpoint,
        protocol_version: &bootstrap.protocol_version,
        runtime_id: &bootstrap.runtime_id,
    };
    if has_flag(args, "--json") {
        println!("{}", serde_json::to_string(&output)?);
    } else {
        println!("Daemon endpoint: {}", output.endpoint);
        println!("Access token: {}", output.auth_token);
        println!("Protocol version: {}", output.protocol_version);
    }
    Ok(())
}

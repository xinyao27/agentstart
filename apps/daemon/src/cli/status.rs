use std::ffi::OsString;
use std::path::PathBuf;

use serde::Serialize;

use super::CliError;
use super::flags::{has_flag, read_flag};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StatusOutput<'a> {
    #[serde(skip_serializing_if = "Option::is_none")]
    reachable: Option<bool>,
    endpoint: Option<&'a str>,
    pid: Option<u32>,
    runtime_id: Option<&'a str>,
    state: &'static str,
}

pub(super) fn run(args: &[OsString]) -> Result<(), CliError> {
    let user_data_path = match read_flag(args, "--daemon-data") {
        Some(path) => PathBuf::from(path),
        None => crate::paths::resolve_default_user_data_path()?,
    };
    let metadata = crate::runtime_metadata::read_live(&user_data_path);
    let bootstrap = match &metadata {
        Some(metadata) => crate::native_messaging::read_bootstrap_connection_if_exists(
            &user_data_path,
            metadata.pid,
        )?,
        None => None,
    };
    let reachable = has_flag(args, "--probe").then(|| {
        bootstrap.as_ref().is_some_and(|bootstrap| {
            metadata.as_ref().is_some_and(|metadata| {
                bootstrap.runtime_id == metadata.runtime_id() && probe(bootstrap)
            })
        })
    });
    let output = match (metadata.as_ref(), bootstrap.as_ref()) {
        (Some(metadata), Some(bootstrap)) => StatusOutput {
            reachable,
            endpoint: Some(&bootstrap.endpoint),
            pid: Some(metadata.pid),
            runtime_id: Some(metadata.runtime_id()),
            state: "running",
        },
        _ => StatusOutput {
            reachable,
            endpoint: None,
            pid: None,
            runtime_id: None,
            state: "not_running",
        },
    };
    if has_flag(args, "--json") {
        println!("{}", serde_json::to_string(&output)?);
    } else if let Some(endpoint) = output.endpoint {
        println!("Yiru daemon is running at {endpoint}");
    } else {
        println!("Yiru daemon is not running");
    }
    Ok(())
}

fn probe(bootstrap: &crate::native_messaging::BootstrapConnection) -> bool {
    // Why: status also runs before executor startup and from an existing executor.
    std::thread::scope(|scope| {
        scope
            .spawn(|| {
                let Ok(runtime) = tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                else {
                    return false;
                };
                runtime.block_on(async {
                    let Some(version) = bootstrap
                        .protocol_version
                        .as_u64()
                        .and_then(|value| u32::try_from(value).ok())
                    else {
                        return false;
                    };
                    tokio::time::timeout(std::time::Duration::from_secs(3), async {
                        let Ok(peer) = crate::transport::LocalProtocolClient::connect(
                            &bootstrap.endpoint,
                            &bootstrap.auth_token,
                            version,
                            &bootstrap.runtime_id,
                            None,
                        )
                        .await
                        else {
                            return false;
                        };
                        let _ = peer.close().await;
                        true
                    })
                    .await
                    .unwrap_or(false)
                })
            })
            .join()
            .unwrap_or(false)
    })
}

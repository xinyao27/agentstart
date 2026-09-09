use std::process::ExitCode;

use thiserror::Error;

use crate::diagnostics::{DiagnosticsTrace, TraceSpan};
use crate::mobile::{CompanionChannel, MobilePairingOfferError, MobileServer, MobileServerError};
use crate::native_messaging;
use crate::runtime::{Runtime, RuntimeConfig, RuntimeFault, ShutdownReason};
use crate::transport::{
    ExtensionDiscovery, ExtensionDiscoveryError, ExtensionRpcConfig, ExtensionRpcServer,
    ExtensionRpcServerError, generate_auth_token, read_allowed_extension_origins,
};
use crate::update::restart::{subscribe_runtime_restart, wait_for_runtime_restart};

use super::daemon_options::DaemonOptions;

#[derive(Debug, Error)]
pub(super) enum DaemonRunError {
    #[error(
        "existing_daemon_unreachable: stop the existing daemon before starting another instance"
    )]
    ExistingDaemonUnreachable,
    #[error(transparent)]
    Discovery(#[from] ExtensionDiscoveryError),
    #[error(transparent)]
    ExtensionTransport(#[from] ExtensionRpcServerError),
    #[error(transparent)]
    MobilePairing(#[from] MobilePairingOfferError),
    #[error(transparent)]
    MobileTransport(#[from] MobileServerError),
    #[error(transparent)]
    Runtime(#[from] RuntimeFault),
    #[error("daemon lifecycle I/O failed: {0}")]
    Signal(#[from] std::io::Error),
}

pub(super) async fn run(options: DaemonOptions) -> Result<ExitCode, DaemonRunError> {
    std::fs::create_dir_all(&options.user_data_path)?;
    let ownership = std::fs::OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(options.user_data_path.join("daemon.lock"))?;
    match ownership.try_lock() {
        Ok(()) => {}
        Err(std::fs::TryLockError::WouldBlock) => return Ok(ExitCode::SUCCESS),
        Err(std::fs::TryLockError::Error(error)) => return Err(error.into()),
    }
    // Why: older daemon versions do not take the lock; do not replace their discovery state.
    if existing_runtime_responds(&options.user_data_path).await? {
        return Ok(ExitCode::SUCCESS);
    }
    let trace = DiagnosticsTrace::new(&options.user_data_path);
    // Why a root: this is the process boundary. Nothing caused it, and it must
    // not attach to a parent left over on whatever task started the daemon.
    let mut span = trace.start_root_span(
        "daemon.lifecycle",
        trace_attributes([
            (
                "daemon.version",
                serde_json::json!(env!("CARGO_PKG_VERSION")),
            ),
            ("host.arch", serde_json::json!(std::env::consts::ARCH)),
            ("host.platform", serde_json::json!(std::env::consts::OS)),
        ]),
    );
    // Why scoped: `daemon.startup` and `daemon.serving` then adopt the process
    // span automatically, so one trace covers the whole run instead of three
    // unrelated roots.
    let result = span.scope(run_traced(options, &trace)).await;
    finish_result(&mut span, &result);
    trace.shutdown();
    result
}

async fn existing_runtime_responds(path: &std::path::Path) -> Result<bool, DaemonRunError> {
    let Some(metadata) = crate::runtime_metadata::read_live(path) else {
        return Ok(false);
    };
    let Ok(Some(bootstrap)) =
        native_messaging::read_bootstrap_connection_if_exists(path, metadata.pid)
    else {
        return Err(DaemonRunError::ExistingDaemonUnreachable);
    };
    let Some(version) = bootstrap
        .protocol_version
        .as_u64()
        .and_then(|value| u32::try_from(value).ok())
    else {
        return Err(DaemonRunError::ExistingDaemonUnreachable);
    };
    let reachable = tokio::time::timeout(std::time::Duration::from_secs(3), async {
        let Ok(peer) = crate::transport::LocalProtocolClient::connect(
            &bootstrap.endpoint,
            &bootstrap.auth_token,
            version,
            &bootstrap.runtime_id,
            Some(metadata.runtime_id()),
        )
        .await
        else {
            return false;
        };
        let _ = peer.close().await;
        true
    })
    .await
    .unwrap_or(false);
    reachable
        .then_some(true)
        .ok_or(DaemonRunError::ExistingDaemonUnreachable)
}

async fn run_traced(
    options: DaemonOptions,
    trace: &DiagnosticsTrace,
) -> Result<ExitCode, DaemonRunError> {
    let user_data_path = options.user_data_path.clone();
    let allowed_origins = read_allowed_extension_origins(native_messaging::extension_origin());
    let mut startup_span = trace.start_span(
        "daemon.startup",
        trace_attributes([(
            "mobile.pairing_requested",
            serde_json::json!(options.mobile_pairing),
        )]),
    );
    let mut runtime_span = startup_span.child("daemon.startup.runtime", serde_json::Map::new());
    // Why scoped: `Runtime::open` builds the database, AI Vault and Git
    // authorities, and the spans those start have no reference to this phase.
    let runtime_result = runtime_span
        .scope(Runtime::open(RuntimeConfig {
            allowed_extension_origins: allowed_origins.clone(),
            diagnostics_trace: trace.clone(),
            user_data_path: user_data_path.clone(),
        }))
        .await;
    finish_result(&mut runtime_span, &runtime_result);
    let (runtime, _) = match runtime_result {
        Ok(runtime) => runtime,
        Err(error) => {
            startup_span.failure(&error.to_string());
            return Err(error.into());
        }
    };
    let mut auth_span = startup_span.child("daemon.startup.authentication", serde_json::Map::new());
    let auth_result = generate_auth_token();
    finish_result(&mut auth_span, &auth_result);
    let auth_token = match auth_result {
        Ok(auth_token) => auth_token,
        Err(error) => {
            shutdown_runtime_after_startup_failure(runtime).await;
            startup_span.failure(&error.to_string());
            return Err(error.into());
        }
    };
    let mut extension_span =
        startup_span.child("daemon.startup.extension_transport", serde_json::Map::new());
    let extension_result = ExtensionRpcServer::bind(ExtensionRpcConfig {
        allowed_origins,
        artifacts: runtime.artifact_store(),
        auth_token: auth_token.clone(),
        hostname: options.listen_address,
        port: options.rpc_port,
        runtime_id: runtime.identity().runtime_id().to_owned(),
    })
    .await;
    finish_result(&mut extension_span, &extension_result);
    let mut extension = match extension_result {
        Ok(server) => server,
        Err(error) => {
            shutdown_runtime_after_startup_failure(runtime).await;
            startup_span.failure(&error.to_string());
            return Err(error.into());
        }
    };
    let mut mobile_span =
        startup_span.child("daemon.startup.mobile_transport", serde_json::Map::new());
    let mobile_result = MobileServer::bind(runtime.mobile_server_config(options.mobile_port)).await;
    finish_result(&mut mobile_span, &mobile_result);
    let mut mobile = match mobile_result {
        Ok(server) => server,
        Err(error) => {
            extension.begin_shutdown();
            shutdown_runtime_after_startup_failure(runtime).await;
            log_extension_cleanup(extension.wait().await);
            startup_span.failure(&error.to_string());
            return Err(error.into());
        }
    };
    runtime.activate_mobile_endpoint(mobile.endpoint().to_owned());
    runtime
        .runtime_environment_authority()
        .activate_endpoint(mobile.runtime_endpoint().to_owned());
    let pairing_url = if options.mobile_pairing {
        let mut pairing_span =
            startup_span.child("daemon.startup.mobile_pairing", serde_json::Map::new());
        let address = options
            .pairing_address
            .unwrap_or_else(|| endpoint_address(mobile.endpoint()));
        match runtime
            .create_mobile_pairing_offer(
                mobile.endpoint(),
                &address,
                "Mobile runtime client".to_owned(),
            )
            .await
        {
            Ok(offer) => {
                pairing_span.success();
                Some(offer.pairing_url)
            }
            Err(error) => {
                pairing_span.failure(&error.to_string());
                cleanup_after_startup_failure(extension, mobile, runtime).await;
                startup_span.failure(&error.to_string());
                return Err(error.into());
            }
        }
    } else {
        None
    };
    let mut discovery_span = startup_span.child("daemon.startup.discovery", serde_json::Map::new());
    let discovery_result = ExtensionDiscovery::publish(
        &user_data_path,
        runtime.identity(),
        &auth_token,
        extension.endpoint(),
        mobile.endpoint(),
    );
    finish_result(&mut discovery_span, &discovery_result);
    let discovery = match discovery_result {
        Ok(discovery) => discovery,
        Err(error) => {
            cleanup_after_startup_failure(extension, mobile, runtime).await;
            startup_span.failure(&error.to_string());
            return Err(error.into());
        }
    };
    print_readiness(
        options.json,
        runtime.identity().runtime_id(),
        extension.endpoint(),
        mobile.endpoint(),
        pairing_url.as_deref(),
    );
    startup_span.success();

    let signal = shutdown_signal();
    let mut restart = subscribe_runtime_restart();
    tokio::pin!(signal);
    let mut serving_span = trace.start_span("daemon.serving", serde_json::Map::new());
    let (shutdown_reason, run_error) = loop {
        tokio::select! {
            signal_result = &mut signal => {
                break match signal_result {
                    Ok(reason) => (reason, None::<DaemonRunError>),
                    Err(error) => (ShutdownReason::StartupFailure, Some(error.into())),
                };
            }
            () = wait_for_runtime_restart(&mut restart) => {
                break (ShutdownReason::Restart, None::<DaemonRunError>);
            }
            channel = extension.accept() => {
                let Some(channel) = channel else {
                    break (ShutdownReason::StartupFailure, None::<DaemonRunError>);
                };
                if let Err(error) = runtime.attach(channel) {
                    break (ShutdownReason::StartupFailure, Some(error.into()));
                }
            }
            channel = mobile.accept() => {
                let Some(channel) = channel else {
                    break (ShutdownReason::StartupFailure, None::<DaemonRunError>);
                };
                let result = match channel {
                    CompanionChannel::Mobile(channel) => runtime.attach_mobile(channel),
                    CompanionChannel::Runtime(channel) => runtime.attach_runtime(channel),
                };
                if let Err(error) = result {
                    break (ShutdownReason::StartupFailure, Some(error.into()));
                }
            }
        }
    };
    serving_span.set_attribute(
        "shutdown.reason",
        serde_json::json!(shutdown_reason_label(&shutdown_reason)),
    );
    if let Some(error) = &run_error {
        serving_span.failure(&error.to_string());
    } else {
        serving_span.success();
    }

    // Why: service supervisors restart only failed exits; restart and unexpected transport loss
    // must remain distinguishable from a successful SIGINT/SIGTERM after all state is flushed.
    let exit_code = match &shutdown_reason {
        ShutdownReason::Restart => ExitCode::from(75),
        ShutdownReason::StartupFailure => ExitCode::FAILURE,
        ShutdownReason::Requested | ShutdownReason::Signal => ExitCode::SUCCESS,
    };
    let mut shutdown_span = trace.start_span(
        "daemon.shutdown",
        trace_attributes([(
            "shutdown.reason",
            serde_json::json!(shutdown_reason_label(&shutdown_reason)),
        )]),
    );
    extension.begin_shutdown();
    mobile.begin_shutdown();
    let runtime_result = runtime.shutdown(shutdown_reason).await;
    let extension_result = extension.wait().await;
    let mobile_result = mobile.wait().await;
    let discovery_result = discovery.clear();
    let result = (|| {
        if let Some(error) = run_error {
            return Err(error);
        }
        extension_result?;
        mobile_result?;
        runtime_result?;
        discovery_result?;
        Ok(exit_code)
    })();
    finish_result(&mut shutdown_span, &result);
    result
}

fn finish_result<T, E: std::fmt::Display>(span: &mut TraceSpan, result: &Result<T, E>) {
    match result {
        Ok(_) => span.success(),
        Err(error) => span.failure(&error.to_string()),
    }
}

fn shutdown_reason_label(reason: &ShutdownReason) -> &'static str {
    match reason {
        ShutdownReason::Requested => "requested",
        ShutdownReason::Restart => "restart",
        ShutdownReason::Signal => "signal",
        ShutdownReason::StartupFailure => "startup_failure",
    }
}

fn trace_attributes<const N: usize>(
    entries: [(&'static str, serde_json::Value); N],
) -> serde_json::Map<String, serde_json::Value> {
    entries
        .into_iter()
        .map(|(key, value)| (key.to_owned(), value))
        .collect()
}

async fn cleanup_after_startup_failure(
    mut extension: ExtensionRpcServer,
    mut mobile: MobileServer,
    runtime: Runtime,
) {
    extension.begin_shutdown();
    mobile.begin_shutdown();
    shutdown_runtime_after_startup_failure(runtime).await;
    log_extension_cleanup(extension.wait().await);
    if let Err(error) = mobile.wait().await {
        eprintln!("[daemon] Mobile transport cleanup failed: {error}");
    }
}

async fn shutdown_runtime_after_startup_failure(runtime: Runtime) {
    if let Err(error) = runtime.shutdown(ShutdownReason::StartupFailure).await {
        eprintln!("[daemon] Runtime cleanup failed: {error}");
    }
}

fn log_extension_cleanup(result: Result<(), ExtensionRpcServerError>) {
    if let Err(error) = result {
        eprintln!("[daemon] Extension transport cleanup failed: {error}");
    }
}

fn endpoint_address(endpoint: &str) -> String {
    let Ok(endpoint) = url::Url::parse(endpoint) else {
        return endpoint.to_owned();
    };
    match endpoint.port() {
        Some(port) => format!("{}:{port}", endpoint.host_str().unwrap_or("127.0.0.1")),
        None => endpoint.host_str().unwrap_or("127.0.0.1").to_owned(),
    }
}

fn print_readiness(
    json: bool,
    runtime_id: &str,
    extension_endpoint: &str,
    mobile_endpoint: &str,
    pairing_url: Option<&str>,
) {
    if json {
        println!(
            "{}",
            serde_json::json!({
                "status": "ready",
                "extensionEndpoint": extension_endpoint,
                "mobileEndpoint": mobile_endpoint,
                "pairingUrl": pairing_url,
                "runtimeId": runtime_id
            })
        );
        return;
    }
    println!("Yiru daemon ready: {runtime_id}");
    println!("Extension endpoint: {extension_endpoint}");
    println!("Mobile endpoint: {mobile_endpoint}");
    if let Some(pairing_url) = pairing_url {
        println!("Mobile pairing: {pairing_url}");
    }
}

#[cfg(unix)]
async fn shutdown_signal() -> Result<ShutdownReason, std::io::Error> {
    use tokio::signal::unix::{SignalKind, signal};

    let mut terminate = signal(SignalKind::terminate())?;
    let mut hangup = signal(SignalKind::hangup())?;
    tokio::select! {
        result = tokio::signal::ctrl_c() => result.map(|()| ShutdownReason::Signal),
        _ = terminate.recv() => Ok(ShutdownReason::Signal),
        _ = hangup.recv() => Ok(ShutdownReason::Restart),
    }
}

#[cfg(not(unix))]
async fn shutdown_signal() -> Result<ShutdownReason, std::io::Error> {
    tokio::signal::ctrl_c()
        .await
        .map(|()| ShutdownReason::Signal)
}

use std::ffi::OsString;
use std::process::ExitCode;

use crate::update::restart::restart_installed_service;
use crate::update::{UpdateChecker, UpdateError};

pub(super) async fn run(args: &[OsString]) -> ExitCode {
    match execute(args).await {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("Yiru update failed: {error}");
            ExitCode::FAILURE
        }
    }
}

async fn execute(args: &[OsString]) -> Result<(), UpdateCommandError> {
    validate_args(args)?;
    let is_json = has_flag(args, "--json");
    let updates = UpdateChecker::new()?;
    if has_flag(args, "--check") {
        let status = updates.check(true).await?;
        if is_json {
            println!("{}", serde_json::to_string(&status)?);
        } else if status.update_available {
            let version = status.latest_version.as_deref().unwrap_or("unknown");
            println!(
                "Yiru {version} is available; run {}",
                status.install_command
            );
        } else {
            println!("Yiru is up to date");
        }
        return Ok(());
    }
    let result = updates.install_latest(|_| {}).await?;
    let service_restarted = result.installed && restart_installed_service()?;
    if is_json {
        println!("{}", serde_json::to_string(&result)?);
    } else if !result.installed {
        println!("Yiru is already up to date");
    } else if service_restarted {
        println!(
            "Installed Yiru {} and restarted the service",
            result.version
        );
    } else {
        println!(
            "Installed Yiru {}; no running managed service required a restart",
            result.version
        );
    }
    Ok(())
}

fn validate_args(args: &[OsString]) -> Result<(), UpdateCommandError> {
    for argument in args {
        if argument != "--check" && argument != "--json" {
            return Err(UpdateCommandError::UnsupportedArgument(
                argument.to_string_lossy().into_owned(),
            ));
        }
    }
    Ok(())
}

fn has_flag(args: &[OsString], flag: &str) -> bool {
    args.iter().any(|argument| argument == flag)
}

#[derive(Debug, thiserror::Error)]
enum UpdateCommandError {
    #[error("update_argument_unsupported:{0}")]
    UnsupportedArgument(String),
    #[error(transparent)]
    Update(#[from] UpdateError),
    #[error("update_output_serialization_failed:{0}")]
    Serialization(#[from] serde_json::Error),
}

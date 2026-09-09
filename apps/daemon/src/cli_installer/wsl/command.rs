use base64::Engine as _;
use base64::engine::general_purpose::STANDARD;

use crate::hosts::{ExecutionHost, HostCommand, HostCommandErrorKind, LocalHost};

use super::super::CliInstallerError;
use super::scripts::quote_shell;

const WSL_COMMAND_TIMEOUT_MS: u64 = 10_000;
const WSL_COMMAND_MAX_OUTPUT_BYTES: usize = 10 * 1024 * 1024;

pub(super) async fn run(distro: &str, script: &str) -> Result<String, CliInstallerError> {
    let encoded = STANDARD.encode(script);
    let bash_command = format!(
        "set -o pipefail; printf %s {} | base64 -d | bash",
        quote_shell(&encoded)
    );
    let mut command = HostCommand::new(
        "wsl.exe",
        ["-d", distro, "--", "bash", "-lc", &bash_command],
    );
    command.kill_process_tree = true;
    command.max_output_bytes = Some(WSL_COMMAND_MAX_OUTPUT_BYTES);
    command.timeout_ms = Some(WSL_COMMAND_TIMEOUT_MS);
    let output = LocalHost::new().exec(command).await.map_err(|error| {
        let message = match error.kind() {
            HostCommandErrorKind::Timeout => {
                format!("wsl.exe timed out after {WSL_COMMAND_TIMEOUT_MS}ms.")
            }
            HostCommandErrorKind::OutputLimit => "Subprocess output exceeded maxBuffer.".to_owned(),
            HostCommandErrorKind::Cancelled
            | HostCommandErrorKind::Spawn
            | HostCommandErrorKind::Stopped
            | HostCommandErrorKind::Wait => error.to_string(),
        };
        CliInstallerError::WslCommand(message)
    })?;
    if output.exit_code != 0 {
        return Err(CliInstallerError::WslCommand(format!(
            "wsl.exe exited with code {}.",
            output.exit_code
        )));
    }
    Ok(output.stdout)
}

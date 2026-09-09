use async_trait::async_trait;
use thiserror::Error;

use super::command;
use super::model::{
    ExecutionHost, HostCommand, HostCommandError, HostCommandOutput, HostKind, HostPlatform,
    failed_command,
};
use super::posix::{build, encoded_host_id};

pub struct WslHost {
    distribution: String,
    executable: String,
    id: String,
    label: String,
}

#[derive(Debug, Error)]
pub enum WslHostError {
    #[error("wsl_distribution_invalid")]
    InvalidDistribution,
}

impl WslHost {
    pub fn new(
        label: impl Into<String>,
        distribution: impl Into<String>,
    ) -> Result<Self, WslHostError> {
        let distribution = distribution.into();
        if distribution.trim().is_empty()
            || distribution.starts_with('-')
            || distribution
                .bytes()
                .any(|byte| matches!(byte, 0 | b'\r' | b'\n'))
        {
            return Err(WslHostError::InvalidDistribution);
        }
        Ok(Self {
            id: encoded_host_id("wsl:", &distribution),
            distribution,
            executable: "wsl.exe".to_owned(),
            label: label.into(),
        })
    }
}

#[async_trait]
impl ExecutionHost for WslHost {
    fn id(&self) -> &str {
        &self.id
    }

    fn kind(&self) -> HostKind {
        HostKind::Wsl
    }

    fn label(&self) -> &str {
        &self.label
    }

    fn platform(&self) -> HostPlatform {
        HostPlatform::Linux
    }

    fn runtime_pid(&self) -> Option<u32> {
        None
    }

    fn target(&self) -> Option<&str> {
        Some(&self.distribution)
    }

    async fn exec(&self, input: HostCommand) -> Result<HostCommandOutput, HostCommandError> {
        let remote_command = build(&input);
        let mut transport = HostCommand::new(
            self.executable.clone(),
            [
                "--distribution".to_owned(),
                self.distribution.clone(),
                "--exec".to_owned(),
                "sh".to_owned(),
                "-lc".to_owned(),
                remote_command,
            ],
        );
        transport.cancel = input.cancel;
        transport.capture_stdout_bytes = input.capture_stdout_bytes;
        transport.disable_timeout = input.disable_timeout;
        transport.kill_process_tree = input.kill_process_tree;
        transport.max_output_bytes = input.max_output_bytes;
        transport.retain_stderr = input.retain_stderr;
        transport.retain_stdout = input.retain_stdout;
        transport.stdin = input.stdin;
        transport.output_observer = input.output_observer;
        transport.timeout_ms = input.timeout_ms;
        command::run(transport).await
    }

    async fn terminate(&self, pid: u32) -> Result<(), HostCommandError> {
        terminate(self, pid).await
    }
}

async fn terminate(host: &dyn ExecutionHost, pid: u32) -> Result<(), HostCommandError> {
    let output = host
        .exec(HostCommand::new(
            "kill",
            ["-TERM".to_owned(), "--".to_owned(), pid.to_string()],
        ))
        .await?;
    if output.exit_code == 0 {
        Ok(())
    } else {
        Err(failed_command(output, "Failed to stop the process."))
    }
}

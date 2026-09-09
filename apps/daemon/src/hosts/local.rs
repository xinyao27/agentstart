use async_trait::async_trait;

use super::command;
use super::model::{
    ExecutionHost, HostCommand, HostCommandError, HostCommandOutput, HostKind, HostPlatform,
    failed_command,
};

pub struct LocalHost {
    label: &'static str,
    platform: HostPlatform,
}

impl LocalHost {
    pub fn new() -> Self {
        let platform = local_platform();
        Self {
            label: match platform {
                HostPlatform::Darwin => "Local Mac",
                HostPlatform::Linux => "Local Linux",
                HostPlatform::Windows => "Local Windows",
                HostPlatform::Unknown => "This computer",
            },
            platform,
        }
    }
}

impl Default for LocalHost {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl ExecutionHost for LocalHost {
    fn id(&self) -> &str {
        "local"
    }

    fn kind(&self) -> HostKind {
        HostKind::Local
    }

    fn label(&self) -> &str {
        self.label
    }

    fn platform(&self) -> HostPlatform {
        self.platform
    }

    fn runtime_pid(&self) -> Option<u32> {
        Some(std::process::id())
    }

    fn target(&self) -> Option<&str> {
        None
    }

    async fn exec(&self, command: HostCommand) -> Result<HostCommandOutput, HostCommandError> {
        command::run(command).await
    }

    async fn terminate(&self, pid: u32) -> Result<(), HostCommandError> {
        let command = if self.platform == HostPlatform::Windows {
            HostCommand::new(
                "taskkill",
                ["/PID".to_owned(), pid.to_string(), "/F".to_owned()],
            )
        } else {
            HostCommand::new(
                "kill",
                ["-TERM".to_owned(), "--".to_owned(), pid.to_string()],
            )
        };
        let output = self.exec(command).await?;
        if output.exit_code == 0 {
            Ok(())
        } else {
            Err(failed_command(output, "Failed to stop the process."))
        }
    }
}

fn local_platform() -> HostPlatform {
    match std::env::consts::OS {
        "linux" => HostPlatform::Linux,
        "macos" => HostPlatform::Darwin,
        "windows" => HostPlatform::Windows,
        _ => HostPlatform::Unknown,
    }
}

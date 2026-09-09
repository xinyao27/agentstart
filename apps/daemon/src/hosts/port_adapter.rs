use std::sync::Arc;
use std::sync::{Mutex, MutexGuard};

use async_trait::async_trait;

use super::model::{ExecutionHost, HostCommand, HostCommandErrorKind, HostPlatform};
use super::{port_darwin, port_linux, port_windows};
use crate::workspace_ports::{
    RawWorkspacePort, WorkspacePortHost, WorkspacePortHostError, WorkspacePortPlatform,
};

const PLATFORM_PROBE_TIMEOUT_MS: u64 = 4_000;
pub(super) const PORT_SCAN_MAX_OUTPUT_BYTES: usize = 2 * 1_024 * 1_024;

pub struct HostWorkspacePorts {
    host: Arc<dyn ExecutionHost>,
    platform: Mutex<WorkspacePortPlatform>,
}

impl HostWorkspacePorts {
    pub fn new(host: Arc<dyn ExecutionHost>) -> Self {
        Self {
            platform: Mutex::new(workspace_platform(host.platform())),
            host,
        }
    }

    async fn resolve_platform(&self) -> Result<WorkspacePortPlatform, WorkspacePortHostError> {
        let current = *lock(&self.platform);
        if current != WorkspacePortPlatform::Unknown {
            return Ok(current);
        }
        let mut command = HostCommand::new("uname", ["-s"]);
        command.timeout_ms = Some(PLATFORM_PROBE_TIMEOUT_MS);
        let output = self.host.exec(command).await.map_err(host_error)?;
        if output.exit_code != 0 {
            return Err(WorkspacePortHostError::unavailable(
                "host platform probe failed",
            ));
        }
        let platform = platform_from_uname(output.stdout.trim());
        *lock(&self.platform) = platform;
        Ok(platform)
    }
}

#[async_trait]
impl WorkspacePortHost for HostWorkspacePorts {
    fn id(&self) -> &str {
        self.host.id()
    }

    fn platform(&self) -> WorkspacePortPlatform {
        *lock(&self.platform)
    }

    fn runtime_pid(&self) -> Option<u32> {
        self.host.runtime_pid()
    }

    async fn scan_listeners(&self) -> Result<Vec<RawWorkspacePort>, WorkspacePortHostError> {
        match self.resolve_platform().await? {
            WorkspacePortPlatform::Darwin => port_darwin::scan(self.host.as_ref()).await,
            WorkspacePortPlatform::Linux => port_linux::scan(self.host.as_ref()).await,
            WorkspacePortPlatform::Windows => port_windows::scan(self.host.as_ref()).await,
            platform => {
                return Err(WorkspacePortHostError::unavailable(format!(
                    "port scanning is not supported on {platform}"
                )));
            }
        }
        .map_err(host_error)
    }

    async fn terminate(&self, pid: u32) -> Result<(), WorkspacePortHostError> {
        self.host.terminate(pid).await.map_err(host_error)
    }
}

fn host_error(error: super::HostCommandError) -> WorkspacePortHostError {
    if error.kind() == HostCommandErrorKind::Timeout {
        WorkspacePortHostError::timeout(error.to_string())
    } else {
        WorkspacePortHostError::unavailable(error.to_string())
    }
}

fn platform_from_uname(value: &str) -> WorkspacePortPlatform {
    let value = value.to_ascii_lowercase();
    if value == "darwin" {
        WorkspacePortPlatform::Darwin
    } else if value == "linux" {
        WorkspacePortPlatform::Linux
    } else if value.starts_with("cygwin") {
        WorkspacePortPlatform::Cygwin
    } else if value == "freebsd" {
        WorkspacePortPlatform::Freebsd
    } else if value == "netbsd" {
        WorkspacePortPlatform::Netbsd
    } else if value == "openbsd" {
        WorkspacePortPlatform::Openbsd
    } else if value == "sunos" {
        WorkspacePortPlatform::Sunos
    } else {
        WorkspacePortPlatform::Unknown
    }
}

fn workspace_platform(platform: HostPlatform) -> WorkspacePortPlatform {
    match platform {
        HostPlatform::Darwin => WorkspacePortPlatform::Darwin,
        HostPlatform::Linux => WorkspacePortPlatform::Linux,
        HostPlatform::Unknown => WorkspacePortPlatform::Unknown,
        HostPlatform::Windows => WorkspacePortPlatform::Windows,
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

use std::collections::HashMap;
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, Instant};

use crate::hosts::{ExecutionHost, HostCommand, HostPlatform};

use super::HostCapability;

const CAPABILITY_TTL: Duration = Duration::from_secs(60);
const PROBE_TIMEOUT_MS: u64 = 15_000;

#[derive(Clone)]
pub(super) struct HostCapabilityCache {
    entries: Arc<Mutex<HashMap<String, CacheEntry>>>,
}

struct CacheEntry {
    capabilities: Vec<HostCapability>,
    expires_at: Instant,
}

impl HostCapabilityCache {
    pub(super) fn new() -> Self {
        Self {
            entries: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub(super) async fn probe(&self, host: Arc<dyn ExecutionHost>) -> Vec<HostCapability> {
        if let Some(capabilities) = self.cached(host.id()) {
            return capabilities;
        }
        let (filesystem, git, pty) = tokio::join!(
            probe_filesystem(host.clone()),
            probe_command(host.clone(), "git", "git", ["--version"]),
            probe_pty(host.clone())
        );
        let capabilities = vec![filesystem, git, pty];
        lock(&self.entries).insert(
            host.id().to_owned(),
            CacheEntry {
                capabilities: capabilities.clone(),
                expires_at: Instant::now() + CAPABILITY_TTL,
            },
        );
        capabilities
    }

    pub(super) fn invalidate(&self, host_id: &str) {
        lock(&self.entries).remove(host_id);
    }

    fn cached(&self, host_id: &str) -> Option<Vec<HostCapability>> {
        let mut entries = lock(&self.entries);
        let entry = entries.get(host_id)?;
        if entry.expires_at > Instant::now() {
            Some(entry.capabilities.clone())
        } else {
            entries.remove(host_id);
            None
        }
    }
}

async fn probe_filesystem(host: Arc<dyn ExecutionHost>) -> HostCapability {
    if host.platform() == HostPlatform::Windows {
        probe_command(
            host,
            "fs",
            "powershell.exe",
            [
                "-NoLogo",
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "[Console]::Out.Write((Get-Location).Path)",
            ],
        )
        .await
    } else {
        probe_command(host, "fs", "pwd", ["-P"]).await
    }
}

async fn probe_pty(host: Arc<dyn ExecutionHost>) -> HostCapability {
    if host.platform() == HostPlatform::Windows {
        probe_command(
            host,
            "pty",
            "powershell.exe",
            [
                "-NoLogo",
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "[Console]::Out.Write('yiru-pty-ready')",
            ],
        )
        .await
    } else {
        probe_command(host, "pty", "sh", ["-lc", "printf yiru-pty-ready"]).await
    }
}

async fn probe_command<const N: usize>(
    host: Arc<dyn ExecutionHost>,
    name: &'static str,
    command: &str,
    args: [&str; N],
) -> HostCapability {
    let mut command = HostCommand::new(command, args);
    command.timeout_ms = Some(PROBE_TIMEOUT_MS);
    match host.exec(command).await {
        Ok(output) => {
            let available = output.exit_code == 0;
            let detail = if available {
                output.stdout.trim()
            } else {
                output.stderr.trim()
            };
            HostCapability {
                available,
                detail: nonempty(truncate_utf16(detail, 512)),
                name,
            }
        }
        Err(error) => HostCapability {
            available: false,
            detail: Some(error.to_string()),
            name,
        },
    }
}

fn truncate_utf16(value: &str, maximum: usize) -> String {
    let units = value.encode_utf16().take(maximum).collect::<Vec<_>>();
    String::from_utf16_lossy(&units)
}

fn nonempty(value: String) -> Option<String> {
    (!value.is_empty()).then_some(value)
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

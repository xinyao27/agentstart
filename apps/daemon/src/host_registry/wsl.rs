use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, Instant};

use crate::hosts::{ExecutionHost, HostCommand, HostPlatform};

const COMMAND_TIMEOUT_MS: u64 = 5_000;
const LIST_FAILURE_TTL: Duration = Duration::from_secs(15);

#[derive(Clone)]
pub(super) struct WslCapability {
    state: Arc<Mutex<WslState>>,
}

#[derive(Default)]
struct WslState {
    available: Option<bool>,
    distros: Option<Vec<String>>,
    list_failed_until: Option<Instant>,
}

impl WslCapability {
    pub(super) fn new() -> Self {
        Self {
            state: Arc::new(Mutex::new(WslState::default())),
        }
    }

    pub(super) async fn available(&self, local: Arc<dyn ExecutionHost>) -> bool {
        if let Some(available) = lock(&self.state).available {
            return available;
        }
        let available = if local.platform() == HostPlatform::Windows {
            successful(local, "wsl.exe", ["--status"]).await
        } else {
            false
        };
        lock(&self.state).available = Some(available);
        available
    }

    pub(super) async fn list_distros(&self, local: Arc<dyn ExecutionHost>) -> Vec<String> {
        {
            let state = lock(&self.state);
            if let Some(distros) = &state.distros {
                return distros.clone();
            }
            if state
                .list_failed_until
                .is_some_and(|deadline| deadline > Instant::now())
            {
                return Vec::new();
            }
        }
        if local.platform() != HostPlatform::Windows {
            return self.remember_distros(Vec::new());
        }
        let mut command = HostCommand::new("wsl.exe", ["--list", "--quiet"]);
        command.timeout_ms = Some(COMMAND_TIMEOUT_MS);
        match local.exec(command).await {
            Ok(output) if output.exit_code == 0 => {
                self.remember_distros(normalize_distros(&output.stdout))
            }
            Ok(_) | Err(_) => {
                lock(&self.state).list_failed_until = Some(Instant::now() + LIST_FAILURE_TTL);
                Vec::new()
            }
        }
    }

    fn remember_distros(&self, distros: Vec<String>) -> Vec<String> {
        lock(&self.state).distros = Some(distros.clone());
        distros
    }
}

async fn successful<const N: usize>(
    local: Arc<dyn ExecutionHost>,
    executable: &str,
    args: [&str; N],
) -> bool {
    let mut command = HostCommand::new(executable, args);
    command.timeout_ms = Some(COMMAND_TIMEOUT_MS);
    local
        .exec(command)
        .await
        .is_ok_and(|output| output.exit_code == 0)
}

fn normalize_distros(output: &str) -> Vec<String> {
    output
        .replace('\0', "")
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            let line = line
                .strip_prefix('*')
                .map_or(line, |remainder| remainder.trim_start());
            (!line.is_empty() && !line.to_ascii_lowercase().starts_with("docker-desktop"))
                .then(|| line.to_owned())
        })
        .collect()
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

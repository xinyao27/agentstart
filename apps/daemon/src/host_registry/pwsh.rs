use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use crate::hosts::{ExecutionHost, HostCommand, HostCommandErrorKind, HostPlatform};
use crate::mutex_lock::lock;

const NEGATIVE_CACHE_TTL: Duration = Duration::from_secs(30);
const PROBE_TIMEOUT_MS: u64 = 5_000;

#[derive(Clone)]
pub(super) struct PwshCapability {
    cache: Arc<Mutex<PwshCache>>,
}

#[derive(Clone, Copy)]
enum PwshCache {
    Empty,
    Positive,
    PermanentNegative,
    RetryAfter(Instant),
}

impl PwshCapability {
    pub(super) fn new() -> Self {
        Self {
            cache: Arc::new(Mutex::new(PwshCache::Empty)),
        }
    }

    pub(super) async fn available(&self, local: Arc<dyn ExecutionHost>) -> bool {
        match *lock(&self.cache) {
            PwshCache::Positive => return true,
            PwshCache::PermanentNegative => return false,
            PwshCache::RetryAfter(deadline) if deadline > Instant::now() => return false,
            PwshCache::Empty | PwshCache::RetryAfter(_) => {}
        }
        if local.platform() != HostPlatform::Windows {
            *lock(&self.cache) = PwshCache::PermanentNegative;
            return false;
        }
        let mut command = HostCommand::new("pwsh.exe", ["-Version"]);
        command.timeout_ms = Some(PROBE_TIMEOUT_MS);
        match local.exec(command).await {
            Ok(output) if output.exit_code == 0 => {
                *lock(&self.cache) = PwshCache::Positive;
                true
            }
            Err(error) if error.kind() == HostCommandErrorKind::Timeout => {
                *lock(&self.cache) = PwshCache::Empty;
                false
            }
            Ok(_) | Err(_) => {
                *lock(&self.cache) = PwshCache::RetryAfter(Instant::now() + NEGATIVE_CACHE_TTL);
                false
            }
        }
    }
}

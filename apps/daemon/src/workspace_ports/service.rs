use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{SystemTime, UNIX_EPOCH};

use super::advertised_input::{AdvertisedInput, ObservedUrl};
use super::advertised_urls::AdvertisedUrls;
use super::ownership::{enrich_ports, normalize_probes, reconcile_advertised_urls};
use super::subscription::EventAuthority;
use super::{
    WorkspacePortClassification, WorkspacePortHost, WorkspacePortHostFailureKind,
    WorkspacePortKillRequest, WorkspacePortKillResult, WorkspacePortProbe, WorkspacePortScanResult,
    WorkspacePortSubscription,
};

const INITIAL_TIMEOUT_BACKOFF_MS: i64 = 60_000;
const MAX_TIMEOUT_BACKOFF_MS: i64 = 5 * 60_000;
const MAX_SAFE_INTEGER: f64 = 9_007_199_254_740_991.0;

#[derive(Clone)]
pub struct WorkspacePorts {
    advertised_input: Arc<AdvertisedInput>,
    advertised_urls: AdvertisedUrls,
    backoff: Arc<Mutex<TimeoutBackoff>>,
    host: Arc<dyn WorkspacePortHost>,
}

impl WorkspacePorts {
    pub fn new(host: Arc<dyn WorkspacePortHost>) -> Self {
        Self::with_events(host, EventAuthority::new())
    }

    pub(super) fn with_events(host: Arc<dyn WorkspacePortHost>, events: EventAuthority) -> Self {
        Self {
            advertised_input: Arc::new(AdvertisedInput::default()),
            advertised_urls: AdvertisedUrls::new(events),
            backoff: Arc::new(Mutex::new(TimeoutBackoff::default())),
            host,
        }
    }

    pub async fn scan(
        &self,
        probes: &[WorkspacePortProbe],
        repo_id: Option<&str>,
    ) -> WorkspacePortScanResult {
        let now = epoch_millis();
        if let Some(remaining_ms) = lock(&self.backoff).cooldown_remaining(now) {
            return self.unavailable_scan(
                now,
                format!(
                    "Port scanning is temporarily paused after a command timeout. Retrying in {}s.",
                    (remaining_ms + 999) / 1_000
                ),
            );
        }
        let raw_ports = match self.host.scan_listeners().await {
            Ok(raw_ports) => {
                lock(&self.backoff).record_success();
                raw_ports
            }
            Err(error) => {
                if error.kind() == WorkspacePortHostFailureKind::Timeout {
                    lock(&self.backoff).record_timeout(epoch_millis());
                }
                return self.unavailable_scan(
                    epoch_millis(),
                    format!("Port scanning is unavailable on {}.", self.host.platform()),
                );
            }
        };
        let probes = normalize_probes(
            probes
                .iter()
                .filter(|probe| {
                    probe.host_id == self.host.id()
                        && repo_id.is_none_or(|repo_id| probe.repo_id == repo_id)
                })
                .cloned(),
            self.host.platform(),
        );
        reconcile_advertised_urls(&raw_ports, &probes, &self.advertised_urls);
        WorkspacePortScanResult {
            platform: self.host.platform(),
            ports: enrich_ports(raw_ports, &probes, &self.advertised_urls),
            scanned_at: epoch_millis(),
            unavailable_reason: None,
        }
    }

    pub async fn kill(
        &self,
        probes: &[WorkspacePortProbe],
        repo_id: Option<&str>,
        request: WorkspacePortKillRequest,
    ) -> WorkspacePortKillResult {
        if !is_safe_integer(request.pid) || request.pid <= 0.0 || !is_safe_integer(request.port) {
            return WorkspacePortKillResult::failed("Invalid process or port.");
        }
        let scan = self.scan(probes, repo_id).await;
        let port = scan.ports.iter().find(|candidate| {
            candidate
                .pid
                .is_some_and(|pid| f64::from(pid) == request.pid)
                && f64::from(candidate.port) == request.port
        });
        let Some(port) = port else {
            return WorkspacePortKillResult::failed("The port is no longer listening.");
        };
        if !matches!(
            port.classification,
            WorkspacePortClassification::Workspace { .. }
        ) {
            return WorkspacePortKillResult::failed(
                "Only workspace-owned local processes can be stopped here.",
            );
        }
        let Some(pid) = port.pid else {
            return WorkspacePortKillResult::failed("The owning process is unknown.");
        };
        if self.host.runtime_pid() == Some(pid) {
            return WorkspacePortKillResult::failed("AgentStart cannot stop its own process.");
        }
        match self.host.terminate(pid).await {
            Ok(()) => WorkspacePortKillResult::succeeded(),
            Err(error) => {
                let reason = error.to_string();
                WorkspacePortKillResult::failed(if reason.is_empty() {
                    "Failed to stop the process.".to_owned()
                } else {
                    reason
                })
            }
        }
    }

    pub fn bind_pty(&self, pty_id: &str, worktree_id: &str) {
        let candidates = self.advertised_input.bind(pty_id, worktree_id);
        self.observe_candidates(pty_id, candidates, epoch_millis());
    }

    pub fn ingest_pty_output(&self, pty_id: &str, chunk: &str, observed_at: i64) -> usize {
        let candidates = self.advertised_input.ingest(pty_id, chunk);
        self.observe_candidates(pty_id, candidates, observed_at)
    }

    pub fn finish_pty_output(&self, pty_id: &str, observed_at: i64) -> usize {
        let candidates = self.advertised_input.finish(pty_id);
        self.observe_candidates(pty_id, candidates, observed_at)
    }

    pub fn unbind_pty(&self, pty_id: &str) {
        self.advertised_input.unbind(pty_id);
        self.advertised_urls.remove_pty(pty_id);
    }

    pub fn forget_worktree(&self, worktree_id: &str) {
        self.advertised_input.forget_worktree(worktree_id);
        self.advertised_urls.forget_worktree(worktree_id);
    }

    pub fn subscribe(&self, connection_id: Option<&str>) -> WorkspacePortSubscription {
        self.advertised_urls.subscribe(connection_id)
    }

    pub fn close(&self) {
        self.clear();
        self.advertised_urls.close();
    }

    pub(super) fn clear(&self) {
        self.advertised_input.clear();
        self.advertised_urls.clear();
    }

    fn observe_candidates(
        &self,
        pty_id: &str,
        candidates: Vec<ObservedUrl>,
        observed_at: i64,
    ) -> usize {
        candidates
            .into_iter()
            .filter(|candidate| {
                self.advertised_urls.observe(
                    pty_id,
                    &candidate.worktree_id,
                    &candidate.url,
                    observed_at,
                )
            })
            .count()
    }

    fn unavailable_scan(&self, scanned_at: i64, reason: String) -> WorkspacePortScanResult {
        WorkspacePortScanResult {
            platform: self.host.platform(),
            ports: Vec::new(),
            scanned_at,
            unavailable_reason: Some(reason),
        }
    }
}

impl WorkspacePortKillResult {
    fn succeeded() -> Self {
        Self {
            ok: true,
            reason: None,
        }
    }

    fn failed(reason: impl Into<String>) -> Self {
        Self {
            ok: false,
            reason: Some(reason.into()),
        }
    }
}

#[derive(Default)]
struct TimeoutBackoff {
    consecutive_timeouts: u32,
    cooldown_until: i64,
}

impl TimeoutBackoff {
    fn cooldown_remaining(&self, now: i64) -> Option<i64> {
        (self.cooldown_until > now).then_some(self.cooldown_until - now)
    }

    fn record_timeout(&mut self, now: i64) {
        self.consecutive_timeouts = self.consecutive_timeouts.saturating_add(1);
        let exponent = self.consecutive_timeouts.saturating_sub(1).min(3);
        let delay = (INITIAL_TIMEOUT_BACKOFF_MS * 2_i64.pow(exponent)).min(MAX_TIMEOUT_BACKOFF_MS);
        self.cooldown_until = now.saturating_add(delay);
    }

    fn record_success(&mut self) {
        self.consecutive_timeouts = 0;
        self.cooldown_until = 0;
    }
}

fn epoch_millis() -> i64 {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    i64::try_from(millis).unwrap_or(i64::MAX)
}

fn is_safe_integer(value: f64) -> bool {
    value.is_finite() && value.fract() == 0.0 && value.abs() <= MAX_SAFE_INTEGER
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

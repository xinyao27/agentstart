use std::collections::HashSet;
use std::sync::Arc;
use std::time::{Duration, Instant};

use tokio::sync::Semaphore;

const CAPTURE_TIMEOUT: Duration = Duration::from_secs(5);
const MAX_DAEMON_PROCESSES: usize = 8_192;
const MAX_ANCESTOR_DEPTH: usize = 256;

#[derive(Clone)]
pub(super) struct SystemCollector {
    admission: Arc<Semaphore>,
}

pub(super) struct SystemSnapshot {
    pub(super) total_memory: u64,
    pub(super) free_memory: u64,
    pub(super) cpu_core_count: usize,
    pub(super) load_average_1m: f64,
    pub(super) processes: Vec<ProcessSample>,
    pub(super) sampled_at: Instant,
}

#[derive(Clone, Copy)]
pub(super) struct ProcessSample {
    pub(super) pid: u32,
    pub(super) started_at: u64,
    pub(super) memory: u64,
    pub(super) accumulated_cpu_millis: u64,
    pub(super) is_daemon: bool,
}

impl SystemCollector {
    pub(super) fn new() -> Self {
        Self {
            admission: Arc::new(Semaphore::new(1)),
        }
    }

    pub(super) async fn capture(&self) -> Option<SystemSnapshot> {
        let admission = Arc::clone(&self.admission);
        tokio::time::timeout(CAPTURE_TIMEOUT, async move {
            let permit = admission.acquire_owned().await.ok()?;
            tokio::task::spawn_blocking(move || {
                let _permit = permit;
                capture_blocking()
            })
            .await
            .ok()
        })
        .await
        .ok()
        .flatten()
    }
}

fn capture_blocking() -> SystemSnapshot {
    use sysinfo::{CpuRefreshKind, Pid, ProcessRefreshKind, ProcessesToUpdate, System};

    let mut system = System::new();
    system.refresh_memory();
    system.refresh_cpu_list(CpuRefreshKind::nothing());
    system.refresh_processes_specifics(
        ProcessesToUpdate::All,
        true,
        ProcessRefreshKind::nothing()
            .with_memory()
            .with_cpu()
            .without_tasks(),
    );

    let daemon_pid = Pid::from_u32(std::process::id());
    let mut processes = Vec::with_capacity(64);
    let mut seen = HashSet::with_capacity(64);
    if let Some(process) = system.process(daemon_pid) {
        processes.push(process_sample(daemon_pid, process, true));
        seen.insert(daemon_pid);
    }
    for (pid, process) in system.processes() {
        if processes.len() >= MAX_DAEMON_PROCESSES {
            break;
        }
        if *pid == daemon_pid || !is_descendant(&system, *pid, daemon_pid) || !seen.insert(*pid) {
            continue;
        }
        processes.push(process_sample(*pid, process, false));
    }
    processes.sort_unstable_by_key(|process| process.pid);

    let total_memory = system.total_memory();
    SystemSnapshot {
        total_memory,
        free_memory: system.free_memory().min(total_memory),
        cpu_core_count: system.cpus().len().max(available_parallelism()),
        load_average_1m: finite_nonnegative(System::load_average().one),
        processes,
        sampled_at: Instant::now(),
    }
}

fn process_sample(pid: sysinfo::Pid, process: &sysinfo::Process, is_daemon: bool) -> ProcessSample {
    ProcessSample {
        pid: pid.as_u32(),
        started_at: process.start_time(),
        memory: process.memory(),
        accumulated_cpu_millis: process.accumulated_cpu_time(),
        is_daemon,
    }
}

fn is_descendant(system: &sysinfo::System, mut pid: sysinfo::Pid, root: sysinfo::Pid) -> bool {
    for _ in 0..MAX_ANCESTOR_DEPTH {
        let Some(parent) = system.process(pid).and_then(sysinfo::Process::parent) else {
            return false;
        };
        if parent == root {
            return true;
        }
        if parent == pid {
            return false;
        }
        pid = parent;
    }
    false
}

pub(super) fn available_parallelism() -> usize {
    std::thread::available_parallelism().map_or(1, std::num::NonZeroUsize::get)
}

pub(super) fn finite_nonnegative(value: f64) -> f64 {
    if value.is_finite() {
        value.max(0.0)
    } else {
        0.0
    }
}

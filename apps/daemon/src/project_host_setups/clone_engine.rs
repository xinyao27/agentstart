use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;

use tokio::sync::OwnedMutexGuard;

use crate::hosts::ExecutionHost;

use super::{
    ProjectHostSetupAuthority, ProjectHostSetupError, clone_claim, host_effects,
    host_effects::ClonePlan,
};

pub(crate) struct CloneLease {
    host: Arc<dyn ExecutionHost>,
    plan: ClonePlan,
    _path_guard: OwnedMutexGuard<()>,
}

pub(crate) struct CompletedClone {
    claim: clone_claim::CloneClaim,
    claimed: bool,
    cleanup: CloneCleanup,
    host: Arc<dyn ExecutionHost>,
    _path_guard: OwnedMutexGuard<()>,
}

#[derive(Clone)]
pub(super) struct CloneCleanup {
    state: Arc<Mutex<CleanupState>>,
}

#[derive(Default)]
struct CleanupState {
    is_shutting_down: bool,
    tasks: Vec<tokio::task::JoinHandle<()>>,
}

const CLEANUP_SHUTDOWN_WAIT: Duration = Duration::from_secs(10);

impl ProjectHostSetupAuthority {
    pub(crate) async fn acquire_clone(
        &self,
        host_id: &str,
        url: &str,
        destination: &str,
    ) -> Result<CloneLease, ProjectHostSetupError> {
        let host = self.hosts.execution_host(host_id).await?;
        let plan = host_effects::clone_plan(host.clone(), url, destination).await?;
        let path_guard = self.clones.acquire(plan.key.clone()).await;
        Ok(CloneLease {
            host,
            plan,
            _path_guard: path_guard,
        })
    }

    pub(crate) async fn execute_clone(
        &self,
        lease: CloneLease,
        url: &str,
    ) -> Result<CompletedClone, ProjectHostSetupError> {
        let claim = clone_claim::claim(lease.host.clone(), lease.plan.path).await?;
        let completed = CompletedClone {
            claim,
            claimed: true,
            cleanup: self.clone_cleanup.clone(),
            host: lease.host.clone(),
            _path_guard: lease._path_guard,
        };
        let active = self.clones.begin();
        let result = host_effects::clone_into(
            lease.host,
            url,
            &lease.plan.destination,
            &completed.claim,
            active.cancelled(),
            self.progress.clone(),
        )
        .await;
        drop(active);
        if let Err(error) = result {
            completed.cleanup().await;
            return Err(error);
        }
        Ok(completed)
    }
}

impl CloneLease {
    pub(crate) fn path(&self) -> &str {
        &self.plan.path
    }
}

impl CloneCleanup {
    pub(super) fn new() -> Self {
        Self {
            state: Arc::new(Mutex::new(CleanupState::default())),
        }
    }

    pub(super) async fn shutdown(&self) {
        let background_tasks = {
            let mut state = lock(&self.state);
            state.is_shutting_down = true;
            std::mem::take(&mut state.tasks)
        };
        let deadline = tokio::time::Instant::now() + CLEANUP_SHUTDOWN_WAIT;
        let mut tasks = background_tasks.into_iter();
        while let Some(mut task) = tasks.next() {
            if tokio::time::timeout_at(deadline, &mut task).await.is_err() {
                task.abort();
                let _ = task.await;
                for task in tasks {
                    task.abort();
                    let _ = task.await;
                }
                break;
            }
        }
    }

    fn schedule(&self, host: Arc<dyn ExecutionHost>, claim: clone_claim::CloneClaim) {
        let mut state = lock(&self.state);
        if state.is_shutting_down {
            return;
        }
        state.tasks.retain(|task| !task.is_finished());
        if let Ok(runtime) = tokio::runtime::Handle::try_current() {
            state.tasks.push(runtime.spawn(async move {
                clone_claim::cleanup(host, &claim).await;
            }));
        }
    }
}

impl CompletedClone {
    pub(crate) fn path(&self) -> &str {
        &self.claim.path
    }

    pub(crate) async fn cleanup(mut self) {
        clone_claim::cleanup(self.host.clone(), &self.claim).await;
        self.claimed = false;
    }

    pub(crate) fn commit(mut self) {
        self.claimed = false;
    }
}

impl Drop for CompletedClone {
    fn drop(&mut self) {
        if !self.claimed {
            return;
        }
        let host = self.host.clone();
        let claim = self.claim.clone();
        self.cleanup.schedule(host, claim);
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

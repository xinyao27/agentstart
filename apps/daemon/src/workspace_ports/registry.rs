use std::collections::HashMap;
use std::sync::{Arc, Mutex, MutexGuard, Weak};

use tokio::sync::broadcast::error::RecvError;
use tokio::task::JoinHandle;

use crate::host_registry::{HostRegistry, HostRegistryError};
use crate::hosts::{ExecutionHost, HostWorkspacePorts};

use super::subscription::EventAuthority;
use super::{WorkspacePortSubscription, WorkspacePorts};

#[derive(Clone)]
pub(crate) struct WorkspacePortsRegistry {
    inner: Arc<RegistryInner>,
}

struct RegistryInner {
    events: EventAuthority,
    hosts: HostRegistry,
    removal_task: Mutex<Option<JoinHandle<()>>>,
    state: Mutex<RegistryState>,
}

#[derive(Default)]
struct RegistryState {
    ports: HashMap<String, HostPorts>,
    pty_bindings: HashMap<String, PtyBinding>,
}

struct HostPorts {
    host: Arc<dyn ExecutionHost>,
    ports: WorkspacePorts,
}

#[derive(Clone, Eq, PartialEq)]
struct PtyBinding {
    host_id: String,
    worktree_id: String,
}

impl WorkspacePortsRegistry {
    pub(crate) fn new(hosts: HostRegistry) -> Self {
        let mut removals = hosts.subscribe_removals();
        let inner = Arc::new(RegistryInner {
            events: EventAuthority::new(),
            hosts,
            removal_task: Mutex::new(None),
            state: Mutex::new(RegistryState::default()),
        });
        let registry = Self {
            inner: inner.clone(),
        };
        let weak = Arc::downgrade(&inner);
        *lock(&inner.removal_task) = Some(tokio::spawn(async move {
            watch_host_removals(weak, &mut removals).await;
        }));
        registry
    }

    pub(crate) async fn for_host(
        &self,
        host_id: &str,
    ) -> Result<WorkspacePorts, HostRegistryError> {
        loop {
            let host = self.inner.hosts.execution_host(host_id).await?;
            let ports = {
                let mut state = lock(&self.inner.state);
                if let Some(existing) = state.ports.get(host_id)
                    && Arc::ptr_eq(&existing.host, &host)
                {
                    return Ok(existing.ports.clone());
                }
                if let Some(stale) = state.ports.remove(host_id) {
                    stale.ports.clear();
                    clear_pty_bindings_for_host(&mut state, host_id);
                }
                let ports = WorkspacePorts::with_events(
                    Arc::new(HostWorkspacePorts::new(host.clone())),
                    self.inner.events.clone(),
                );
                state.ports.insert(
                    host_id.to_owned(),
                    HostPorts {
                        host: host.clone(),
                        ports: ports.clone(),
                    },
                );
                ports
            };
            match self.inner.hosts.execution_host(host_id).await {
                Ok(current) if Arc::ptr_eq(&current, &host) => return Ok(ports),
                Ok(_) => clear_host_if_current(&self.inner.state, host_id, &host),
                Err(error) => {
                    clear_host_if_current(&self.inner.state, host_id, &host);
                    return Err(error);
                }
            }
        }
    }

    pub(crate) async fn bind_pty(&self, host_id: &str, pty_id: &str, worktree_id: &str) {
        if self.for_host(host_id).await.is_err() {
            return;
        }
        let next = PtyBinding {
            host_id: host_id.to_owned(),
            worktree_id: worktree_id.to_owned(),
        };
        let (ports, previous, previous_ports) = {
            let mut state = lock(&self.inner.state);
            let Some(ports) = state.ports.get(host_id).map(|entry| entry.ports.clone()) else {
                return;
            };
            let previous = state.pty_bindings.insert(pty_id.to_owned(), next.clone());
            let previous_ports = previous.as_ref().and_then(|previous| {
                state
                    .ports
                    .get(&previous.host_id)
                    .map(|entry| entry.ports.clone())
            });
            (ports, previous, previous_ports)
        };
        if previous.as_ref().is_some_and(|previous| previous != &next)
            && let Some(previous_ports) = previous_ports
        {
            previous_ports.unbind_pty(pty_id);
        }
        ports.bind_pty(pty_id, worktree_id);
    }

    pub(crate) fn ingest_pty_output(&self, pty_id: &str, bytes: &[u8], observed_at: i64) -> usize {
        let ports = {
            let state = lock(&self.inner.state);
            let Some(binding) = state.pty_bindings.get(pty_id) else {
                return 0;
            };
            let Some(ports) = state
                .ports
                .get(&binding.host_id)
                .map(|entry| entry.ports.clone())
            else {
                return 0;
            };
            ports
        };
        let chunk = String::from_utf8_lossy(bytes);
        ports.ingest_pty_output(pty_id, chunk.as_ref(), observed_at)
    }

    pub(crate) fn finish_pty_output(&self, pty_id: &str, observed_at: i64) -> usize {
        let ports = {
            let state = lock(&self.inner.state);
            let Some(binding) = state.pty_bindings.get(pty_id) else {
                return 0;
            };
            let Some(ports) = state
                .ports
                .get(&binding.host_id)
                .map(|entry| entry.ports.clone())
            else {
                return 0;
            };
            ports
        };
        ports.finish_pty_output(pty_id, observed_at)
    }

    pub(crate) fn unbind_pty(&self, pty_id: &str) {
        let ports = {
            let mut state = lock(&self.inner.state);
            let Some(binding) = state.pty_bindings.remove(pty_id) else {
                return;
            };
            state
                .ports
                .get(&binding.host_id)
                .map(|entry| entry.ports.clone())
        };
        if let Some(ports) = ports {
            ports.unbind_pty(pty_id);
        }
    }

    pub(crate) fn forget_worktree(&self, host_id: &str, worktree_id: &str) {
        let ports = {
            let mut state = lock(&self.inner.state);
            state.pty_bindings.retain(|_, binding| {
                binding.host_id != host_id || binding.worktree_id != worktree_id
            });
            state.ports.get(host_id).map(|entry| entry.ports.clone())
        };
        if let Some(ports) = ports {
            ports.forget_worktree(worktree_id);
        }
    }

    pub(crate) fn subscribe(&self, connection_id: Option<&str>) -> WorkspacePortSubscription {
        self.inner.events.subscribe(connection_id)
    }

    pub(crate) fn close(&self) {
        if let Some(task) = lock(&self.inner.removal_task).take() {
            task.abort();
        }
        clear_ports(&self.inner.state);
        self.inner.events.close();
    }
}

impl Drop for RegistryInner {
    fn drop(&mut self) {
        if let Some(task) = lock(&self.removal_task).take() {
            task.abort();
        }
    }
}

async fn watch_host_removals(
    inner: Weak<RegistryInner>,
    removals: &mut tokio::sync::broadcast::Receiver<String>,
) {
    loop {
        match removals.recv().await {
            Ok(host_id) => {
                let Some(inner) = inner.upgrade() else {
                    return;
                };
                let mut state = lock(&inner.state);
                if let Some(entry) = state.ports.remove(&host_id) {
                    entry.ports.clear();
                }
                clear_pty_bindings_for_host(&mut state, &host_id);
            }
            Err(RecvError::Lagged(_)) => {
                let Some(inner) = inner.upgrade() else {
                    return;
                };
                clear_ports(&inner.state);
            }
            Err(RecvError::Closed) => return,
        }
    }
}

fn clear_ports(state: &Mutex<RegistryState>) {
    let mut state = lock(state);
    for entry in state.ports.drain().map(|(_, entry)| entry) {
        entry.ports.clear();
    }
    state.pty_bindings.clear();
}

fn clear_host_if_current(
    state: &Mutex<RegistryState>,
    host_id: &str,
    host: &Arc<dyn ExecutionHost>,
) {
    let mut state = lock(state);
    let is_current = state
        .ports
        .get(host_id)
        .is_some_and(|entry| Arc::ptr_eq(&entry.host, host));
    if is_current && let Some(entry) = state.ports.remove(host_id) {
        entry.ports.clear();
        clear_pty_bindings_for_host(&mut state, host_id);
    }
}

fn clear_pty_bindings_for_host(state: &mut RegistryState, host_id: &str) {
    state
        .pty_bindings
        .retain(|_, binding| binding.host_id != host_id);
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

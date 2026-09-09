use std::collections::HashMap;
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{SystemTime, UNIX_EPOCH};

use thiserror::Error;
use tokio::sync::broadcast;

use crate::hosts::{
    ExecutionHost, HostKind, HostPlatform, LocalHost, SshControlDirectory, SshHost, SshHostError,
    WslHost, WslHostError,
};
use crate::persistence::host_store::{HostRecord, HostStore, HostStoreError, RegisteredHostKind};

use super::capabilities::HostCapabilityCache;
use super::{
    HostAddInput, HostAddResult, HostDescriptor, HostListResult, HostProbeResult, HostRemoveResult,
    RegistryHostKind, SystemHostCapabilities,
};

#[derive(Clone)]
pub(crate) struct HostRegistry {
    inner: Arc<RegistryInner>,
}

struct RegistryInner {
    adapters: Mutex<HashMap<String, Arc<dyn ExecutionHost>>>,
    capabilities: HostCapabilityCache,
    local: Arc<dyn ExecutionHost>,
    removals: broadcast::Sender<String>,
    ssh_controls: SshControlDirectory,
    store: HostStore,
    system: SystemHostCapabilities,
}

#[derive(Debug, Error)]
pub(crate) enum HostRegistryError {
    #[error("host_remove_local_forbidden")]
    LocalRemoveForbidden,
    #[error(transparent)]
    Ssh(#[from] SshHostError),
    #[error(transparent)]
    Store(#[from] HostStoreError),
    #[error("host registry clock failed: {0}")]
    Time(#[from] std::time::SystemTimeError),
    #[error(transparent)]
    Wsl(#[from] WslHostError),
}

impl HostRegistry {
    pub(crate) fn new(store: HostStore, user_data_path: &std::path::Path) -> Self {
        let local: Arc<dyn ExecutionHost> = Arc::new(LocalHost::new());
        let (removals, _) = broadcast::channel(64);
        Self {
            inner: Arc::new(RegistryInner {
                adapters: Mutex::new(HashMap::new()),
                capabilities: HostCapabilityCache::new(),
                local: local.clone(),
                removals,
                ssh_controls: SshControlDirectory::open(user_data_path),
                store,
                system: SystemHostCapabilities::new(local),
            }),
        }
    }

    pub(crate) fn system_capabilities(&self) -> SystemHostCapabilities {
        self.inner.system.clone()
    }

    pub(crate) async fn list(&self) -> Result<HostListResult, HostRegistryError> {
        let snapshot = self.inner.store.snapshot().await?;
        let mut hosts = Vec::with_capacity(snapshot.hosts.len() + 1);
        hosts.push(describe(self.inner.local.as_ref()));
        hosts.extend(snapshot.hosts.into_iter().map(describe_record));
        Ok(HostListResult {
            hosts,
            revision: snapshot.revision,
        })
    }

    pub(crate) async fn add(
        &self,
        input: HostAddInput,
    ) -> Result<HostAddResult, HostRegistryError> {
        let adapter = build(
            input.kind,
            input.label,
            input.target,
            &self.inner.ssh_controls,
        )?;
        let host = HostRecord {
            created_at: epoch_millis()?,
            id: adapter.id().to_owned(),
            kind: registered_kind(input.kind),
            label: adapter.label().to_owned(),
            platform: platform_name(adapter.platform()).to_owned(),
            target: adapter.target().unwrap_or_default().to_owned(),
        };
        let mutation = self
            .inner
            .store
            .add(input.expected_revision, host.clone())
            .await?;
        self.inner.capabilities.invalidate(&host.id);
        self.remember(adapter);
        Ok(HostAddResult {
            host: describe_record(host),
            revision: mutation.revision,
        })
    }

    pub(crate) async fn probe(
        &self,
        host_id: String,
    ) -> Result<HostProbeResult, HostRegistryError> {
        let adapter = self.execution_host(&host_id).await?;
        let host = describe(adapter.as_ref());
        let capabilities = self.inner.capabilities.probe(adapter).await;
        Ok(HostProbeResult { capabilities, host })
    }

    pub(crate) async fn remove(
        &self,
        host_id: String,
        expected_revision: i64,
    ) -> Result<HostRemoveResult, HostRegistryError> {
        if host_id == "local" {
            return Err(HostRegistryError::LocalRemoveForbidden);
        }
        let mutation = self
            .inner
            .store
            .remove(expected_revision, host_id.clone())
            .await?;
        lock(&self.inner.adapters).remove(&host_id);
        self.inner.capabilities.invalidate(&host_id);
        drop(self.inner.removals.send(host_id));
        Ok(HostRemoveResult {
            removed: true,
            revision: mutation.revision,
        })
    }

    pub(crate) fn subscribe_removals(&self) -> broadcast::Receiver<String> {
        self.inner.removals.subscribe()
    }

    pub(crate) async fn execution_host(
        &self,
        host_id: &str,
    ) -> Result<Arc<dyn ExecutionHost>, HostRegistryError> {
        if host_id == "local" {
            return Ok(self.inner.local.clone());
        }
        if let Some(adapter) = lock(&self.inner.adapters).get(host_id).cloned() {
            return Ok(adapter);
        }
        let stored = self.inner.store.find(host_id.to_owned()).await?;
        let adapter = build(
            registry_kind(stored.kind),
            stored.label,
            stored.target,
            &self.inner.ssh_controls,
        )?;
        let mut adapters = lock(&self.inner.adapters);
        Ok(adapters
            .entry(host_id.to_owned())
            .or_insert_with(|| adapter.clone())
            .clone())
    }

    fn remember(&self, adapter: Arc<dyn ExecutionHost>) {
        lock(&self.inner.adapters).insert(adapter.id().to_owned(), adapter);
    }
}

fn build(
    kind: RegistryHostKind,
    label: String,
    target: String,
    ssh_controls: &SshControlDirectory,
) -> Result<Arc<dyn ExecutionHost>, HostRegistryError> {
    match kind {
        RegistryHostKind::Ssh => Ok(Arc::new(SshHost::new(label, target, ssh_controls)?)),
        RegistryHostKind::Wsl => Ok(Arc::new(WslHost::new(label, target)?)),
    }
}

fn describe(host: &dyn ExecutionHost) -> HostDescriptor {
    HostDescriptor {
        id: host.id().to_owned(),
        kind: kind_name(host.kind()).to_owned(),
        label: host.label().to_owned(),
        platform: platform_name(host.platform()).to_owned(),
        target: host.target().map(str::to_owned),
    }
}

fn describe_record(host: HostRecord) -> HostDescriptor {
    HostDescriptor {
        id: host.id,
        kind: host.kind.as_str().to_owned(),
        label: host.label,
        platform: host.platform,
        target: Some(host.target),
    }
}

fn kind_name(kind: HostKind) -> &'static str {
    match kind {
        HostKind::Local => "local",
        HostKind::Ssh => "ssh",
        HostKind::Wsl => "wsl",
    }
}

pub(crate) fn platform_name(platform: HostPlatform) -> &'static str {
    match platform {
        HostPlatform::Darwin => "darwin",
        HostPlatform::Linux => "linux",
        HostPlatform::Unknown => "unknown",
        HostPlatform::Windows => "win32",
    }
}

fn registered_kind(kind: RegistryHostKind) -> RegisteredHostKind {
    match kind {
        RegistryHostKind::Ssh => RegisteredHostKind::Ssh,
        RegistryHostKind::Wsl => RegisteredHostKind::Wsl,
    }
}

fn registry_kind(kind: RegisteredHostKind) -> RegistryHostKind {
    match kind {
        RegisteredHostKind::Ssh => RegistryHostKind::Ssh,
        RegisteredHostKind::Wsl => RegistryHostKind::Wsl,
    }
}

fn epoch_millis() -> Result<i64, HostRegistryError> {
    let millis = SystemTime::now().duration_since(UNIX_EPOCH)?.as_millis();
    Ok(i64::try_from(millis).unwrap_or(i64::MAX))
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

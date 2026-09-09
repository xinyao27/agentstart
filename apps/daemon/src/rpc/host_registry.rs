// Why: the legacy `host.wsl`/`host.gitBash`/`host.pwsh` JSON probes are
// retired; the protobuf `HostRegistryService` mounts remain, backed by the same
// system capability probe.
mod protocol;

use crate::host_registry::{HostRegistry, SystemHostCapabilities};

#[derive(Clone)]
pub(super) struct HostRegistryRpc {
    registry: HostRegistry,
    system: SystemHostCapabilities,
}

impl HostRegistryRpc {
    pub(super) fn new(registry: HostRegistry) -> Self {
        let system = registry.system_capabilities();
        Self { registry, system }
    }

    pub(super) async fn protocol_list(
        &self,
        payload: &[u8],
    ) -> Result<Vec<u8>, yiru_protocol::protocol::v1::Status> {
        protocol::list(&self.registry, payload).await
    }

    pub(super) async fn protocol_add(
        &self,
        payload: &[u8],
    ) -> Result<Vec<u8>, yiru_protocol::protocol::v1::Status> {
        protocol::add(&self.registry, payload).await
    }

    pub(super) async fn protocol_probe(
        &self,
        payload: &[u8],
    ) -> Result<Vec<u8>, yiru_protocol::protocol::v1::Status> {
        protocol::probe(&self.registry, payload).await
    }

    pub(super) async fn protocol_remove(
        &self,
        payload: &[u8],
    ) -> Result<Vec<u8>, yiru_protocol::protocol::v1::Status> {
        protocol::remove(&self.registry, payload).await
    }

    pub(super) async fn protocol_is_wsl_available(
        &self,
        payload: &[u8],
    ) -> Result<Vec<u8>, yiru_protocol::protocol::v1::Status> {
        protocol::is_wsl_available(&self.system, payload).await
    }

    pub(super) async fn protocol_list_wsl_distros(
        &self,
        payload: &[u8],
    ) -> Result<Vec<u8>, yiru_protocol::protocol::v1::Status> {
        protocol::list_wsl_distros(&self.system, payload).await
    }

    pub(super) async fn protocol_is_git_bash_available(
        &self,
        payload: &[u8],
    ) -> Result<Vec<u8>, yiru_protocol::protocol::v1::Status> {
        protocol::is_git_bash_available(&self.system, payload).await
    }

    pub(super) async fn protocol_is_pwsh_available(
        &self,
        payload: &[u8],
    ) -> Result<Vec<u8>, yiru_protocol::protocol::v1::Status> {
        protocol::is_pwsh_available(&self.system, payload).await
    }
}

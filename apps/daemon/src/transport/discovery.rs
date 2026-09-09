use std::path::{Path, PathBuf};

use crate::native_messaging::{
    BootstrapError, PublishedExtensionBootstrap, RPC_PROTOCOL, clear_bootstrap_if_owned,
    write_bootstrap,
};
use crate::runtime::RuntimeIdentity;
use crate::runtime_metadata::{
    self, PublishedRuntimeMetadata, PublishedRuntimeTransport, RuntimeMetadataError,
};
use yiru_protocol::CURRENT_PROTOCOL_VERSION;

pub struct ExtensionDiscovery {
    is_published: bool,
    pid: u32,
    runtime_id: String,
    user_data_path: PathBuf,
}

#[derive(Debug, thiserror::Error)]
#[error("extension discovery {operation} failed: {source}")]
pub struct ExtensionDiscoveryError {
    operation: &'static str,
    #[source]
    source: Box<dyn std::error::Error + Send + Sync>,
}

impl From<BootstrapError> for ExtensionDiscoveryError {
    fn from(source: BootstrapError) -> Self {
        Self {
            operation: "bootstrap",
            source: Box::new(source),
        }
    }
}

impl From<RuntimeMetadataError> for ExtensionDiscoveryError {
    fn from(source: RuntimeMetadataError) -> Self {
        Self {
            operation: "metadata",
            source: Box::new(source),
        }
    }
}

impl ExtensionDiscovery {
    pub fn publish(
        user_data_path: &Path,
        identity: &RuntimeIdentity,
        auth_token: &str,
        extension_endpoint: &str,
        mobile_endpoint: &str,
    ) -> Result<Self, ExtensionDiscoveryError> {
        let pid = std::process::id();
        let runtime_id = identity.runtime_id();
        write_bootstrap(
            user_data_path,
            pid,
            &PublishedExtensionBootstrap {
                auth_token,
                endpoint: extension_endpoint,
                protocol_version: CURRENT_PROTOCOL_VERSION,
                rpc_protocol: RPC_PROTOCOL,
                runtime_id,
            },
        )?;
        let metadata_result = runtime_metadata::write(
            user_data_path,
            &PublishedRuntimeMetadata {
                auth_token: Some(auth_token),
                pid,
                runtime_id,
                started_at: identity.started_at(),
                transports: vec![
                    PublishedRuntimeTransport {
                        endpoint: extension_endpoint,
                        kind: "websocket",
                    },
                    PublishedRuntimeTransport {
                        endpoint: mobile_endpoint,
                        kind: "websocket",
                    },
                ],
            },
        );
        if let Err(error) = metadata_result {
            clear_bootstrap_if_owned(user_data_path, pid, runtime_id)?;
            return Err(error.into());
        }
        Ok(Self {
            is_published: true,
            pid,
            runtime_id: runtime_id.to_owned(),
            user_data_path: user_data_path.to_owned(),
        })
    }

    pub fn clear(mut self) -> Result<(), ExtensionDiscoveryError> {
        let result = self.clear_inner();
        if result.is_ok() {
            self.is_published = false;
        }
        result
    }

    fn clear_inner(&self) -> Result<(), ExtensionDiscoveryError> {
        let bootstrap_result =
            clear_bootstrap_if_owned(&self.user_data_path, self.pid, &self.runtime_id);
        let metadata_result =
            runtime_metadata::clear_if_owned(&self.user_data_path, self.pid, &self.runtime_id);
        bootstrap_result?;
        metadata_result?;
        Ok(())
    }
}

impl Drop for ExtensionDiscovery {
    fn drop(&mut self) {
        if self.is_published {
            let _ = self.clear_inner();
        }
    }
}

mod local;
mod model;
mod path;
mod remote;

use std::sync::Arc;

use crate::hosts::{ExecutionHost, HostKind};

pub use model::{
    HostDirectoryEntry, HostFileKind, HostFileStat, HostFilesystemError, HostFilesystemErrorKind,
    HostRemoveOptions,
};
pub use path::HostPaths;

#[derive(Clone)]
pub struct HostFilesystem {
    host: Arc<dyn ExecutionHost>,
    paths: HostPaths,
}

impl HostFilesystem {
    pub fn new(host: Arc<dyn ExecutionHost>) -> Self {
        Self {
            paths: HostPaths::for_host(host.kind(), host.platform()),
            host,
        }
    }

    pub fn paths(&self) -> HostPaths {
        self.paths
    }

    pub async fn append(&self, path: &str, content: &[u8]) -> Result<(), HostFilesystemError> {
        if self.is_local() {
            local::append(path, content).await
        } else {
            remote::append(self.host.as_ref(), path, content).await
        }
    }

    pub async fn canonical_directory(&self, path: &str) -> Result<String, HostFilesystemError> {
        if self.is_local() {
            local::canonical_directory(path).await
        } else {
            remote::canonical_directory(self.host.as_ref(), path).await
        }
    }

    pub async fn exists(&self, path: &str) -> Result<bool, HostFilesystemError> {
        if self.is_local() {
            local::exists(path).await
        } else {
            remote::exists(self.host.as_ref(), path).await
        }
    }

    pub async fn home_directory(&self) -> Result<Option<String>, HostFilesystemError> {
        if self.is_local() {
            Ok(local::home_directory())
        } else {
            remote::home_directory(self.host.as_ref()).await
        }
    }

    pub async fn mkdir(&self, path: &str, recursive: bool) -> Result<(), HostFilesystemError> {
        if self.is_local() {
            local::mkdir(path, recursive).await
        } else {
            remote::mkdir(self.host.as_ref(), path, recursive).await
        }
    }

    pub async fn read(
        &self,
        path: &str,
        max_bytes: usize,
    ) -> Result<Option<Vec<u8>>, HostFilesystemError> {
        if self.is_local() {
            local::read(path, max_bytes).await
        } else {
            remote::read(self.host.as_ref(), path, max_bytes).await
        }
    }

    pub async fn read_prefix(
        &self,
        path: &str,
        max_bytes: usize,
    ) -> Result<Option<Vec<u8>>, HostFilesystemError> {
        if self.is_local() {
            local::read_prefix(path, max_bytes).await
        } else {
            remote::read_prefix(self.host.as_ref(), path, max_bytes).await
        }
    }

    /// Read at most `max_bytes` starting at byte `start`, so an append-only
    /// transcript can be resumed without re-reading what was already parsed.
    pub async fn read_range(
        &self,
        path: &str,
        start: u64,
        max_bytes: usize,
    ) -> Result<Option<Vec<u8>>, HostFilesystemError> {
        if self.is_local() {
            local::read_range(path, start, max_bytes).await
        } else {
            remote::read_range(self.host.as_ref(), path, start, max_bytes).await
        }
    }

    pub async fn read_text(
        &self,
        path: &str,
        max_bytes: usize,
    ) -> Result<Option<String>, HostFilesystemError> {
        Ok(self
            .read(path, max_bytes)
            .await?
            .map(|content| String::from_utf8_lossy(&content).into_owned()))
    }

    pub async fn read_dir(
        &self,
        path: &str,
    ) -> Result<Vec<HostDirectoryEntry>, HostFilesystemError> {
        if self.is_local() {
            local::read_dir(path).await
        } else {
            remote::read_dir(self.host.as_ref(), path).await
        }
    }

    pub async fn read_dir_raw(
        &self,
        path: &str,
    ) -> Result<Vec<HostDirectoryEntry>, HostFilesystemError> {
        if self.is_local() {
            local::read_dir_raw(path).await
        } else {
            remote::read_dir_raw(self.host.as_ref(), path).await
        }
    }

    pub async fn remove(
        &self,
        path: &str,
        options: HostRemoveOptions,
    ) -> Result<(), HostFilesystemError> {
        if self.paths.is_unsafe_removal(path) {
            return Err(HostFilesystemError::new(
                HostFilesystemErrorKind::InvalidPath,
                "host_remove_path_invalid",
            ));
        }
        if self.is_local() {
            local::remove(path, options).await
        } else {
            remote::remove(self.host.as_ref(), path, options).await
        }
    }

    pub async fn rename(&self, from: &str, to: &str) -> Result<(), HostFilesystemError> {
        if self.is_local() {
            local::rename(from, to).await
        } else {
            remote::rename(self.host.as_ref(), from, to).await
        }
    }

    pub async fn stat(&self, path: &str) -> Result<Option<HostFileStat>, HostFilesystemError> {
        if self.is_local() {
            local::stat(path).await
        } else {
            remote::stat(self.host.as_ref(), path).await
        }
    }

    pub async fn which(&self, command: &str) -> Result<Option<String>, HostFilesystemError> {
        if self.is_local() {
            local::which(command).await
        } else {
            remote::which(self.host.as_ref(), command).await
        }
    }

    pub async fn write(&self, path: &str, content: &[u8]) -> Result<(), HostFilesystemError> {
        if self.is_local() {
            local::write(path, content).await
        } else {
            remote::write(self.host.as_ref(), path, content).await
        }
    }

    fn is_local(&self) -> bool {
        self.host.kind() == HostKind::Local
    }
}

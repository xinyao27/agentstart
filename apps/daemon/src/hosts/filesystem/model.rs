use thiserror::Error;

use crate::hosts::HostCommandError;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum HostFileKind {
    Directory,
    File,
    Other,
    Symlink,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct HostFileStat {
    pub kind: HostFileKind,
    pub modified_at_ms: Option<i64>,
    pub size_bytes: u64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct HostDirectoryEntry {
    pub kind: HostFileKind,
    pub name: String,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum HostFilesystemErrorKind {
    Command,
    InvalidPath,
    Io,
    NotDirectory,
    Protocol,
}

#[derive(Debug, Error)]
#[error("{message}")]
pub struct HostFilesystemError {
    kind: HostFilesystemErrorKind,
    message: String,
}

impl HostFilesystemError {
    pub fn kind(&self) -> HostFilesystemErrorKind {
        self.kind
    }

    pub(super) fn new(kind: HostFilesystemErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }

    pub(super) fn io(operation: &str, path: &str, error: &std::io::Error) -> Self {
        Self::new(
            HostFilesystemErrorKind::Io,
            format!("failed to {operation} {path}: {error}"),
        )
    }
}

impl From<HostCommandError> for HostFilesystemError {
    fn from(error: HostCommandError) -> Self {
        Self::new(HostFilesystemErrorKind::Command, error.to_string())
    }
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct HostRemoveOptions {
    pub force: bool,
    pub recursive: bool,
}

mod copy;
mod delete;
mod dropped_paths;
mod entries;
mod external_import;
mod metadata;
mod read;
mod write;

use thiserror::Error;

use crate::hosts::{HostCommandError, HostFilesystemError};
use crate::workspace_paths::{WorkspacePathAuthority, WorkspacePathError};

pub(crate) use dropped_paths::resolve as resolve_dropped_paths;
pub(crate) use dropped_paths::{DroppedPathFailure, DroppedPathSkip, ResolveDroppedPathsResult};
pub(crate) use external_import::{
    ImportSkipReason, StageExternalPathsResult, StagedExternalImportEntry,
    StagedExternalImportSource, StagedSourceKind,
};

#[derive(Clone)]
pub(crate) struct ShellFiles {
    authority: WorkspacePathAuthority,
}

// Why: `content` carries the exact bytes for whichever of the three legacy
// read shapes applies (utf8 text, an image/PDF preview, or an unpreviewable
// binary with no bytes) so the protobuf transport can hand them over as
// `bytes` instead of base64-in-JSON.
#[derive(Debug)]
pub(crate) struct FileReadResult {
    pub(crate) content: Vec<u8>,
    pub(crate) is_binary: bool,
    pub(crate) is_image: Option<bool>,
    pub(crate) mime_type: Option<&'static str>,
    pub(crate) file_identity: Option<String>,
}

#[derive(Debug)]
pub(crate) struct FileReadChunkResult {
    pub(crate) bytes_read: usize,
    pub(crate) content: Vec<u8>,
    pub(crate) eof: bool,
}

#[derive(Debug)]
pub(crate) struct FileStatResult {
    pub(crate) is_directory: bool,
    pub(crate) mtime: f64,
    pub(crate) size: u64,
}

#[derive(Debug, Error)]
pub(crate) enum ShellFileError {
    #[error("shell file operation cannot cross execution hosts")]
    CrossHost,
    #[error(transparent)]
    Filesystem(#[from] HostFilesystemError),
    #[error(transparent)]
    Host(#[from] HostCommandError),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error("{0}")]
    Operation(String),
    #[error(transparent)]
    WorkspacePath(#[from] WorkspacePathError),
}

impl ShellFiles {
    pub(crate) fn new(authority: WorkspacePathAuthority) -> Self {
        Self { authority }
    }

    pub(crate) async fn authorize_external(&self, target_path: &str) -> Result<(), ShellFileError> {
        self.authority.authorize_external(target_path).await?;
        Ok(())
    }
}

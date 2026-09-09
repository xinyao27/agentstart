pub(super) mod protocol;
mod protocol_values;

use crate::shell_files::ShellFiles;
use crate::workspace_paths::WorkspacePathAuthority;

#[derive(Clone)]
pub(super) struct ShellFilesRpc {
    files: ShellFiles,
}

impl ShellFilesRpc {
    pub(super) fn new(authority: WorkspacePathAuthority) -> Self {
        Self {
            files: ShellFiles::new(authority),
        }
    }

    pub(super) fn files(&self) -> &ShellFiles {
        &self.files
    }
}

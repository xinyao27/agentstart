pub(super) mod protocol;

use crate::git::{GitAuthority, GitCommandTrace};
use crate::host_registry::HostRegistry;
use crate::projects::ProjectCatalog;
use crate::settings::SettingsAuthority;
use crate::worktrees::WorktreeCatalog;

// The git.* namespace is served entirely over protobuf (see src/rpc/git/protocol/).
#[derive(Clone)]
pub(super) struct GitRpc {
    git: GitAuthority,
}

impl GitRpc {
    pub(super) fn new(
        projects: ProjectCatalog,
        worktrees: WorktreeCatalog,
        hosts: HostRegistry,
        settings: SettingsAuthority,
        command_trace: GitCommandTrace,
    ) -> Self {
        Self {
            git: GitAuthority::new(projects, worktrees, hosts, settings, command_trace),
        }
    }
}

use crate::workspace_ports::WorkspacePortProbe;

#[derive(Clone, Debug)]
pub(super) struct WorktreeGraphEntry {
    pub(super) branch: String,
    pub(super) display_name: String,
    pub(super) host_id: String,
    pub(super) path: String,
    pub(super) project_id: String,
    pub(super) selector_display_name: Option<String>,
    pub(super) worktree_id: String,
}

pub(super) fn workspace_port_probes(
    entries: impl IntoIterator<Item = WorktreeGraphEntry>,
) -> Vec<WorkspacePortProbe> {
    entries
        .into_iter()
        .map(|entry| WorkspacePortProbe {
            display_name: entry.display_name,
            host_id: entry.host_id,
            path: entry.path,
            repo_id: entry.project_id,
            worktree_id: entry.worktree_id,
        })
        .collect()
}

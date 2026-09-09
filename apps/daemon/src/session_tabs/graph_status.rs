use std::collections::HashSet;

use super::SessionTabsAuthority;
use super::authority::lock;

pub(crate) struct SessionTabsGraphStatus {
    pub(crate) is_reloading: bool,
    pub(crate) live_leaf_count: usize,
    pub(crate) live_tab_count: usize,
    pub(crate) renderer_graph_epoch: u64,
}

impl SessionTabsAuthority {
    pub(crate) fn graph_status(&self) -> SessionTabsGraphStatus {
        let state = lock(&self.inner.state);
        let is_reloading = state.needs_resync;
        let renderer_graph_epoch = state.revision;
        drop(state);
        let bindings = self.inner.terminals.headless_bindings();
        let live_tab_count = bindings
            .iter()
            .map(|binding| {
                (
                    binding.host_id.as_deref(),
                    binding.worktree_id.as_str(),
                    binding.tab_id.as_str(),
                )
            })
            .collect::<HashSet<_>>()
            .len();
        SessionTabsGraphStatus {
            is_reloading,
            live_leaf_count: bindings.len(),
            live_tab_count,
            renderer_graph_epoch,
        }
    }
}

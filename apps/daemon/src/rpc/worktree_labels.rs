use crate::worktree_labels::WorktreeLabelAuthority;

pub(super) mod protocol;

#[derive(Clone)]
pub(super) struct WorktreeLabelsRpc {
    labels: WorktreeLabelAuthority,
}

impl WorktreeLabelsRpc {
    pub(super) fn new(labels: WorktreeLabelAuthority) -> Self {
        Self { labels }
    }
}

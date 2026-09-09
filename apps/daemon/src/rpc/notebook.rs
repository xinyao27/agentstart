pub(in crate::rpc) mod protocol;

use crate::notebook::NotebookRunner;

#[derive(Clone)]
pub(super) struct NotebookRpc {
    pub(super) runner: NotebookRunner,
}

impl NotebookRpc {
    pub(super) fn new(runner: NotebookRunner) -> Self {
        Self { runner }
    }
}

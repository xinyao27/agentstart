pub(super) mod protocol;

use crate::persistence::{BrowserReplayStore, WorkspaceJournal};

#[derive(Clone)]
pub(crate) struct BrowserReplayRpc {
    journal: WorkspaceJournal,
    store: BrowserReplayStore,
}

impl BrowserReplayRpc {
    pub(crate) fn new(store: BrowserReplayStore, journal: WorkspaceJournal) -> Self {
        Self { journal, store }
    }
}

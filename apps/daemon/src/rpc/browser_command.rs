pub(super) mod protocol;

use crate::persistence::WorkspaceJournal;

pub(super) const EVENT_KIND: &str = "browser.open-tab.requested";
pub(super) const EVENT_SCOPE: &str = "daemon";

#[derive(Clone)]
pub(super) struct BrowserCommandRpc {
    journal: WorkspaceJournal,
}

impl BrowserCommandRpc {
    pub(super) fn new(journal: WorkspaceJournal) -> Self {
        Self { journal }
    }
}

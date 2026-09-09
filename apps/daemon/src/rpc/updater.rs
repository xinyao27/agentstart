use crate::updater::DaemonUpdater;

pub(super) mod protocol;

#[derive(Clone)]
pub(super) struct UpdaterRpc {
    updater: DaemonUpdater,
}

impl UpdaterRpc {
    pub(super) fn new(updater: DaemonUpdater) -> Self {
        Self { updater }
    }
}

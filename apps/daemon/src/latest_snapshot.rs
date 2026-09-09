use std::sync::{Arc, Mutex, MutexGuard};

pub(crate) struct VersionedSnapshot<T> {
    pub(crate) revision: u64,
    pub(crate) value: T,
}

pub(crate) struct LatestSnapshot<T> {
    state: Arc<Mutex<State<T>>>,
}

struct State<T> {
    pending: Option<VersionedSnapshot<T>>,
    scheduled_revision: u64,
}

impl<T> Clone for LatestSnapshot<T> {
    fn clone(&self) -> Self {
        Self {
            state: self.state.clone(),
        }
    }
}

impl<T> LatestSnapshot<T> {
    pub(crate) fn new() -> Self {
        Self {
            state: Arc::new(Mutex::new(State {
                pending: None,
                scheduled_revision: 0,
            })),
        }
    }

    pub(crate) fn schedule(
        &self,
        value: T,
        revision: u64,
        merge_superseded: impl FnOnce(&mut T, T),
    ) {
        let mut state = lock(&self.state);
        state.scheduled_revision = state.scheduled_revision.max(revision);
        let incoming = VersionedSnapshot { revision, value };
        state.pending = match state.pending.take() {
            Some(previous) if previous.revision > incoming.revision => {
                let mut previous = previous;
                merge_superseded(&mut previous.value, incoming.value);
                Some(previous)
            }
            Some(previous) => {
                let mut incoming = incoming;
                merge_superseded(&mut incoming.value, previous.value);
                Some(incoming)
            }
            None => Some(incoming),
        };
    }

    pub(crate) fn scheduled_revision(&self) -> u64 {
        lock(&self.state).scheduled_revision
    }

    pub(crate) fn take(&self) -> Option<VersionedSnapshot<T>> {
        lock(&self.state).pending.take()
    }

    pub(crate) fn has_pending(&self) -> bool {
        lock(&self.state).pending.is_some()
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

use std::sync::{Mutex, MutexGuard};

// Why: a poisoned lock is recovered because the guarded state is plain data.
pub(crate) fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

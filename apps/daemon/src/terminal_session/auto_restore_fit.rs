use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tokio::task::AbortHandle;

use super::TerminalSessionAuthority;

#[derive(Clone, Default)]
pub(super) struct AutoRestoreFit {
    inner: Arc<AutoRestoreFitInner>,
}

#[derive(Default)]
struct AutoRestoreFitInner {
    next_token: AtomicU64,
    pending: Mutex<HashMap<String, PendingRestore>>,
}

struct PendingRestore {
    abort: AbortHandle,
    token: u64,
}

impl AutoRestoreFit {
    pub(super) fn schedule(
        &self,
        authority: TerminalSessionAuthority,
        handle: String,
        client_id: String,
        delay: Duration,
    ) {
        let mut pending = self.pending();
        if let Some(replaced) = pending.remove(&handle) {
            replaced.abort.abort();
        }
        let token = self.inner.next_token.fetch_add(1, Ordering::Relaxed);
        let tracker = self.clone();
        let task_handle = handle.clone();
        let task = tokio::spawn(async move {
            tokio::time::sleep(delay).await;
            if tracker.take_if_current(&task_handle, token) {
                let _ = authority.auto_restore_fit(&task_handle, &client_id).await;
            }
        });
        pending.insert(
            handle,
            PendingRestore {
                abort: task.abort_handle(),
                token,
            },
        );
    }

    pub(super) fn cancel(&self, handle: &str) {
        if let Some(pending) = self.pending().remove(handle) {
            pending.abort.abort();
        }
    }

    pub(super) fn cancel_all(&self) {
        for (_, pending) in self.pending().drain() {
            pending.abort.abort();
        }
    }

    fn take_if_current(&self, handle: &str, token: u64) -> bool {
        let mut pending = self.pending();
        if pending
            .get(handle)
            .is_some_and(|entry| entry.token == token)
        {
            pending.remove(handle);
            true
        } else {
            false
        }
    }

    fn pending(&self) -> std::sync::MutexGuard<'_, HashMap<String, PendingRestore>> {
        self.inner
            .pending
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }
}

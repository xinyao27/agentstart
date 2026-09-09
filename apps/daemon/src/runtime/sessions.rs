use std::future::Future;
use std::sync::{Mutex, MutexGuard};

use tokio::runtime::TryCurrentError;
use tokio::sync::{OwnedSemaphorePermit, Semaphore, oneshot};
use tokio::task::{AbortHandle, JoinHandle};

use crate::rpc::SessionError;

pub(super) struct RuntimeSessions {
    capacity: std::sync::Arc<Semaphore>,
    tracked: Mutex<Vec<TrackedSession>>,
}

pub struct SessionHandle {
    pub(super) task: JoinHandle<Result<(), SessionError>>,
}

struct TrackedSession {
    abort: AbortHandle,
    completed: oneshot::Receiver<()>,
}

impl RuntimeSessions {
    const MAX_ACTIVE: usize = 128;

    pub(super) fn new() -> Self {
        Self {
            capacity: std::sync::Arc::new(Semaphore::new(Self::MAX_ACTIVE)),
            tracked: Mutex::new(Vec::new()),
        }
    }

    pub(super) fn try_reserve(&self) -> Option<OwnedSemaphorePermit> {
        self.capacity.clone().try_acquire_owned().ok()
    }

    pub(super) fn spawn<F>(
        &self,
        permit: OwnedSemaphorePermit,
        session: F,
    ) -> Result<SessionHandle, TryCurrentError>
    where
        F: Future<Output = Result<(), SessionError>> + Send + 'static,
    {
        let executor = tokio::runtime::Handle::try_current()?;
        let (completion_guard, completed) = oneshot::channel();
        let task = executor.spawn(async move {
            let _completion_guard = completion_guard;
            let _permit = permit;
            session.await
        });
        let abort = task.abort_handle();
        let mut tracked = lock(&self.tracked);
        tracked.retain(|session| !session.abort.is_finished());
        tracked.push(TrackedSession { abort, completed });
        Ok(SessionHandle { task })
    }

    pub(super) fn completed(&self) -> Result<SessionHandle, TryCurrentError> {
        Ok(SessionHandle {
            task: tokio::runtime::Handle::try_current()?.spawn(async { Ok(()) }),
        })
    }

    pub(super) async fn shutdown(self) {
        let tracked = lock(&self.tracked).drain(..).collect::<Vec<_>>();
        for session in &tracked {
            session.abort.abort();
        }
        for session in tracked {
            let _ = session.completed.await;
        }
    }
}

fn lock(sessions: &Mutex<Vec<TrackedSession>>) -> MutexGuard<'_, Vec<TrackedSession>> {
    sessions
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

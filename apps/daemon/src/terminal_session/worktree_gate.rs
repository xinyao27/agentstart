use std::collections::HashMap;
use std::sync::{Arc, Mutex, Weak};
use tokio::sync::{Mutex as AsyncMutex, OwnedMutexGuard};

type WorktreeGates = HashMap<(String, String), Weak<AsyncMutex<()>>>;

#[derive(Clone, Default)]
pub(super) struct WorktreeGate {
    gates: Arc<Mutex<WorktreeGates>>,
}

impl WorktreeGate {
    pub(super) async fn acquire(
        &self,
        host_id: Option<&str>,
        worktree_id: &str,
    ) -> OwnedMutexGuard<()> {
        let gate = {
            let mut gates = self
                .gates
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            gates.retain(|_, gate| gate.strong_count() > 0);
            let key = (
                host_id.unwrap_or("local").to_owned(),
                worktree_id.to_owned(),
            );
            match gates.get(&key).and_then(Weak::upgrade) {
                Some(gate) => gate,
                None => {
                    let gate = Arc::new(AsyncMutex::new(()));
                    gates.insert(key, Arc::downgrade(&gate));
                    gate
                }
            }
        };
        gate.lock_owned().await
    }
}

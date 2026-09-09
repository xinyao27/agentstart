use std::collections::HashMap;
use std::sync::{Arc, Mutex, MutexGuard};

use tokio::sync::{OwnedSemaphorePermit, Semaphore};

const MAX_ACTIVE_CONNECTIONS: usize = 64;
const MAX_ACTIVE_CONNECTIONS_PER_DEVICE: usize = 4;
const MAX_PENDING_HANDSHAKES: usize = 32;

#[derive(Clone)]
pub(super) struct MobileConnections {
    inner: Arc<ConnectionState>,
}

struct ConnectionState {
    active: Mutex<ActiveConnections>,
    pending: Arc<Semaphore>,
}

#[derive(Default)]
struct ActiveConnections {
    count: usize,
    per_device: HashMap<String, usize>,
}

pub(super) struct MobileConnectionLease {
    device_id: String,
    inner: Arc<ConnectionState>,
}

impl MobileConnections {
    pub(super) fn new() -> Self {
        Self {
            inner: Arc::new(ConnectionState {
                active: Mutex::new(ActiveConnections::default()),
                pending: Arc::new(Semaphore::new(MAX_PENDING_HANDSHAKES)),
            }),
        }
    }

    pub(super) fn try_begin_handshake(&self) -> Option<OwnedSemaphorePermit> {
        self.inner.pending.clone().try_acquire_owned().ok()
    }

    pub(super) fn register(&self, device_id: String) -> Result<MobileConnectionLease, ()> {
        let mut active = lock(&self.inner.active);
        let device_count = active.per_device.get(&device_id).copied().unwrap_or(0);
        if active.count >= MAX_ACTIVE_CONNECTIONS
            || device_count >= MAX_ACTIVE_CONNECTIONS_PER_DEVICE
        {
            return Err(());
        }
        active.count += 1;
        active
            .per_device
            .insert(device_id.clone(), device_count + 1);
        Ok(MobileConnectionLease {
            device_id,
            inner: self.inner.clone(),
        })
    }
}

impl Drop for MobileConnectionLease {
    fn drop(&mut self) {
        let mut active = lock(&self.inner.active);
        let remove_device = {
            let Some(device_count) = active.per_device.get_mut(&self.device_id) else {
                return;
            };
            *device_count -= 1;
            *device_count == 0
        };
        active.count -= 1;
        if remove_device {
            active.per_device.remove(&self.device_id);
        }
    }
}

fn lock(active: &Mutex<ActiveConnections>) -> MutexGuard<'_, ActiveConnections> {
    active
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

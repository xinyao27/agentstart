use std::collections::HashMap;
use std::pin::pin;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};

use tokio::sync::Notify;

/// Connection-bound proof that a paired device was authenticated, valid until the
/// device's authorization generation moves past the value captured at handshake.
#[derive(Clone)]
pub struct MobileAuthorization {
    lease: Arc<AuthorizationLease>,
}

#[derive(Clone, Default)]
pub(super) struct MobileAuthorizationRegistry {
    devices: Arc<Mutex<HashMap<String, Arc<DeviceAuthorization>>>>,
}

struct AuthorizationLease {
    device: Arc<DeviceAuthorization>,
    device_id: String,
    issued_generation: u64,
    registry: MobileAuthorizationRegistry,
}

#[derive(Default)]
struct DeviceAuthorization {
    generation: AtomicU64,
    revoked: Notify,
}

impl MobileAuthorization {
    pub(crate) fn device_id(&self) -> &str {
        &self.lease.device_id
    }

    pub(crate) fn is_authorized(&self) -> bool {
        self.lease.device.generation.load(Ordering::Acquire) == self.lease.issued_generation
    }

    pub(crate) async fn revoked(&self) {
        // Why: `notified()` only registers the waiter once polled, so it is enabled before
        // the generation is read — otherwise a revocation landing between the read and the
        // first poll wakes nobody and the revoked socket stays open.
        let mut notified = pin!(self.lease.device.revoked.notified());
        notified.as_mut().enable();
        if !self.is_authorized() {
            return;
        }
        notified.await;
    }
}

impl MobileAuthorizationRegistry {
    /// Callers hold the device store's mutation lock, so no deletion or rotation can
    /// land between the record read that proved the token and the generation captured here.
    pub(super) fn issue(&self, device_id: String) -> MobileAuthorization {
        let mut devices = lock(&self.devices);
        let device = devices.entry(device_id.clone()).or_default().clone();
        let issued_generation = device.generation.load(Ordering::Acquire);
        MobileAuthorization {
            lease: Arc::new(AuthorizationLease {
                device,
                device_id,
                issued_generation,
                registry: self.clone(),
            }),
        }
    }

    pub(super) fn revoke(&self, device_id: &str) {
        let devices = lock(&self.devices);
        if let Some(device) = devices.get(device_id) {
            device.generation.fetch_add(1, Ordering::AcqRel);
            device.revoked.notify_waiters();
        }
    }

    fn release(&self, device_id: &str, device: &Arc<DeviceAuthorization>) {
        let mut devices = lock(&self.devices);
        // Why: every clone of the generation cell is made and dropped under this lock, so
        // two holders means the map entry and this last lease, and keeping it would leak a
        // row per device that ever connected.
        if Arc::strong_count(device) == 2
            && devices
                .get(device_id)
                .is_some_and(|entry| Arc::ptr_eq(entry, device))
        {
            devices.remove(device_id);
        }
    }
}

impl Drop for AuthorizationLease {
    fn drop(&mut self) {
        self.registry.release(&self.device_id, &self.device);
    }
}

fn lock(
    devices: &Mutex<HashMap<String, Arc<DeviceAuthorization>>>,
) -> MutexGuard<'_, HashMap<String, Arc<DeviceAuthorization>>> {
    devices
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

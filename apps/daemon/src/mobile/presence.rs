use std::collections::HashMap;
use std::sync::{Arc, Mutex, MutexGuard};

#[derive(Clone, Default)]
pub(crate) struct MobilePresence {
    connections: Arc<Mutex<HashMap<String, String>>>,
}

pub(super) struct MobilePresenceLease {
    connection_id: String,
    presence: MobilePresence,
}

impl MobilePresence {
    pub(super) fn connect(&self, connection_id: String, device_id: String) -> MobilePresenceLease {
        lock(&self.connections).insert(connection_id.clone(), device_id);
        MobilePresenceLease {
            connection_id,
            presence: self.clone(),
        }
    }
}

impl Drop for MobilePresenceLease {
    fn drop(&mut self) {
        lock(&self.presence.connections).remove(&self.connection_id);
    }
}

fn lock(connections: &Mutex<HashMap<String, String>>) -> MutexGuard<'_, HashMap<String, String>> {
    connections
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

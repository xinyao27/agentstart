use std::collections::HashMap;
use std::sync::{Arc, Mutex, MutexGuard};

use tokio::sync::{OwnedSemaphorePermit, Semaphore, watch};

use super::server::RuntimeOutbound;

const MAX_ACTIVE_CONNECTIONS: usize = 64;
const MAX_ACTIVE_CONNECTIONS_PER_PEER: usize = 4;
const MAX_PENDING_HANDSHAKES: usize = 32;

#[derive(Clone)]
pub(crate) struct RuntimeConnections {
    inner: Arc<ConnectionState>,
}

struct ConnectionState {
    active: Mutex<ActiveConnections>,
    pending: Arc<Semaphore>,
}

struct ActiveConnections {
    connections: HashMap<String, RegisteredConnection>,
    per_peer: HashMap<String, usize>,
}

struct RegisteredConnection {
    outbound: RuntimeOutbound,
    peer_id: String,
    revoked: watch::Sender<bool>,
}

pub(crate) struct RuntimeConnectionLease {
    connection_id: String,
    inner: Arc<ConnectionState>,
    revoked: watch::Receiver<bool>,
}

impl RuntimeConnections {
    pub(crate) fn new() -> Self {
        Self {
            inner: Arc::new(ConnectionState {
                active: Mutex::new(ActiveConnections {
                    connections: HashMap::new(),
                    per_peer: HashMap::new(),
                }),
                pending: Arc::new(Semaphore::new(MAX_PENDING_HANDSHAKES)),
            }),
        }
    }

    pub(crate) fn try_begin_handshake(&self) -> Option<OwnedSemaphorePermit> {
        self.inner.pending.clone().try_acquire_owned().ok()
    }

    pub(crate) fn register(
        &self,
        connection_id: String,
        peer_id: String,
        outbound: RuntimeOutbound,
    ) -> Result<RuntimeConnectionLease, ()> {
        let mut active = lock(&self.inner.active);
        let peer_count = active.per_peer.get(&peer_id).copied().unwrap_or(0);
        if active.connections.len() >= MAX_ACTIVE_CONNECTIONS
            || peer_count >= MAX_ACTIVE_CONNECTIONS_PER_PEER
            || active.connections.contains_key(&connection_id)
        {
            return Err(());
        }
        let (revoked, revoked_receiver) = watch::channel(false);
        active.connections.insert(
            connection_id.clone(),
            RegisteredConnection {
                outbound,
                peer_id: peer_id.clone(),
                revoked,
            },
        );
        active.per_peer.insert(peer_id, peer_count + 1);
        Ok(RuntimeConnectionLease {
            connection_id,
            inner: self.inner.clone(),
            revoked: revoked_receiver,
        })
    }

    pub(crate) fn revoke_peer(&self, peer_id: &str) {
        let active = lock(&self.inner.active);
        for connection in active
            .connections
            .values()
            .filter(|connection| connection.peer_id == peer_id)
        {
            let _ = connection.revoked.send(true);
            connection
                .outbound
                .close(1008, "Runtime peer authorization revoked");
        }
    }
}

impl RuntimeConnectionLease {
    pub(crate) async fn revoked(&mut self) {
        if *self.revoked.borrow() {
            return;
        }
        while self.revoked.changed().await.is_ok() {
            if *self.revoked.borrow() {
                return;
            }
        }
    }
}

impl Drop for RuntimeConnectionLease {
    fn drop(&mut self) {
        let mut active = lock(&self.inner.active);
        let Some(connection) = active.connections.remove(&self.connection_id) else {
            return;
        };
        if let Some(count) = active.per_peer.get_mut(&connection.peer_id) {
            *count -= 1;
            if *count == 0 {
                active.per_peer.remove(&connection.peer_id);
            }
        }
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

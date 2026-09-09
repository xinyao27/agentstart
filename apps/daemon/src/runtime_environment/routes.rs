use std::collections::HashMap;
use std::sync::{Arc, Mutex, MutexGuard};

use tokio::sync::Mutex as AsyncMutex;
use yiru_protocol::method_metadata::{MethodMetadata, UnaryMethod};

use super::client;
use super::records::RuntimeEnvironmentProfile;
use crate::transport::{ProtocolClient, ProtocolPeerError, RawDuplexWriter, RawProtocolStream};

#[derive(Clone)]
pub(crate) struct RuntimeEnvironmentRouteRegistry {
    inner: Arc<Mutex<HashMap<String, Arc<RouteSlot>>>>,
}

pub(crate) struct RuntimeEnvironmentRoute {
    client: ProtocolClient,
    environment_id: String,
    generation: u64,
    registry: Arc<Mutex<HashMap<String, Arc<RouteSlot>>>>,
    slot: Arc<RouteSlot>,
}

struct RouteSlot {
    state: AsyncMutex<RouteState>,
}

struct RouteState {
    connection: Option<ProtocolClient>,
    generation: u64,
}

impl RuntimeEnvironmentRouteRegistry {
    pub(super) fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub(super) async fn connect(
        &self,
        environment: &RuntimeEnvironmentProfile,
    ) -> Result<RuntimeEnvironmentRoute, ProtocolPeerError> {
        loop {
            let slot = {
                let mut routes = lock(&self.inner);
                routes
                    .entry(environment.id.clone())
                    .or_insert_with(|| {
                        Arc::new(RouteSlot {
                            state: AsyncMutex::new(RouteState {
                                connection: None,
                                generation: 0,
                            }),
                        })
                    })
                    .clone()
            };
            let mut state = slot.state.lock().await;
            if !lock(&self.inner)
                .get(&environment.id)
                .is_some_and(|registered| Arc::ptr_eq(registered, &slot))
            {
                continue;
            }
            if state.connection.is_none() {
                let connection = client::connect(environment).await?;
                state.generation = state
                    .generation
                    .checked_add(1)
                    .ok_or(ProtocolPeerError::Protocol("route_generation_exhausted"))?;
                state.connection = Some(connection);
            }
            let route = RuntimeEnvironmentRoute {
                client: state
                    .connection
                    .as_ref()
                    .ok_or(ProtocolPeerError::Protocol("route_connection_missing"))?
                    .clone(),
                environment_id: environment.id.clone(),
                generation: state.generation,
                registry: self.inner.clone(),
                slot: slot.clone(),
            };
            drop(state);
            return Ok(route);
        }
    }

    pub(super) async fn disconnect(&self, environment_id: &str) {
        let slot = lock(&self.inner).remove(environment_id);
        let Some(slot) = slot else {
            return;
        };
        let connection = slot.state.lock().await.connection.take();
        if let Some(connection) = connection {
            connection.close().await;
        }
    }
}

impl RuntimeEnvironmentRoute {
    pub(crate) fn runtime_id(&self) -> &str {
        self.client.runtime_id()
    }

    pub(crate) async fn unary<Method>(
        &self,
        request: &Method::Request,
        timeout: std::time::Duration,
    ) -> Result<Method::Response, ProtocolPeerError>
    where
        Method: UnaryMethod,
    {
        let result = self.client.unary::<Method>(request, timeout).await;
        if result.as_ref().is_err_and(is_connection_failure) {
            self.invalidate().await;
        }
        result
    }

    pub(crate) async fn unary_raw(
        &self,
        method: &'static MethodMetadata,
        payload: Vec<u8>,
        timeout: std::time::Duration,
    ) -> Result<Vec<u8>, ProtocolPeerError> {
        let result = self.client.unary_raw(method, payload, timeout).await;
        if result.as_ref().is_err_and(is_connection_failure) {
            self.invalidate().await;
        }
        result
    }

    pub(crate) async fn duplex_raw(
        &self,
        method: &'static MethodMetadata,
        payload: Vec<u8>,
        timeout: std::time::Duration,
    ) -> Result<(RawDuplexWriter, RawProtocolStream), ProtocolPeerError> {
        let result = self.client.duplex_raw(method, payload, timeout).await;
        if result.as_ref().is_err_and(is_connection_failure) {
            self.invalidate().await;
        }
        result
    }

    pub(crate) async fn server_stream_raw(
        &self,
        method: &'static MethodMetadata,
        payload: Vec<u8>,
        timeout: std::time::Duration,
    ) -> Result<RawProtocolStream, ProtocolPeerError> {
        let result = self
            .client
            .server_stream_raw(method, payload, timeout)
            .await;
        if result.as_ref().is_err_and(is_connection_failure) {
            self.invalidate().await;
        }
        result
    }

    pub(crate) async fn invalidate_if_connection_failed(&self, error: &ProtocolPeerError) {
        if is_connection_failure(error) {
            self.invalidate().await;
        }
    }

    pub(crate) async fn invalidate(&self) {
        let connection = {
            let mut state = self.slot.state.lock().await;
            if state.generation != self.generation {
                return;
            }
            let connection = state.connection.take();
            let mut routes = lock(&self.registry);
            if routes
                .get(&self.environment_id)
                .is_some_and(|slot| Arc::ptr_eq(slot, &self.slot))
            {
                routes.remove(&self.environment_id);
            }
            connection
        };
        if let Some(connection) = connection {
            connection.close().await;
        }
    }
}

fn is_connection_failure(error: &ProtocolPeerError) -> bool {
    !matches!(error, ProtocolPeerError::Remote(_))
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

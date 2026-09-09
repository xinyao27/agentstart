use std::sync::Arc;
use std::time::Duration;

use serde_json::Value;
use tokio::sync::{Mutex, Semaphore};
use yiru_protocol::method_metadata::methods::YiruRuntimeV1ShellHostServiceExecute;
use yiru_protocol::protocol::v1::StatusCode;

use crate::reverse_protocol::{ReverseProtocolError, ReverseProtocolRegistry};

const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Clone)]
pub(crate) struct ShellServicesRegistry {
    connections: Arc<Mutex<Vec<String>>>,
    protocol: ReverseProtocolRegistry,
    slots: Arc<Semaphore>,
}

#[derive(Debug, thiserror::Error)]
pub(crate) enum ShellServicesError {
    #[error("shell-services request capacity is exhausted")]
    Overloaded,
    #[error("shell_unavailable")]
    Unavailable,
    #[error("shell-services reverse-link response is invalid")]
    InvalidResponse,
    #[error("The operation was aborted due to timeout")]
    Timeout,
    #[error("{message}")]
    Remote { message: String, status: u16 },
}

impl ShellServicesRegistry {
    pub(crate) fn new(protocol: ReverseProtocolRegistry) -> Self {
        Self {
            connections: Arc::new(Mutex::new(Vec::new())),
            protocol,
            slots: Arc::new(Semaphore::new(128)),
        }
    }

    pub(crate) async fn register(&self, connection_id: &str) -> bool {
        if !self.protocol.has_connection(connection_id) {
            return false;
        }
        let mut connections = self.connections.lock().await;
        connections.retain(|id| id != connection_id);
        connections.push(connection_id.to_owned());
        true
    }

    pub(crate) async fn disconnect(&self, connection_id: &str) {
        self.connections
            .lock()
            .await
            .retain(|id| id != connection_id);
    }

    pub(crate) async fn has_web_connection(&self) -> bool {
        self.select(None).await.is_some()
    }

    pub(crate) async fn has_connection(&self, connection_id: &str) -> bool {
        let id = normalize(connection_id);
        self.protocol.has_connection(id)
            && self
                .connections
                .lock()
                .await
                .iter()
                .any(|entry| entry == id)
    }

    pub(crate) async fn request_web(
        &self,
        preferred: Option<&str>,
        path: &str,
        body: Value,
    ) -> Result<Value, ShellServicesError> {
        self.request_web_with_timeout(preferred, path, body, REQUEST_TIMEOUT)
            .await
    }

    pub(crate) async fn request_web_exact(
        &self,
        connection_id: &str,
        path: &str,
        body: Value,
    ) -> Result<Value, ShellServicesError> {
        if !self.has_connection(connection_id).await {
            return Err(ShellServicesError::Unavailable);
        }
        self.request(normalize(connection_id), path, body, REQUEST_TIMEOUT)
            .await
    }

    pub(crate) async fn request_web_with_timeout(
        &self,
        preferred: Option<&str>,
        path: &str,
        body: Value,
        timeout: Duration,
    ) -> Result<Value, ShellServicesError> {
        let id = self
            .select(preferred)
            .await
            .ok_or(ShellServicesError::Unavailable)?;
        self.request(&id, path, body, timeout).await
    }

    pub(crate) async fn dispatch_ui(&self, path: &str, body: Value) -> bool {
        let Some(id) = self.select(None).await else {
            return false;
        };
        let Ok(permit) = self.slots.clone().try_acquire_owned() else {
            return false;
        };
        let request = match super::request::encode(path, &body) {
            Ok(value) => value,
            Err(_) => return false,
        };
        let protocol = self.protocol.clone();
        std::mem::drop(tokio::spawn(async move {
            let _permit = permit;
            let _ = protocol
                .unary_on::<YiruRuntimeV1ShellHostServiceExecute>(&id, &request, REQUEST_TIMEOUT)
                .await;
        }));
        true
    }

    async fn select(&self, preferred: Option<&str>) -> Option<String> {
        let mut connections = self.connections.lock().await;
        connections.retain(|id| self.protocol.has_connection(id));
        preferred
            .map(normalize)
            .and_then(|preferred| connections.iter().find(|id| id.as_str() == preferred))
            .or_else(|| connections.last())
            .cloned()
    }

    async fn request(
        &self,
        id: &str,
        path: &str,
        body: Value,
        timeout: Duration,
    ) -> Result<Value, ShellServicesError> {
        let _permit = self
            .slots
            .clone()
            .try_acquire_owned()
            .map_err(|_| ShellServicesError::Overloaded)?;
        let request = super::request::encode(path, &body)?;
        let result = self
            .protocol
            .unary_on::<YiruRuntimeV1ShellHostServiceExecute>(id, &request, timeout)
            .await
            .map_err(ShellServicesError::from)?;
        super::request::decode(path, result)
    }
}

fn normalize(id: &str) -> &str {
    id.strip_prefix("web:").unwrap_or(id)
}

impl From<ReverseProtocolError> for ShellServicesError {
    fn from(error: ReverseProtocolError) -> Self {
        match error {
            ReverseProtocolError::ConnectionUnavailable => Self::Unavailable,
            ReverseProtocolError::DeadlineExceeded => Self::Timeout,
            ReverseProtocolError::Protocol(_) => Self::InvalidResponse,
            ReverseProtocolError::Remote { code, message } => Self::Remote {
                message,
                status: match code {
                    StatusCode::InvalidArgument => 400,
                    StatusCode::Unauthenticated => 401,
                    StatusCode::PermissionDenied => 403,
                    StatusCode::NotFound => 404,
                    StatusCode::AlreadyExists | StatusCode::Aborted => 409,
                    StatusCode::ResourceExhausted => 429,
                    StatusCode::Unavailable => 503,
                    StatusCode::DeadlineExceeded => 504,
                    _ => 500,
                },
            },
        }
    }
}

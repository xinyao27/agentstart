use std::marker::PhantomData;
use std::sync::{Arc, RwLock};
use std::time::Duration;

use agentstart_protocol::method_metadata::{ServerStreamMethod, UnaryMethod};
use prost::Message;
use tokio::sync::{mpsc, oneshot};
use tokio::time::{Instant, timeout_at};

use crate::rpc::protocol_reverse::{ReverseCommand, ReverseControl};

pub use crate::rpc::protocol_reverse::ReverseProtocolError;

const COMMAND_CAPACITY: usize = 64;
const STREAM_CAPACITY: usize = 33;

#[derive(Clone, Default)]
pub struct ReverseProtocolRegistry {
    inner: Arc<RwLock<RegistryState>>,
}

#[derive(Default)]
struct RegistryState {
    connections: Vec<RegisteredConnection>,
    generation: u64,
}

#[derive(Clone)]
struct RegisteredConnection {
    client: ReverseProtocolClient,
    connection_id: String,
    generation: u64,
}

pub(crate) struct ReverseProtocolRegistration {
    connection_id: String,
    generation: u64,
    registry: ReverseProtocolRegistry,
}

#[derive(Clone)]
pub(crate) struct ReverseProtocolClient {
    command_tx: mpsc::Sender<ReverseCommand>,
    control_tx: mpsc::UnboundedSender<ReverseControl>,
}

pub struct ReverseProtocolStream<Response> {
    cancellation: CallCancellation,
    control_tx: mpsc::UnboundedSender<ReverseControl>,
    item_rx: mpsc::Receiver<Result<Vec<u8>, ReverseProtocolError>>,
    response: PhantomData<Response>,
}

struct CallCancellation {
    call_id: Option<u64>,
    control_tx: mpsc::UnboundedSender<ReverseControl>,
}

impl ReverseProtocolRegistry {
    pub fn has_web_connection(&self) -> bool {
        self.inner
            .read()
            .is_ok_and(|state| !state.connections.is_empty())
    }

    pub fn has_connection(&self, connection_id: &str) -> bool {
        self.inner.read().is_ok_and(|state| {
            state
                .connections
                .iter()
                .any(|entry| entry.connection_id == connection_id)
        })
    }

    pub async fn unary<Method>(
        &self,
        request: &Method::Request,
        call_timeout: Duration,
    ) -> Result<Method::Response, ReverseProtocolError>
    where
        Method: UnaryMethod,
    {
        self.client()?.unary::<Method>(request, call_timeout).await
    }

    pub async fn server_stream<Method>(
        &self,
        request: &Method::Request,
        call_timeout: Duration,
    ) -> Result<ReverseProtocolStream<Method::Item>, ReverseProtocolError>
    where
        Method: ServerStreamMethod,
    {
        self.client()?
            .server_stream::<Method>(request, call_timeout)
            .await
    }

    pub async fn unary_on<Method>(
        &self,
        connection_id: &str,
        request: &Method::Request,
        call_timeout: Duration,
    ) -> Result<Method::Response, ReverseProtocolError>
    where
        Method: UnaryMethod,
    {
        self.client_on(connection_id)?
            .unary::<Method>(request, call_timeout)
            .await
    }

    pub async fn server_stream_on<Method>(
        &self,
        connection_id: &str,
        request: &Method::Request,
        call_timeout: Duration,
    ) -> Result<ReverseProtocolStream<Method::Item>, ReverseProtocolError>
    where
        Method: ServerStreamMethod,
    {
        self.client_on(connection_id)?
            .server_stream::<Method>(request, call_timeout)
            .await
    }

    pub(crate) fn connect_web(
        &self,
        connection_id: String,
        client: ReverseProtocolClient,
    ) -> ReverseProtocolRegistration {
        let generation = if let Ok(mut state) = self.inner.write() {
            state.generation = state.generation.wrapping_add(1).max(1);
            let generation = state.generation;
            state.connections.push(RegisteredConnection {
                client,
                connection_id: connection_id.clone(),
                generation,
            });
            generation
        } else {
            0
        };
        ReverseProtocolRegistration {
            connection_id,
            generation,
            registry: self.clone(),
        }
    }

    fn client(&self) -> Result<ReverseProtocolClient, ReverseProtocolError> {
        self.inner
            .read()
            .ok()
            .and_then(|state| state.connections.last().map(|entry| entry.client.clone()))
            .ok_or(ReverseProtocolError::ConnectionUnavailable)
    }

    fn client_on(
        &self,
        connection_id: &str,
    ) -> Result<ReverseProtocolClient, ReverseProtocolError> {
        self.inner
            .read()
            .ok()
            .and_then(|state| {
                state
                    .connections
                    .iter()
                    .rev()
                    .find(|entry| entry.connection_id == connection_id)
                    .map(|entry| entry.client.clone())
            })
            .ok_or(ReverseProtocolError::ConnectionUnavailable)
    }
}

impl Drop for ReverseProtocolRegistration {
    fn drop(&mut self) {
        if let Ok(mut state) = self.registry.inner.write() {
            state.connections.retain(|entry| {
                entry.connection_id != self.connection_id || entry.generation != self.generation
            });
        }
    }
}

impl ReverseProtocolClient {
    pub(crate) fn channel() -> (
        Self,
        mpsc::Receiver<ReverseCommand>,
        mpsc::UnboundedReceiver<ReverseControl>,
    ) {
        let (command_tx, command_rx) = mpsc::channel(COMMAND_CAPACITY);
        let (control_tx, control_rx) = mpsc::unbounded_channel();
        (
            Self {
                command_tx,
                control_tx,
            },
            command_rx,
            control_rx,
        )
    }

    async fn unary<Method>(
        &self,
        request: &Method::Request,
        call_timeout: Duration,
    ) -> Result<Method::Response, ReverseProtocolError>
    where
        Method: UnaryMethod,
    {
        let deadline = call_deadline(call_timeout)?;
        let (started_tx, started_rx) = oneshot::channel();
        let (result_tx, result_rx) = oneshot::channel();
        let command = ReverseCommand::Unary {
            deadline,
            metadata: Method::METADATA,
            payload: request.encode_to_vec(),
            result_tx,
            started_tx,
            timeout_ms: call_timeout_ms(call_timeout)?,
        };
        timeout_at(deadline, self.command_tx.send(command))
            .await
            .map_err(|_| ReverseProtocolError::DeadlineExceeded)?
            .map_err(|_| ReverseProtocolError::ConnectionUnavailable)?;
        let call_id = timeout_at(deadline, started_rx)
            .await
            .map_err(|_| ReverseProtocolError::DeadlineExceeded)?
            .map_err(|_| ReverseProtocolError::ConnectionUnavailable)??;
        let mut cancellation = CallCancellation::new(call_id, self.control_tx.clone());
        let response = timeout_at(deadline, result_rx)
            .await
            .map_err(|_| ReverseProtocolError::DeadlineExceeded)?
            .map_err(|_| ReverseProtocolError::ConnectionUnavailable)??;
        cancellation.disarm();
        Method::Response::decode(response.as_slice())
            .map_err(|_| ReverseProtocolError::Protocol("response_invalid"))
    }

    async fn server_stream<Method>(
        &self,
        request: &Method::Request,
        call_timeout: Duration,
    ) -> Result<ReverseProtocolStream<Method::Item>, ReverseProtocolError>
    where
        Method: ServerStreamMethod,
    {
        let deadline = call_deadline(call_timeout)?;
        let (started_tx, started_rx) = oneshot::channel();
        let (item_tx, item_rx) = mpsc::channel(STREAM_CAPACITY);
        let command = ReverseCommand::ServerStream {
            deadline,
            item_tx,
            metadata: Method::METADATA,
            payload: request.encode_to_vec(),
            started_tx,
            timeout_ms: call_timeout_ms(call_timeout)?,
        };
        timeout_at(deadline, self.command_tx.send(command))
            .await
            .map_err(|_| ReverseProtocolError::DeadlineExceeded)?
            .map_err(|_| ReverseProtocolError::ConnectionUnavailable)?;
        let call_id = timeout_at(deadline, started_rx)
            .await
            .map_err(|_| ReverseProtocolError::DeadlineExceeded)?
            .map_err(|_| ReverseProtocolError::ConnectionUnavailable)??;
        Ok(ReverseProtocolStream {
            cancellation: CallCancellation::new(call_id, self.control_tx.clone()),
            control_tx: self.control_tx.clone(),
            item_rx,
            response: PhantomData,
        })
    }
}

impl<Response> ReverseProtocolStream<Response>
where
    Response: Message + Default,
{
    pub async fn receive(&mut self) -> Result<Option<Response>, ReverseProtocolError> {
        let Some(item) = self.item_rx.recv().await else {
            self.cancellation.disarm();
            return Ok(None);
        };
        let payload = match item {
            Ok(payload) => payload,
            Err(error) => {
                self.cancellation.disarm();
                return Err(error);
            }
        };
        let response = match Response::decode(payload.as_slice()) {
            Ok(response) => response,
            Err(_) => {
                self.cancellation.cancel();
                return Err(ReverseProtocolError::Protocol("response_invalid"));
            }
        };
        let credit_bytes = u64::try_from(payload.len())
            .map_err(|_| ReverseProtocolError::Protocol("response_too_large"))?;
        let call_id = self.cancellation.call_id()?;
        self.control_tx
            .send(ReverseControl::Credit {
                call_id,
                credit_bytes,
            })
            .map_err(|_| ReverseProtocolError::ConnectionUnavailable)?;
        Ok(Some(response))
    }

    pub fn cancel(mut self) {
        self.cancellation.cancel();
    }
}

impl CallCancellation {
    fn new(call_id: u64, control_tx: mpsc::UnboundedSender<ReverseControl>) -> Self {
        Self {
            call_id: Some(call_id),
            control_tx,
        }
    }

    fn call_id(&self) -> Result<u64, ReverseProtocolError> {
        self.call_id
            .ok_or(ReverseProtocolError::Protocol("call_not_active"))
    }

    fn cancel(&mut self) {
        if let Some(call_id) = self.call_id.take() {
            let _ = self.control_tx.send(ReverseControl::Cancel(call_id));
        }
    }

    fn disarm(&mut self) {
        self.call_id = None;
    }
}

impl Drop for CallCancellation {
    fn drop(&mut self) {
        self.cancel();
    }
}

fn call_deadline(call_timeout: Duration) -> Result<Instant, ReverseProtocolError> {
    Instant::now()
        .checked_add(call_timeout)
        .ok_or(ReverseProtocolError::Protocol("deadline_invalid"))
}

fn call_timeout_ms(call_timeout: Duration) -> Result<u32, ReverseProtocolError> {
    u32::try_from(call_timeout.as_millis())
        .map_err(|_| ReverseProtocolError::Protocol("deadline_invalid"))
}

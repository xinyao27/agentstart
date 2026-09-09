use std::collections::HashMap;
use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use base64::Engine as _;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use serde::Serialize;
use sha2::{Digest, Sha256};
use thiserror::Error;
use tokio::sync::watch;

use crate::diagnostics::DiagnosticsTrace;

const DEFAULT_MAX_FRAME_BYTES: u32 = 64 * 1024;
const MAX_PENDING_TICKETS: usize = 1_024;
const TICKET_TTL: Duration = Duration::from_secs(30);

#[derive(Clone)]
pub(crate) struct TerminalMultiplexAdmission {
    state: std::sync::Arc<Mutex<AdmissionState>>,
    trace: DiagnosticsTrace,
}

#[derive(Clone, Debug)]
pub(crate) struct TerminalMultiplexClose {
    pub(crate) code: u16,
    pub(crate) reason: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TerminalMultiplexTicket {
    pub(crate) bulk_ticket: String,
    pub(crate) expires_at: u64,
    pub(crate) max_frame_bytes: u32,
}

#[derive(Debug, Error)]
pub(crate) enum TerminalMultiplexAdmissionError {
    #[error("terminal multiplex connection use conflict")]
    ConnectionUseConflict,
    #[error("terminal multiplex ticket is invalid or expired")]
    InvalidTicket,
    #[error("OS random source failed: {0}")]
    Random(#[from] getrandom::Error),
    #[error("system time is before the Unix epoch")]
    SystemTime(#[from] std::time::SystemTimeError),
}

struct AdmissionState {
    active_owners: HashMap<String, String>,
    close_requests: HashMap<String, watch::Sender<Option<TerminalMultiplexClose>>>,
    connections: HashMap<String, ConnectionAdmission>,
    tickets: HashMap<[u8; 32], Ticket>,
}

struct ConnectionAdmission {
    identity: Option<TerminalMultiplexIdentity>,
    request_id: Option<String>,
}

struct Ticket {
    client_instance_id: String,
    environment_id: String,
    expires_at: SystemTime,
    principal_id: String,
}

struct TerminalMultiplexIdentity {
    client_instance_id: String,
    environment_id: String,
    principal_id: String,
}

impl TerminalMultiplexAdmission {
    pub(crate) fn new(trace: DiagnosticsTrace) -> Self {
        Self {
            state: std::sync::Arc::new(Mutex::new(AdmissionState {
                active_owners: HashMap::new(),
                close_requests: HashMap::new(),
                connections: HashMap::new(),
                tickets: HashMap::new(),
            })),
            trace,
        }
    }

    pub(crate) fn register_connection(
        &self,
        connection_id: String,
    ) -> watch::Receiver<Option<TerminalMultiplexClose>> {
        let (sender, receiver) = watch::channel(None);
        lock(&self.state)
            .close_requests
            .insert(connection_id, sender);
        receiver
    }

    pub(crate) fn close_connection(&self, connection_id: &str) {
        let mut state = lock(&self.state);
        state.close_requests.remove(connection_id);
        state.connections.remove(connection_id);
        state
            .active_owners
            .retain(|_, owner| owner != connection_id);
    }

    pub(crate) fn issue_ticket(
        &self,
        principal_id: String,
        client_instance_id: String,
        environment_id: String,
    ) -> Result<TerminalMultiplexTicket, TerminalMultiplexAdmissionError> {
        let mut token = [0_u8; 32];
        getrandom::fill(&mut token)?;
        let bulk_ticket = URL_SAFE_NO_PAD.encode(token);
        let expires_at = SystemTime::now() + TICKET_TTL;
        let expires_at_millis =
            u64::try_from(expires_at.duration_since(UNIX_EPOCH)?.as_millis()).unwrap_or(u64::MAX);
        let mut state = lock(&self.state);
        prune_tickets(&mut state);
        while state.tickets.len() >= MAX_PENDING_TICKETS {
            let Some(oldest) = state
                .tickets
                .iter()
                .min_by_key(|(_, ticket)| ticket.expires_at)
                .map(|(digest, _)| *digest)
            else {
                break;
            };
            state.tickets.remove(&oldest);
        }
        state.tickets.insert(
            digest(&bulk_ticket),
            Ticket {
                client_instance_id,
                environment_id,
                expires_at,
                principal_id,
            },
        );
        Ok(TerminalMultiplexTicket {
            bulk_ticket,
            expires_at: expires_at_millis,
            max_frame_bytes: DEFAULT_MAX_FRAME_BYTES,
        })
    }

    pub(crate) fn admit_bulk(
        &self,
        connection_id: &str,
        principal_id: &str,
        request_id: &str,
        bulk_ticket: &str,
    ) -> Result<(), TerminalMultiplexAdmissionError> {
        let mut state = lock(&self.state);
        if state.connections.contains_key(connection_id) {
            self.record_event("connection_use_conflict");
            return Err(TerminalMultiplexAdmissionError::ConnectionUseConflict);
        }
        prune_tickets(&mut state);
        let Some(ticket) = state
            .tickets
            .remove(&digest(bulk_ticket))
            .filter(|ticket| ticket.principal_id == principal_id)
        else {
            self.record_event("invalid_bulk_ticket");
            return Err(TerminalMultiplexAdmissionError::InvalidTicket);
        };
        state.connections.insert(
            connection_id.to_owned(),
            ConnectionAdmission {
                identity: Some(TerminalMultiplexIdentity {
                    client_instance_id: ticket.client_instance_id,
                    environment_id: ticket.environment_id,
                    principal_id: ticket.principal_id,
                }),
                request_id: Some(request_id.to_owned()),
            },
        );
        Ok(())
    }

    pub(crate) fn activate_epoch(
        &self,
        connection_id: &str,
        request_id: &str,
    ) -> Result<(), TerminalMultiplexAdmissionError> {
        let mut state = lock(&self.state);
        let connection = state
            .connections
            .get(connection_id)
            .filter(|connection| connection.request_id.as_deref() == Some(request_id))
            .ok_or(TerminalMultiplexAdmissionError::InvalidTicket)?;
        let identity = connection
            .identity
            .as_ref()
            .ok_or(TerminalMultiplexAdmissionError::InvalidTicket)?;
        let owner_key = format!(
            "{}\0{}\0{}",
            identity.principal_id, identity.client_instance_id, identity.environment_id
        );
        if let Some(previous) = state
            .active_owners
            .insert(owner_key, connection_id.to_owned())
            .filter(|previous| previous != connection_id)
            && let Some(close) = state.close_requests.get(&previous)
        {
            self.record_event("owner_superseded");
            let _ = close.send(Some(TerminalMultiplexClose {
                code: 4001,
                reason: "superseded".to_owned(),
            }));
        }
        Ok(())
    }

    fn record_event(&self, event: &'static str) {
        let mut attributes = serde_json::Map::new();
        attributes.insert(
            "event".to_owned(),
            serde_json::Value::String(event.to_owned()),
        );
        let mut span = self
            .trace
            .start_span("terminal.multiplex.admission", attributes);
        span.success();
    }
}

fn prune_tickets(state: &mut AdmissionState) {
    let now = SystemTime::now();
    state.tickets.retain(|_, ticket| ticket.expires_at >= now);
}

fn digest(ticket: &str) -> [u8; 32] {
    Sha256::digest(ticket.as_bytes()).into()
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

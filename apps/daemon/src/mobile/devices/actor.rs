use async_trait::async_trait;
use rusqlite::Connection;
use tokio::sync::oneshot;

use super::{MobileDevice, MobileDeviceStoreError, records};

pub(super) enum MobileDeviceCommand {
    AuthenticateToken {
        response: oneshot::Sender<Result<Option<MobileDevice>, MobileDeviceStoreError>>,
        token: String,
    },
    GetOrCreateNamed {
        name: String,
        response: oneshot::Sender<Result<MobileDevice, MobileDeviceStoreError>>,
    },
    GetOrCreatePending {
        name: String,
        response: oneshot::Sender<Result<MobileDevice, MobileDeviceStoreError>>,
        rotate: bool,
    },
    ListPaired {
        response: oneshot::Sender<Result<Vec<MobileDevice>, MobileDeviceStoreError>>,
    },
    MarkSeen {
        device_id: String,
        response: oneshot::Sender<Result<(), MobileDeviceStoreError>>,
    },
    Remove {
        device_id: String,
        response: oneshot::Sender<Result<bool, MobileDeviceStoreError>>,
    },
}

pub(crate) struct MobileDeviceRequest(MobileDeviceCommand);

pub(crate) struct MobileDeviceWorker;

#[derive(Clone, Copy, Debug)]
pub(crate) struct MobileDeviceMailboxClosed;

#[async_trait]
pub(crate) trait MobileDeviceMailbox: Send + Sync {
    async fn submit(&self, request: MobileDeviceRequest) -> Result<(), MobileDeviceMailboxClosed>;
}

impl MobileDeviceRequest {
    pub(super) fn new(command: MobileDeviceCommand) -> Self {
        Self(command)
    }
}

impl MobileDeviceWorker {
    pub(crate) fn handle(&self, connection: &Connection, request: MobileDeviceRequest) {
        match request.0 {
            MobileDeviceCommand::AuthenticateToken { response, token } => {
                let _ = response.send(records::authenticate_token(connection, &token));
            }
            MobileDeviceCommand::GetOrCreateNamed { name, response } => {
                let _ = response.send(records::get_or_create_named(connection, name));
            }
            MobileDeviceCommand::GetOrCreatePending {
                name,
                response,
                rotate,
            } => {
                let _ = response.send(records::get_or_create_pending(connection, name, rotate));
            }
            MobileDeviceCommand::ListPaired { response } => {
                let _ = response.send(records::list_paired(connection));
            }
            MobileDeviceCommand::MarkSeen {
                device_id,
                response,
            } => {
                let _ = response.send(records::mark_seen(connection, &device_id));
            }
            MobileDeviceCommand::Remove {
                device_id,
                response,
            } => {
                let _ = response.send(records::remove(connection, &device_id));
            }
        }
    }
}

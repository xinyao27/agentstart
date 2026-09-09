mod actor;
mod identity;
mod records;

use std::error::Error;
use std::sync::Arc;
use std::time::SystemTimeError;

use serde::Serialize;
use thiserror::Error;
use tokio::sync::{Mutex, oneshot};

use super::authorization::{MobileAuthorization, MobileAuthorizationRegistry};
use actor::MobileDeviceCommand;
pub(crate) use actor::{
    MobileDeviceMailbox, MobileDeviceMailboxClosed, MobileDeviceRequest, MobileDeviceWorker,
};

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ApnsEnvironment {
    Production,
    Sandbox,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MobileDevice {
    pub(crate) apns_environment: Option<ApnsEnvironment>,
    pub(crate) apns_token: Option<String>,
    pub(crate) id: String,
    pub(crate) last_seen_at: i64,
    pub(crate) name: String,
    pub(crate) paired_at: i64,
    pub(crate) token: String,
}

pub struct PushRegistration {
    pub(crate) environment: ApnsEnvironment,
    pub(crate) token: String,
}

#[derive(Clone)]
pub struct MobileDeviceStore {
    authorizations: MobileAuthorizationRegistry,
    mailbox: Arc<dyn MobileDeviceMailbox>,
    // Why: revocation must never interleave with the record read that issues a lease, or a
    // connection authenticated against a just-deleted or just-rotated token would hold a
    // generation nothing will ever bump.
    mutation: Arc<Mutex<()>>,
}

#[derive(Debug, Error)]
pub enum MobileDeviceStoreError {
    #[error("mobile device clock failed: {0}")]
    Clock(#[from] SystemTimeError),
    #[error("mobile device random identifier generation failed: {0}")]
    Random(#[from] getrandom::Error),
    #[error("mobile device storage failed")]
    Storage(#[source] Box<dyn Error + Send + Sync>),
    #[error("mobile device worker is unavailable")]
    WorkerUnavailable,
}

impl MobileDeviceStore {
    pub(crate) fn new(mailbox: Arc<dyn MobileDeviceMailbox>) -> Self {
        Self {
            authorizations: MobileAuthorizationRegistry::default(),
            mailbox,
            mutation: Arc::new(Mutex::new(())),
        }
    }

    pub async fn get_or_create_named(
        &self,
        name: String,
    ) -> Result<MobileDevice, MobileDeviceStoreError> {
        let (response, result) = oneshot::channel();
        self.submit(MobileDeviceCommand::GetOrCreateNamed { name, response })
            .await?;
        receive(result).await
    }

    pub async fn get_or_create_pending(
        &self,
        name: String,
        rotate: bool,
    ) -> Result<MobileDevice, MobileDeviceStoreError> {
        let _mutation = self.mutation.lock().await;
        let (response, result) = oneshot::channel();
        self.submit(MobileDeviceCommand::GetOrCreatePending {
            name,
            response,
            rotate,
        })
        .await?;
        let device = receive(result).await?;
        if rotate {
            // Why: a rotating offer may have replaced this identifier's token, and the
            // store cannot tell a rotated record from a freshly created one, whose
            // identifier no lease can name anyway.
            self.authorizations.revoke(&device.id);
        }
        Ok(device)
    }

    pub async fn list_paired(&self) -> Result<Vec<MobileDevice>, MobileDeviceStoreError> {
        let (response, result) = oneshot::channel();
        self.submit(MobileDeviceCommand::ListPaired { response })
            .await?;
        receive(result).await
    }

    pub async fn remove(&self, device_id: String) -> Result<bool, MobileDeviceStoreError> {
        let _mutation = self.mutation.lock().await;
        let (response, result) = oneshot::channel();
        self.submit(MobileDeviceCommand::Remove {
            device_id: device_id.clone(),
            response,
        })
        .await?;
        let removed = receive(result).await?;
        if removed {
            self.authorizations.revoke(&device_id);
        }
        Ok(removed)
    }

    pub async fn mark_seen(&self, device_id: String) -> Result<(), MobileDeviceStoreError> {
        let (response, result) = oneshot::channel();
        self.submit(MobileDeviceCommand::MarkSeen {
            device_id,
            response,
        })
        .await?;
        receive(result).await
    }

    pub(super) async fn authorize_token(
        &self,
        token: String,
    ) -> Result<Option<MobileAuthorization>, MobileDeviceStoreError> {
        let _mutation = self.mutation.lock().await;
        let (response, result) = oneshot::channel();
        self.submit(MobileDeviceCommand::AuthenticateToken { response, token })
            .await?;
        Ok(receive(result)
            .await?
            .map(|device| self.authorizations.issue(device.id)))
    }

    pub async fn register_push(
        &self,
        device_id: String,
        registration: Option<PushRegistration>,
    ) -> Result<bool, MobileDeviceStoreError> {
        let (response, result) = oneshot::channel();
        self.submit(MobileDeviceCommand::RegisterPush {
            device_id,
            registration,
            response,
        })
        .await?;
        receive(result).await
    }

    pub async fn push_devices(&self) -> Result<Vec<MobileDevice>, MobileDeviceStoreError> {
        let (response, result) = oneshot::channel();
        self.submit(MobileDeviceCommand::PushDevices { response })
            .await?;
        receive(result).await
    }

    async fn submit(&self, command: MobileDeviceCommand) -> Result<(), MobileDeviceStoreError> {
        self.mailbox
            .submit(MobileDeviceRequest::new(command))
            .await
            .map_err(|_| MobileDeviceStoreError::WorkerUnavailable)
    }
}

impl ApnsEnvironment {
    fn as_str(self) -> &'static str {
        match self {
            Self::Production => "production",
            Self::Sandbox => "sandbox",
        }
    }
}

impl MobileDeviceStoreError {
    fn storage(source: impl Error + Send + Sync + 'static) -> Self {
        Self::Storage(Box::new(source))
    }
}

async fn receive<T>(
    result: oneshot::Receiver<Result<T, MobileDeviceStoreError>>,
) -> Result<T, MobileDeviceStoreError> {
    result
        .await
        .map_err(|_| MobileDeviceStoreError::WorkerUnavailable)?
}

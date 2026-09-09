mod ceremony;
mod store;

use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{SystemTime, SystemTimeError, UNIX_EPOCH};

use base64::Engine;
use ceremony::CeremonyError;
use serde::Serialize;
use thiserror::Error;

pub(crate) use ceremony::CeremonyResponse;
use store::{DangerousCredential, DangerousCredentialError};
pub(crate) use store::{
    DangerousCredentialMailbox, DangerousCredentialMailboxClosed, DangerousCredentialRequest,
    DangerousCredentialStore, DangerousCredentialWorker,
};

const CHALLENGE_TTL_MS: i64 = 2 * 60 * 1_000;
const GRANT_TTL_MS: i64 = 30 * 1_000;
const MAX_GRANTS: usize = 1_024;
const MAX_PENDING_CEREMONIES: usize = 1_024;

#[derive(Clone)]
pub(crate) struct DangerousApprovalAuthority {
    allowed_origins: Arc<HashSet<String>>,
    state: Arc<Mutex<ApprovalState>>,
    store: DangerousCredentialStore,
}

#[derive(Default)]
struct ApprovalState {
    grants: HashMap<String, i64>,
    pending: HashMap<String, PendingCeremony>,
}

struct PendingCeremony {
    challenge: String,
    expires_at: i64,
    operation: Option<String>,
    user_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DangerousApprovalStatus {
    pub(crate) configured: bool,
    pub(crate) credential_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BeginApprovalResult {
    pub(crate) challenge: String,
    pub(crate) request_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BeginRegistrationResult {
    pub(crate) challenge: String,
    pub(crate) request_id: String,
    pub(crate) user_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FinishApprovalResult {
    pub(crate) approved_until: i64,
}

#[derive(Debug, Error)]
pub(crate) enum DangerousApprovalError {
    #[error("dangerous_approval_assertion_invalid")]
    AssertionInvalid,
    #[error(transparent)]
    Ceremony(#[from] CeremonyError),
    #[error("dangerous_approval_challenge_invalid")]
    ChallengeInvalid,
    #[error("dangerous approval clock failed: {0}")]
    Clock(#[from] SystemTimeError),
    #[error("dangerous_approval_not_configured")]
    NotConfigured,
    #[error("dangerous_approval_operation_invalid")]
    OperationInvalid,
    #[error("dangerous approval random generation failed: {0}")]
    Random(#[from] getrandom::Error),
    #[error("dangerous_approval_registration_invalid")]
    RegistrationInvalid,
    #[error("dangerous_approval_required")]
    Required,
    #[error(transparent)]
    Store(#[from] DangerousCredentialError),
}

impl DangerousApprovalAuthority {
    pub(crate) fn new(store: DangerousCredentialStore, allowed_origins: HashSet<String>) -> Self {
        Self {
            allowed_origins: Arc::new(allowed_origins),
            state: Arc::new(Mutex::new(ApprovalState::default())),
            store,
        }
    }

    pub(crate) async fn status(&self) -> Result<DangerousApprovalStatus, DangerousApprovalError> {
        let credential = self.store.read().await?;
        Ok(DangerousApprovalStatus {
            configured: credential.is_some(),
            credential_id: credential.map(|credential| credential.credential_id),
        })
    }

    pub(crate) async fn begin_registration(
        &self,
    ) -> Result<BeginRegistrationResult, DangerousApprovalError> {
        if self.store.read().await?.is_some() {
            self.consume_grant("security.manage-passkey")?;
        }
        let request_id = random_uuid()?;
        let user_id = random_base64_url(16)?;
        let challenge = random_base64_url(32)?;
        self.insert_pending(
            request_id.clone(),
            PendingCeremony {
                challenge: challenge.clone(),
                expires_at: now_millis()? + CHALLENGE_TTL_MS,
                operation: None,
                user_id: Some(user_id.clone()),
            },
        )?;
        Ok(BeginRegistrationResult {
            challenge,
            request_id,
            user_id,
        })
    }

    pub(crate) async fn finish_registration(
        &self,
        request_id: &str,
        response: CeremonyResponse,
    ) -> Result<DangerousApprovalStatus, DangerousApprovalError> {
        let pending = self.take_pending(request_id, None)?;
        let user_id = pending
            .user_id
            .ok_or(DangerousApprovalError::RegistrationInvalid)?;
        let public_key_spki = response
            .public_key_spki
            .clone()
            .filter(|value| !value.is_empty())
            .ok_or(DangerousApprovalError::RegistrationInvalid)?;
        if response
            .authenticator_data
            .as_deref()
            .is_none_or(str::is_empty)
        {
            return Err(DangerousApprovalError::RegistrationInvalid);
        }
        ceremony::validate_registration(&response, &pending.challenge, &self.allowed_origins)?;
        self.store
            .save(
                DangerousCredential {
                    credential_id: response.credential_id,
                    public_key_spki,
                    user_id,
                },
                now_millis()?,
            )
            .await?;
        self.status().await
    }

    pub(crate) async fn begin_approval(
        &self,
        operation: String,
    ) -> Result<BeginApprovalResult, DangerousApprovalError> {
        validate_operation(&operation)?;
        if self.store.read().await?.is_none() {
            return Err(DangerousApprovalError::NotConfigured);
        }
        let request_id = random_uuid()?;
        let challenge = random_base64_url(32)?;
        self.insert_pending(
            request_id.clone(),
            PendingCeremony {
                challenge: challenge.clone(),
                expires_at: now_millis()? + CHALLENGE_TTL_MS,
                operation: Some(operation),
                user_id: None,
            },
        )?;
        Ok(BeginApprovalResult {
            challenge,
            request_id,
        })
    }

    pub(crate) async fn finish_approval(
        &self,
        request_id: &str,
        operation: &str,
        response: CeremonyResponse,
    ) -> Result<FinishApprovalResult, DangerousApprovalError> {
        validate_operation(operation)?;
        let pending = self.take_pending(request_id, Some(operation))?;
        let credential = self
            .store
            .read()
            .await?
            .filter(|credential| credential.credential_id == response.credential_id)
            .ok_or(DangerousApprovalError::AssertionInvalid)?;
        if response
            .authenticator_data
            .as_deref()
            .is_none_or(str::is_empty)
            || response.signature.as_deref().is_none_or(str::is_empty)
        {
            return Err(DangerousApprovalError::AssertionInvalid);
        }
        ceremony::validate_assertion(
            &response,
            &pending.challenge,
            &self.allowed_origins,
            &credential.public_key_spki,
        )?;
        let now = now_millis()?;
        let approved_until = now + GRANT_TTL_MS;
        let mut state = lock(&self.state);
        prune_expired(&mut state.grants, now);
        insert_bounded(
            &mut state.grants,
            operation.to_owned(),
            approved_until,
            MAX_GRANTS,
        );
        Ok(FinishApprovalResult { approved_until })
    }

    pub(crate) async fn consume(&self, operation: &str) -> Result<(), DangerousApprovalError> {
        validate_operation(operation)?;
        if self.store.read().await?.is_none() {
            return Ok(());
        }
        self.consume_grant(operation)
    }

    pub(crate) async fn remove(&self) -> Result<DangerousApprovalStatus, DangerousApprovalError> {
        if self.store.read().await?.is_some() {
            self.consume_grant("security.manage-passkey")?;
        }
        self.store.remove().await?;
        {
            let mut state = lock(&self.state);
            state.grants.clear();
            state.pending.clear();
        }
        self.status().await
    }

    fn consume_grant(&self, operation: &str) -> Result<(), DangerousApprovalError> {
        let now = now_millis()?;
        let expires_at = lock(&self.state).grants.remove(operation).unwrap_or(0);
        if expires_at < now {
            return Err(DangerousApprovalError::Required);
        }
        Ok(())
    }

    fn insert_pending(
        &self,
        request_id: String,
        pending: PendingCeremony,
    ) -> Result<(), DangerousApprovalError> {
        let mut state = lock(&self.state);
        let now = now_millis()?;
        state.pending.retain(|_, entry| entry.expires_at >= now);
        insert_bounded(
            &mut state.pending,
            request_id,
            pending,
            MAX_PENDING_CEREMONIES,
        );
        Ok(())
    }

    fn take_pending(
        &self,
        request_id: &str,
        operation: Option<&str>,
    ) -> Result<PendingCeremony, DangerousApprovalError> {
        let pending = lock(&self.state).pending.remove(request_id);
        let now = now_millis()?;
        pending
            .filter(|pending| {
                pending.expires_at >= now && pending.operation.as_deref() == operation
            })
            .ok_or(DangerousApprovalError::ChallengeInvalid)
    }
}

fn validate_operation(operation: &str) -> Result<(), DangerousApprovalError> {
    if operation == "ritual.enable-archive"
        || operation == "security.manage-passkey"
        || operation.starts_with("terminal.approve:")
    {
        Ok(())
    } else {
        Err(DangerousApprovalError::OperationInvalid)
    }
}

trait Expiring {
    fn expires_at(&self) -> i64;
}

impl Expiring for i64 {
    fn expires_at(&self) -> i64 {
        *self
    }
}

impl Expiring for PendingCeremony {
    fn expires_at(&self) -> i64 {
        self.expires_at
    }
}

fn insert_bounded<T: Expiring>(
    values: &mut HashMap<String, T>,
    key: String,
    value: T,
    limit: usize,
) {
    if values.len() >= limit
        && !values.contains_key(&key)
        && let Some(oldest) = values
            .iter()
            .min_by_key(|(_, value)| value.expires_at())
            .map(|(key, _)| key.clone())
    {
        values.remove(&oldest);
    }
    values.insert(key, value);
}

fn prune_expired(values: &mut HashMap<String, i64>, now: i64) {
    values.retain(|_, expires_at| *expires_at >= now);
}

fn random_base64_url(length: usize) -> Result<String, getrandom::Error> {
    let mut bytes = vec![0_u8; length];
    getrandom::fill(&mut bytes)?;
    Ok(base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes))
}

fn random_uuid() -> Result<String, getrandom::Error> {
    let mut bytes = [0_u8; 16];
    getrandom::fill(&mut bytes)?;
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    Ok(format!(
        "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        bytes[0],
        bytes[1],
        bytes[2],
        bytes[3],
        bytes[4],
        bytes[5],
        bytes[6],
        bytes[7],
        bytes[8],
        bytes[9],
        bytes[10],
        bytes[11],
        bytes[12],
        bytes[13],
        bytes[14],
        bytes[15]
    ))
}

fn now_millis() -> Result<i64, SystemTimeError> {
    let millis = SystemTime::now().duration_since(UNIX_EPOCH)?.as_millis();
    Ok(i64::try_from(millis).unwrap_or(i64::MAX))
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

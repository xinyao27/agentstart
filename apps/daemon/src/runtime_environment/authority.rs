use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};

use base64::Engine as _;
use base64::engine::general_purpose::{STANDARD as BASE64, URL_SAFE_NO_PAD};
use chrono::Utc;
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;
use thiserror::Error;

use super::activity::{self, EnvironmentActivity, LAST_ACTIVITY_GRANULARITY_MS};
use super::authorization::RuntimeAuthorization;
use super::connections::{RuntimeConnectionLease, RuntimeConnections};
use super::records::{
    AuthorityFile, AuthorizedRuntimePeer, RuntimeEnvironmentProfile, RuntimeEnvironmentSummary,
    StoredEndpoint, StoredEnvironment, StoredPeer, decode_canonical_32, public_environment,
    public_peer, resolve_environment, validate_name,
};
use super::routes::{RuntimeEnvironmentRoute, RuntimeEnvironmentRouteRegistry};
use super::server::RuntimeOutbound;
use super::state_file;
use super::{legacy, offer};
use crate::profiles::{ProfilesAuthority, ProfilesError};
use crate::settings::{SettingsAuthority, SettingsError};
use crate::transport::secure_file;

#[derive(Clone)]
pub(crate) struct RuntimeEnvironmentAuthority {
    inner: Arc<AuthorityState>,
}

struct AuthorityState {
    active_endpoint: RwLock<Option<String>>,
    activity: EnvironmentActivity,
    connections: RuntimeConnections,
    file: RwLock<AuthorityFile>,
    mutation: Arc<tokio::sync::Mutex<()>>,
    path: PathBuf,
    routes: RuntimeEnvironmentRouteRegistry,
}

enum Mutation<T> {
    Changed(T),
    Unchanged(T),
}

pub(crate) struct GeneratedRuntimeOffer {
    pub(crate) endpoint: String,
    pub(crate) pairing_offer: String,
    pub(crate) peer_id: String,
}

#[derive(Debug, Error)]
pub(crate) enum RuntimeEnvironmentError {
    #[error("runtime environment address is invalid")]
    AddressInvalid,
    #[error("runtime environment connection capacity reached")]
    ConnectionCapacity,
    #[error("runtime environment state committed but durability confirmation failed: {0}")]
    CommittedSecureFile(secure_file::SecureFileError),
    #[error("runtime environment already exists: {0}")]
    Duplicate(String),
    #[error("runtime environment endpoint is invalid")]
    EndpointInvalid,
    #[error("runtime environment installation migration found conflicting profile authorities")]
    InstallationConflict,
    #[error("runtime environment selector is ambiguous: {0}")]
    EnvironmentAmbiguous(String),
    #[error("runtime environment not found: {0}")]
    EnvironmentNotFound(String),
    #[error("runtime environment state is invalid")]
    InvalidState,
    #[error("runtime environment I/O failed: {0}")]
    Io(#[from] std::io::Error),
    #[error("Legacy runtime environment data is invalid; original pairing files were preserved")]
    LegacyInvalid,
    #[error("Legacy runtime environment records conflict; original pairing files were preserved")]
    LegacyConflict,
    #[error("Runtime environment requires re-pairing")]
    PairingRequired,
    #[error("runtime environment name is invalid")]
    NameInvalid,
    #[error("runtime environment offer is invalid")]
    OfferInvalid,
    #[error("authorized runtime peer not found: {0}")]
    PeerNotFound(String),
    #[error("runtime environment random source failed: {0}")]
    Random(#[from] getrandom::Error),
    #[error("runtime environment serialization failed: {0}")]
    Serialization(#[from] serde_json::Error),
    #[error("runtime environment secure file operation failed: {0}")]
    SecureFile(#[from] secure_file::SecureFileError),
    #[error("runtime environment settings cleanup failed: {0}")]
    Settings(#[from] SettingsError),
    #[error("runtime environment profile cleanup failed: {0}")]
    Profiles(#[from] ProfilesError),
    #[error(
        "runtime environment removal committed but durability confirmation failed: {durability}; settings cleanup also failed: {cleanup}"
    )]
    RemovalCommittedCleanup {
        durability: secure_file::SecureFileError,
        cleanup: Box<RuntimeEnvironmentError>,
    },
    #[error("runtime environment state exceeds its secure storage limit")]
    StateCapacity,
    #[error("runtime environment background operation failed: {0}")]
    Task(#[from] tokio::task::JoinError),
}

#[derive(Debug, Error)]
pub(crate) enum RuntimeEnvironmentRouteError {
    #[error(transparent)]
    Environment(#[from] RuntimeEnvironmentError),
    #[error(transparent)]
    Peer(#[from] crate::transport::ProtocolPeerError),
}

impl RuntimeEnvironmentAuthority {
    pub(crate) async fn open(root: &Path) -> Result<Self, RuntimeEnvironmentError> {
        let root = root.to_owned();
        let (path, file) =
            tokio::task::spawn_blocking(move || state_file::load_or_create(&root)).await??;
        let activity = EnvironmentActivity::seeded(&file.environments);
        Ok(Self {
            inner: Arc::new(AuthorityState {
                active_endpoint: RwLock::new(None),
                activity,
                connections: RuntimeConnections::new(),
                file: RwLock::new(file),
                mutation: Arc::new(tokio::sync::Mutex::new(())),
                path,
                routes: RuntimeEnvironmentRouteRegistry::new(),
            }),
        })
    }

    pub(crate) fn activate_endpoint(&self, endpoint: String) {
        *write_lock(&self.inner.active_endpoint) = Some(endpoint);
    }

    pub(crate) fn connections(&self) -> RuntimeConnections {
        self.inner.connections.clone()
    }

    pub(crate) fn public_key_b64(&self) -> String {
        read_lock(&self.inner.file).keypair.public_key_b64.clone()
    }

    pub(crate) fn secret_key(&self) -> Result<[u8; 32], RuntimeEnvironmentError> {
        decode_canonical_32(&read_lock(&self.inner.file).keypair.secret_key_b64)
    }

    pub(crate) async fn generate_offer(
        &self,
        name: &str,
        address: &str,
        endpoint: Option<&str>,
    ) -> Result<GeneratedRuntimeOffer, RuntimeEnvironmentError> {
        let name = validate_name(name)?;
        let active_endpoint = read_lock(&self.inner.active_endpoint)
            .clone()
            .ok_or(RuntimeEnvironmentError::EndpointInvalid)?;
        let endpoint = offer::public_endpoint(&active_endpoint, address, endpoint)?;
        let peer_id = random_id()?;
        let token = random_token()?;
        let token_hash_b64 = token_hash(&token);
        let created_at_unix_ms = now_ms();
        let stored_peer_id = peer_id.clone();
        let pairing_offer = offer::encode(&endpoint, &token, &self.public_key_b64())?;
        self.mutate(move |file| {
            if file.peers.iter().any(|peer| peer.id == stored_peer_id) {
                return Err(RuntimeEnvironmentError::Duplicate(stored_peer_id));
            }
            file.peers.push(StoredPeer {
                created_at_unix_ms,
                id: stored_peer_id,
                last_seen_at_unix_ms: None,
                name: name.clone(),
                token_hash_b64,
            });
            Ok(Mutation::Changed(()))
        })
        .await?;
        Ok(GeneratedRuntimeOffer {
            endpoint,
            pairing_offer,
            peer_id,
        })
    }

    pub(crate) async fn import(
        &self,
        name: &str,
        pairing_offer: &str,
        replace_environment_id: Option<&str>,
    ) -> Result<RuntimeEnvironmentProfile, RuntimeEnvironmentError> {
        let name = validate_name(name)?;
        let offer = offer::decode(pairing_offer)?;
        let replacement = replace_environment_id
            .map(|id| self.pending_legacy(id))
            .transpose()?;
        let id = replacement
            .as_ref()
            .map(|old| old.id.clone())
            .map_or_else(random_id, Ok)?;
        let replacement_id = replacement.as_ref().map(|old| old.id.clone());
        let endpoint_id = format!("ws-{id}");
        let now = now_ms();
        let environment = StoredEnvironment {
            created_at_unix_ms: replacement
                .as_ref()
                .map_or(now, |old| old.created_at_unix_ms),
            endpoints: vec![StoredEndpoint {
                endpoint: offer.endpoint,
                id: endpoint_id.clone(),
                label: "WebSocket".to_owned(),
                pinned_public_key_b64: offer.public_key_b64,
                token: offer.token,
            }],
            id,
            last_used_at_unix_ms: None,
            name: name.clone(),
            preferred_endpoint_id: endpoint_id,
            runtime_id: None,
            updated_at_unix_ms: now,
        };
        let stored_environment = environment.clone();
        self.mutate(move |file| {
            if replacement_id
                .as_ref()
                .is_some_and(|id| file.resolved_legacy_environment_ids.contains(id))
            {
                return Err(RuntimeEnvironmentError::EnvironmentNotFound(
                    stored_environment.id.clone(),
                ));
            }
            if file
                .environments
                .iter()
                .any(|candidate| candidate.id == stored_environment.id)
            {
                return Err(RuntimeEnvironmentError::Duplicate(
                    stored_environment.id.clone(),
                ));
            }
            if file
                .environments
                .iter()
                .any(|candidate| candidate.name == stored_environment.name)
            {
                return Err(RuntimeEnvironmentError::Duplicate(name.clone()));
            }
            if let Some(id) = replacement_id {
                file.resolved_legacy_environment_ids.push(id);
            }
            file.environments.push(stored_environment);
            Ok(Mutation::Changed(()))
        })
        .await?;
        public_environment(&environment)
    }

    pub(crate) fn list(&self) -> Result<Vec<RuntimeEnvironmentSummary>, RuntimeEnvironmentError> {
        let file = read_lock(&self.inner.file).clone();
        let mut environments = file
            .environments
            .iter()
            .map(|environment| public_environment(environment).map(Into::into))
            .collect::<Result<Vec<RuntimeEnvironmentSummary>, _>>()?;
        environments.extend(self.legacy_from_snapshot(&file)?);
        environments.sort_by(|left, right| left.name.cmp(&right.name).then(left.id.cmp(&right.id)));
        Ok(environments)
    }

    pub(crate) fn resolve(
        &self,
        selector: &str,
    ) -> Result<RuntimeEnvironmentProfile, RuntimeEnvironmentError> {
        let selected = {
            let file = read_lock(&self.inner.file);
            resolve_environment(&file.environments, selector).and_then(public_environment)
        };
        if matches!(
            &selected,
            Err(RuntimeEnvironmentError::EnvironmentNotFound(_))
        ) {
            match self.pending_legacy(selector) {
                Ok(_) => return Err(RuntimeEnvironmentError::PairingRequired),
                Err(RuntimeEnvironmentError::EnvironmentNotFound(_)) => {}
                Err(error) => return Err(error),
            }
        }
        selected
    }

    fn legacy_environments(
        &self,
    ) -> Result<Vec<RuntimeEnvironmentSummary>, RuntimeEnvironmentError> {
        let file = read_lock(&self.inner.file).clone();
        self.legacy_from_snapshot(&file)
    }

    fn legacy_from_snapshot(
        &self,
        file: &AuthorityFile,
    ) -> Result<Vec<RuntimeEnvironmentSummary>, RuntimeEnvironmentError> {
        let ids = file.environments.iter().map(|e| e.id.clone()).collect();
        let root = self
            .inner
            .path
            .parent()
            .ok_or(RuntimeEnvironmentError::InvalidState)?;
        legacy::list(root, &file.resolved_legacy_environment_ids, &ids)
    }

    fn pending_legacy(
        &self,
        selector: &str,
    ) -> Result<RuntimeEnvironmentSummary, RuntimeEnvironmentError> {
        self.legacy_environments()?
            .into_iter()
            .find(|e| e.id == selector)
            .ok_or_else(|| RuntimeEnvironmentError::EnvironmentNotFound(selector.to_owned()))
    }

    pub(crate) async fn remove(
        &self,
        selector: &str,
        settings: &SettingsAuthority,
        profiles: &ProfilesAuthority,
    ) -> Result<RuntimeEnvironmentSummary, RuntimeEnvironmentError> {
        let selector = selector.to_owned();
        let pending = match self.resolve(&selector) {
            Ok(_) => None,
            Err(RuntimeEnvironmentError::PairingRequired) => Some(self.pending_legacy(&selector)?),
            Err(error) => return Err(error),
        };
        let environment_id = pending
            .as_ref()
            .map(|e| e.id.clone())
            .map_or_else(|| self.resolve(&selector).map(|e| e.id), Ok)?;
        let removal = self
            .mutate(move |file| {
                if let Some(pending) = pending {
                    if file.environments.iter().any(|e| e.id == pending.id)
                        || file.resolved_legacy_environment_ids.contains(&pending.id)
                    {
                        return Err(RuntimeEnvironmentError::EnvironmentNotFound(
                            selector.clone(),
                        ));
                    }
                    file.resolved_legacy_environment_ids
                        .push(pending.id.clone());
                    if !file
                        .pending_active_environment_cleanup_ids
                        .contains(&pending.id)
                    {
                        file.pending_active_environment_cleanup_ids
                            .push(pending.id.clone());
                    }
                    return Ok(Mutation::Changed(pending));
                }
                let selected = resolve_environment(&file.environments, &selector)?
                    .id
                    .clone();
                let index = file
                    .environments
                    .iter()
                    .position(|environment| environment.id == selected)
                    .ok_or_else(|| {
                        RuntimeEnvironmentError::EnvironmentNotFound(selector.clone())
                    })?;
                let removed = public_environment(&file.environments.remove(index))?.into();
                if !file
                    .pending_active_environment_cleanup_ids
                    .contains(&selected)
                {
                    file.pending_active_environment_cleanup_ids.push(selected);
                }
                Ok(Mutation::Changed(removed))
            })
            .await;
        let removed = match removal {
            Ok(removed) => removed,
            Err(RuntimeEnvironmentError::CommittedSecureFile(durability)) => {
                self.inner.routes.disconnect(&environment_id).await;
                self.inner.activity.forget(&environment_id);
                return match self.recover_settings_cleanup(settings, profiles).await {
                    Ok(()) => Err(RuntimeEnvironmentError::CommittedSecureFile(durability)),
                    Err(cleanup) => Err(RuntimeEnvironmentError::RemovalCommittedCleanup {
                        durability,
                        cleanup: Box::new(cleanup),
                    }),
                };
            }
            Err(error) => return Err(error),
        };
        self.inner.routes.disconnect(&environment_id).await;
        self.inner.activity.forget(&environment_id);
        self.recover_settings_cleanup(settings, profiles).await?;
        Ok(removed)
    }

    pub(crate) async fn disconnect(
        &self,
        selector: &str,
    ) -> Result<RuntimeEnvironmentProfile, RuntimeEnvironmentError> {
        let environment = self.resolve(selector)?;
        self.inner.routes.disconnect(&environment.id).await;
        Ok(environment)
    }

    pub(crate) async fn route(
        &self,
        environment_id: &str,
    ) -> Result<RuntimeEnvironmentRoute, RuntimeEnvironmentRouteError> {
        let environment = self.resolve(environment_id)?;
        if environment.id != environment_id {
            return Err(
                RuntimeEnvironmentError::EnvironmentNotFound(environment_id.to_owned()).into(),
            );
        }
        let route = self.inner.routes.connect(&environment).await?;
        self.note_environment_status(&environment.id, route.runtime_id())
            .await?;
        Ok(route)
    }

    pub(crate) async fn recover_settings_cleanup(
        &self,
        settings: &SettingsAuthority,
        profiles: &ProfilesAuthority,
    ) -> Result<(), RuntimeEnvironmentError> {
        let pending = read_lock(&self.inner.file)
            .pending_active_environment_cleanup_ids
            .clone();
        if pending.is_empty() {
            return Ok(());
        }
        let settings_cleanup = settings.clear_active_runtime_environments(&pending).await?;
        let profile_cleanup = profiles.clone();
        let profile_pending = pending.clone();
        tokio::task::spawn_blocking(move || {
            profile_cleanup.clear_active_runtime_environments(&profile_pending)
        })
        .await??;
        let result = self
            .mutate(move |file| {
                let previous_len = file.pending_active_environment_cleanup_ids.len();
                file.pending_active_environment_cleanup_ids
                    .retain(|environment_id| !pending.contains(environment_id));
                if file.pending_active_environment_cleanup_ids.len() == previous_len {
                    Ok(Mutation::Unchanged(()))
                } else {
                    Ok(Mutation::Changed(()))
                }
            })
            .await;
        drop(settings_cleanup);
        result
    }

    pub(crate) fn list_peers(&self) -> Vec<AuthorizedRuntimePeer> {
        let mut peers = read_lock(&self.inner.file)
            .peers
            .iter()
            .map(public_peer)
            .collect::<Vec<_>>();
        peers.sort_by(|left, right| left.name.cmp(&right.name).then(left.id.cmp(&right.id)));
        peers
    }

    pub(crate) async fn revoke_peer(
        &self,
        peer_id: &str,
    ) -> Result<AuthorizedRuntimePeer, RuntimeEnvironmentError> {
        let peer_id = peer_id.to_owned();
        let connections = self.inner.connections.clone();
        self.mutate_committed(
            move |file| {
                let index = file
                    .peers
                    .iter()
                    .position(|peer| peer.id == peer_id)
                    .ok_or_else(|| RuntimeEnvironmentError::PeerNotFound(peer_id.clone()))?;
                Ok(Mutation::Changed(public_peer(&file.peers.remove(index))))
            },
            move |peer| connections.revoke_peer(&peer.id),
        )
        .await
    }

    pub(crate) fn authenticate(&self, token: &str) -> Option<RuntimeAuthorization> {
        let received = Sha256::digest(token.as_bytes());
        let file = read_lock(&self.inner.file);
        file.peers.iter().find_map(|peer| {
            let expected = BASE64.decode(&peer.token_hash_b64).ok()?;
            (expected.len() == received.len()
                && bool::from(expected.as_slice().ct_eq(received.as_slice())))
            .then(|| RuntimeAuthorization::new(self.clone(), peer.id.clone()))
        })
    }

    pub(crate) async fn register_connection(
        &self,
        authorization: &RuntimeAuthorization,
        connection_id: String,
        outbound: RuntimeOutbound,
    ) -> Result<RuntimeConnectionLease, RuntimeEnvironmentError> {
        let _guard = self.inner.mutation.lock().await;
        if !authorization.belongs_to(self)
            || !read_lock(&self.inner.file)
                .peers
                .iter()
                .any(|peer| peer.id == authorization.peer_id())
        {
            return Err(RuntimeEnvironmentError::PeerNotFound(
                authorization.peer_id().to_owned(),
            ));
        }
        self.inner
            .connections
            .register(connection_id, authorization.peer_id().to_owned(), outbound)
            .map_err(|()| RuntimeEnvironmentError::ConnectionCapacity)
    }

    pub(crate) async fn note_environment_status(
        &self,
        environment_id: &str,
        runtime_id: &str,
    ) -> Result<(), RuntimeEnvironmentError> {
        let now = now_ms();
        // Why: routed calls re-note activity on every request, so a still-current record has to
        // answer here instead of paying the mutation lock, the blocking pool and a document clone.
        let Some(claim) = self.inner.activity.claim(environment_id, runtime_id, now) else {
            return Ok(());
        };
        let claimed_id = environment_id.to_owned();
        let claimed_runtime_id = runtime_id.to_owned();
        let recorded = self
            .mutate(move |file| {
                let environment = file
                    .environments
                    .iter_mut()
                    .find(|environment| environment.id == claimed_id)
                    .ok_or_else(|| {
                        RuntimeEnvironmentError::EnvironmentNotFound(claimed_id.clone())
                    })?;
                if !activity::observed(environment).is_stale(&claimed_runtime_id, now) {
                    return Ok(Mutation::Unchanged(activity::observed(environment)));
                }
                Ok(Mutation::Changed(activity::record(
                    environment,
                    &claimed_runtime_id,
                    now,
                )))
            })
            .await;
        match recorded {
            Ok(recorded) => {
                claim.settle(recorded);
                Ok(())
            }
            // Why: an unpersisted transition must stay visible to the next caller, including the
            // committed-but-unconfirmed case whose durability was never proven.
            Err(error) => {
                claim.rollback();
                Err(error)
            }
        }
    }

    async fn mutate<T, F>(&self, mutation: F) -> Result<T, RuntimeEnvironmentError>
    where
        F: FnOnce(&mut AuthorityFile) -> Result<Mutation<T>, RuntimeEnvironmentError>
            + Send
            + 'static,
        T: Send + 'static,
    {
        self.mutate_committed(mutation, |_| {}).await
    }

    async fn mutate_committed<T, F, C>(
        &self,
        mutation: F,
        committed: C,
    ) -> Result<T, RuntimeEnvironmentError>
    where
        F: FnOnce(&mut AuthorityFile) -> Result<Mutation<T>, RuntimeEnvironmentError>
            + Send
            + 'static,
        C: FnOnce(&T) + Send + 'static,
        T: Send + 'static,
    {
        let inner = self.inner.clone();
        let mutation_guard = inner.mutation.clone().lock_owned().await;
        tokio::task::spawn_blocking(move || {
            let _guard = mutation_guard;
            let mut next = read_lock(&inner.file).clone();
            let result = match mutation(&mut next)? {
                Mutation::Changed(result) => result,
                Mutation::Unchanged(result) => return Ok(result),
            };
            let contents = state_file::serialize(&next)?;
            let durability_error = match secure_file::write_bytes_committing(&inner.path, &contents)
            {
                Ok(()) => None,
                Err(secure_file::SecureFileCommitError::BeforeCommit(error)) => {
                    return Err(RuntimeEnvironmentError::SecureFile(error));
                }
                Err(secure_file::SecureFileCommitError::Committed(error)) => Some(error),
            };
            *write_lock(&inner.file) = next;
            committed(&result);
            match durability_error {
                Some(error) => Err(RuntimeEnvironmentError::CommittedSecureFile(error)),
                None => Ok(result),
            }
        })
        .await?
    }

    pub(super) fn is_same_authority(&self, other: &Self) -> bool {
        Arc::ptr_eq(&self.inner, &other.inner)
    }

    pub(super) fn peer_is_authorized(&self, peer_id: &str) -> bool {
        read_lock(&self.inner.file)
            .peers
            .iter()
            .any(|peer| peer.id == peer_id)
    }

    pub(super) async fn note_peer_seen(
        &self,
        peer_id: &str,
    ) -> Result<(), RuntimeEnvironmentError> {
        let peer_id = peer_id.to_owned();
        let now = now_ms();
        self.mutate(move |file| {
            let peer = file
                .peers
                .iter_mut()
                .find(|peer| peer.id == peer_id)
                .ok_or_else(|| RuntimeEnvironmentError::PeerNotFound(peer_id.clone()))?;
            if peer.last_seen_at_unix_ms.is_some_and(|last_seen| {
                now.saturating_sub(last_seen) < LAST_ACTIVITY_GRANULARITY_MS
            }) {
                return Ok(Mutation::Unchanged(()));
            }
            peer.last_seen_at_unix_ms = Some(now.max(peer.created_at_unix_ms));
            Ok(Mutation::Changed(()))
        })
        .await
        .map(|_| ())
    }
}

fn random_id() -> Result<String, RuntimeEnvironmentError> {
    let mut bytes = [0_u8; 16];
    getrandom::fill(&mut bytes)?;
    Ok(bytes
        .into_iter()
        .map(|byte| format!("{byte:02x}"))
        .collect())
}

fn random_token() -> Result<String, RuntimeEnvironmentError> {
    let mut bytes = [0_u8; 32];
    getrandom::fill(&mut bytes)?;
    Ok(URL_SAFE_NO_PAD.encode(bytes))
}

fn token_hash(token: &str) -> String {
    BASE64.encode(Sha256::digest(token.as_bytes()))
}

fn now_ms() -> i64 {
    Utc::now().timestamp_millis().max(0)
}

fn read_lock<T>(lock: &RwLock<T>) -> std::sync::RwLockReadGuard<'_, T> {
    lock.read()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

fn write_lock<T>(lock: &RwLock<T>) -> std::sync::RwLockWriteGuard<'_, T> {
    lock.write()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

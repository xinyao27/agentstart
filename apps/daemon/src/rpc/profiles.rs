pub(in crate::rpc) mod protocol;
pub(in crate::rpc) mod protocol_values;

use serde_json::Value;
use thiserror::Error;

use crate::profiles::{ProfilesAuthority, ProfilesError};
use crate::settings::{SettingsAuthority, SettingsError};

#[derive(Clone)]
pub(super) struct ProfilesRpc {
    profiles: ProfilesAuthority,
    settings: SettingsAuthority,
}

#[derive(Debug, Error)]
pub(super) enum ProfilesRpcError {
    #[error("invalid_yiru_profile_input")]
    InvalidInput,
    #[error(transparent)]
    Profile(#[from] ProfilesError),
    #[error(transparent)]
    Settings(#[from] SettingsError),
    #[error("profile worker failed: {0}")]
    Worker(#[from] tokio::task::JoinError),
}

impl ProfilesRpc {
    pub(super) fn new(profiles: ProfilesAuthority, settings: SettingsAuthority) -> Self {
        Self { profiles, settings }
    }

    // Why: these typed wrappers carry the whole profile operation including its
    // settings flushes and blocking-worker hops, so the protobuf surface executes
    // one shared path that keeps switch/transfer settings flushes and the
    // telemetry seed on the authority.
    pub(super) async fn list_profiles(&self) -> Result<Value, ProfilesRpcError> {
        let profiles = self.profiles.clone();
        Ok(tokio::task::spawn_blocking(move || profiles.list()).await??)
    }

    pub(super) async fn create_local(
        &self,
        name: Option<String>,
    ) -> Result<Value, ProfilesRpcError> {
        let telemetry = self.settings.get().get("telemetry").cloned();
        let profiles = self.profiles.clone();
        Ok(tokio::task::spawn_blocking(move || {
            profiles.create(name.as_deref(), telemetry.as_ref())
        })
        .await??)
    }

    pub(super) async fn switch_profile(
        &self,
        profile_id: String,
    ) -> Result<Value, ProfilesRpcError> {
        self.settings.flush().await?;
        let profiles = self.profiles.clone();
        Ok(tokio::task::spawn_blocking(move || profiles.switch(&profile_id)).await??)
    }

    pub(super) async fn transfer_project(
        &self,
        source_profile_id: String,
        target_profile_id: String,
        repo_id: String,
        mode: String,
    ) -> Result<Value, ProfilesRpcError> {
        if !matches!(mode.as_str(), "move" | "copy") {
            return Err(ProfilesRpcError::InvalidInput);
        }
        self.settings.flush().await?;
        let profiles = self.profiles.clone();
        Ok(tokio::task::spawn_blocking(move || {
            profiles.transfer(&source_profile_id, &target_profile_id, &repo_id, &mode)
        })
        .await??)
    }

    pub(super) async fn find_project_profiles(
        &self,
        path: String,
        connection_id: Option<String>,
        execution_host_id: Option<String>,
        exclude_profile_id: Option<String>,
    ) -> Result<Value, ProfilesRpcError> {
        if execution_host_id
            .as_deref()
            .is_some_and(|host| !valid_host_id(host))
        {
            return Err(ProfilesRpcError::InvalidInput);
        }
        let profiles = self.profiles.clone();
        Ok(tokio::task::spawn_blocking(move || {
            profiles.find_projects(
                &path,
                connection_id.as_deref(),
                execution_host_id.as_deref(),
                exclude_profile_id.as_deref(),
            )
        })
        .await??)
    }
}

// Why: the wire accepts host ids in the daemon's execution-host scheme, so the
// protobuf handler reuses this predicate and cannot admit an id shape the
// legacy surface rejects.
pub(super) fn valid_host_id(value: &str) -> bool {
    value == "local"
        || ["ssh:", "wsl:", "runtime:"].iter().any(|prefix| {
            value
                .strip_prefix(prefix)
                .is_some_and(|suffix| !suffix.is_empty())
        })
}

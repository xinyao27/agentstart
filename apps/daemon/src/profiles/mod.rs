mod index;
mod leaf_file;
mod legacy;
mod projects;
mod restart;
mod storage;
mod transfer;

use std::path::{Path, PathBuf};

use serde_json::Value;
use thiserror::Error;

pub(crate) use index::ProfileError;
use restart::RestartError;
use transfer::TransferError;

#[derive(Clone)]
pub(crate) struct ProfilesAuthority {
    root: PathBuf,
}

#[derive(Debug, Error)]
pub(crate) enum ProfilesError {
    #[error(transparent)]
    Profile(#[from] ProfileError),
    #[error(transparent)]
    Restart(#[from] RestartError),
    #[error(transparent)]
    Transfer(#[from] TransferError),
}

impl ProfilesAuthority {
    pub(crate) fn open(root: PathBuf) -> Result<(Self, PathBuf), ProfilesError> {
        let active_directory = storage::ensure_active(&root)?;
        Ok((Self { root }, active_directory))
    }

    pub(crate) fn list(&self) -> Result<Value, ProfilesError> {
        Ok(index::list_value(&index::load(&self.root)?))
    }

    pub(crate) fn create(
        &self,
        name: Option<&str>,
        telemetry: Option<&Value>,
    ) -> Result<Value, ProfilesError> {
        let result = index::create(&self.root, name)?;
        if let (Some(profile_id), Some(telemetry)) = (
            result.pointer("/profile/id").and_then(Value::as_str),
            telemetry,
        ) {
            seed_telemetry(&self.root, profile_id, telemetry)?;
        }
        Ok(result)
    }

    pub(crate) fn switch(&self, profile_id: &str) -> Result<Value, ProfilesError> {
        if !index::activate(&self.root, profile_id)? {
            return Ok(serde_json::json!({ "status": "already-active" }));
        }
        restart::request()?;
        Ok(serde_json::json!({ "status": "relaunching" }))
    }

    pub(crate) fn find_projects(
        &self,
        path: &str,
        connection_id: Option<&str>,
        execution_host_id: Option<&str>,
        exclude_profile_id: Option<&str>,
    ) -> Result<Value, ProfilesError> {
        projects::find(
            &self.root,
            path,
            connection_id,
            execution_host_id,
            exclude_profile_id,
        )
        .map_err(Into::into)
    }

    pub(crate) fn transfer(
        &self,
        source_profile_id: &str,
        target_profile_id: &str,
        repo_id: &str,
        mode: &str,
    ) -> Result<Value, ProfilesError> {
        let result = transfer::project(
            &self.root,
            source_profile_id,
            target_profile_id,
            repo_id,
            mode,
        )?;
        if mode == "move"
            && source_profile_id == index::active_profile_id(&self.root)?
            && result.get("status").and_then(Value::as_str) == Some("transferred")
        {
            index::activate(&self.root, target_profile_id)?;
            restart::request()?;
            let mut result = result.as_object().cloned().unwrap_or_default();
            result.insert("willRelaunch".to_owned(), Value::Bool(true));
            return Ok(Value::Object(result));
        }
        Ok(result)
    }

    pub(crate) fn clear_active_runtime_environments(
        &self,
        environment_ids: &[String],
    ) -> Result<(), ProfilesError> {
        storage::clear_active_runtime_environments(&self.root, environment_ids)?;
        Ok(())
    }
}

fn seed_telemetry(root: &Path, profile_id: &str, telemetry: &Value) -> Result<(), ProfileError> {
    let directory = index::ensure_profile_directory(root, profile_id)?;
    let path = directory.join("yiru-data-settings.json");
    if leaf_file::exists(&path)? {
        return Ok(());
    }
    let payload =
        serde_json::to_vec_pretty(&serde_json::json!({ "settings": { "telemetry": telemetry } }))?;
    leaf_file::write(&path, &payload)?;
    Ok(())
}

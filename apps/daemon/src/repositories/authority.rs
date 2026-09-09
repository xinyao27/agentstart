use std::collections::HashSet;

use serde_json::{Map, Value, json};
use thiserror::Error;
use tokio::sync::oneshot;

use crate::client_events::ClientEventsAuthority;
use crate::host_registry::{HostRegistry, HostRegistryError};
use crate::hosts::{HostCommandError, HostFilesystem, HostFilesystemError};
use crate::project_host_setups::ProjectHostSetupAuthority;
use crate::project_host_setups::ProjectHostSetupError;
use crate::projects::{ProjectCatalog, ProjectCatalogError};

use super::{
    AddInput, RemoveInput, RemoveResult, ReorderInput, ReorderResult, RepositoryList,
    RepositoryRequest, RepositoryResult, SparsePresetSaveInput, UpdateInput,
};

#[derive(Clone)]
pub(crate) struct RepositoryAuthority {
    events: ClientEventsAuthority,
    pub(super) hosts: HostRegistry,
    identities: super::identity_enrichment::IdentityEnrichment,
    pub(super) project_host_setups: ProjectHostSetupAuthority,
    pub(super) projects: ProjectCatalog,
}

#[derive(Debug, Error)]
pub(crate) enum RepositoryError {
    #[error(transparent)]
    Catalog(#[from] ProjectCatalogError),
    #[error(transparent)]
    Command(#[from] HostCommandError),
    #[error(transparent)]
    Filesystem(#[from] HostFilesystemError),
    #[error(transparent)]
    Host(#[from] HostRegistryError),
    #[error(transparent)]
    ProjectHostSetup(#[from] ProjectHostSetupError),
    #[error("{0}")]
    Runtime(String),
    #[error("repository response channel closed")]
    WorkerUnavailable,
}

impl RepositoryAuthority {
    pub(crate) fn new(
        projects: ProjectCatalog,
        hosts: HostRegistry,
        project_host_setups: ProjectHostSetupAuthority,
        events: ClientEventsAuthority,
    ) -> Self {
        Self {
            events,
            hosts,
            identities: super::identity_enrichment::IdentityEnrichment::default(),
            project_host_setups,
            projects,
        }
    }

    pub(crate) async fn list(&self) -> Result<RepositoryList, RepositoryError> {
        let mut list = self.list_all().await?;
        list.repos.retain(|repo| repo_host_id(repo) == "local");
        self.identities.schedule(self.clone(), &list.repos);
        Ok(list)
    }

    pub(crate) async fn shutdown(&self) {
        self.identities.shutdown().await;
    }

    async fn list_all(&self) -> Result<RepositoryList, RepositoryError> {
        let (response, result) = oneshot::channel();
        self.projects
            .submit_repository(RepositoryRequest::List { response })
            .await?;
        receive(result).await
    }

    pub(crate) async fn show(&self, selector: String) -> Result<Value, RepositoryError> {
        self.show_on_host("local", selector).await
    }

    pub(crate) async fn show_on_host(
        &self,
        host_id: &str,
        selector: String,
    ) -> Result<Value, RepositoryError> {
        let (response, result) = oneshot::channel();
        self.projects
            .submit_repository(RepositoryRequest::Show {
                host_id: host_id.to_owned(),
                selector,
                response,
            })
            .await?;
        receive(result).await
    }

    pub(crate) async fn update(
        &self,
        expected_revision: i64,
        selector: String,
        updates: Map<String, Value>,
    ) -> Result<RepositoryResult, RepositoryError> {
        let mutation_guard = self.projects.mutation_guard().await;
        let worktree_base_changed = updates.contains_key("worktreeBasePath");
        let (response, result) = oneshot::channel();
        self.projects
            .submit_repository(RepositoryRequest::Update {
                input: UpdateInput {
                    expected_revision,
                    host_id: "local".to_owned(),
                    selector,
                    updates,
                },
                response,
            })
            .await?;
        let result = receive(result).await?;
        drop(mutation_guard);
        if worktree_base_changed
            && result.repo.get("kind").and_then(Value::as_str) == Some("git")
            && let Some(base) = result.repo.get("worktreeBasePath").and_then(Value::as_str)
            && let Some(path) = result.repo.get("path").and_then(Value::as_str)
            && let Ok(host) = self.hosts.execution_host(repo_host_id(&result.repo)).await
        {
            crate::project_host_setups::host_effects::prepare_worktree_root(host, path, base).await;
        }
        self.events.publish_repos_changed();
        Ok(result)
    }

    pub(crate) async fn remove(
        &self,
        expected_revision: i64,
        selector: String,
    ) -> Result<RemoveResult, RepositoryError> {
        let mutation_guard = self.projects.mutation_guard().await;
        let (response, result) = oneshot::channel();
        self.projects
            .submit_repository(RepositoryRequest::Remove {
                input: RemoveInput {
                    expected_revision,
                    host_id: "local".to_owned(),
                    selector,
                },
                response,
            })
            .await?;
        let mutation = receive(result).await?;
        drop(mutation_guard);
        self.events.publish_repos_changed();
        for cleanup in mutation.cleanups {
            self.project_host_setups.replay_cleanup(cleanup).await?;
        }
        Ok(mutation.result)
    }

    pub(crate) async fn reorder(
        &self,
        expected_revision: i64,
        ordered_ids: Vec<String>,
    ) -> Result<ReorderResult, RepositoryError> {
        let _mutation = self.projects.mutation_guard().await;
        let (response, result) = oneshot::channel();
        self.projects
            .submit_repository(RepositoryRequest::Reorder {
                input: ReorderInput {
                    expected_revision,
                    ordered_ids,
                },
                response,
            })
            .await?;
        let result = receive(result).await?;
        if result.status == super::ReorderStatus::Applied {
            self.events.publish_repos_changed();
        }
        Ok(result)
    }

    pub(crate) async fn list_sparse_presets(
        &self,
        selector: String,
    ) -> Result<Vec<Value>, RepositoryError> {
        let (response, result) = oneshot::channel();
        self.projects
            .submit_repository(RepositoryRequest::ListSparsePresets {
                host_id: "local".to_owned(),
                selector,
                response,
            })
            .await?;
        receive(result).await
    }

    pub(crate) async fn save_sparse_preset(
        &self,
        mut input: SparsePresetSaveInput,
    ) -> Result<Value, RepositoryError> {
        input.name = normalize_preset_name(&input.name)?;
        input.directories = normalize_preset_directories(input.directories)?;
        let (response, result) = oneshot::channel();
        self.projects
            .submit_repository(RepositoryRequest::SaveSparsePreset { input, response })
            .await?;
        receive(result).await
    }

    pub(crate) async fn remove_sparse_preset(
        &self,
        selector: String,
        preset_id: String,
    ) -> Result<(), RepositoryError> {
        let (response, result) = oneshot::channel();
        self.projects
            .submit_repository(RepositoryRequest::RemoveSparsePreset {
                host_id: "local".to_owned(),
                preset_id,
                selector,
                response,
            })
            .await?;
        receive(result).await
    }

    pub(crate) async fn hooks(&self, selector: &str) -> Result<Value, RepositoryError> {
        let (repo, filesystem) = self.filesystem_for_repo(selector).await?;
        super::hooks::inspect(&repo, &filesystem)
            .await
            .map_err(Into::into)
    }

    pub(crate) async fn hooks_by_project_id(
        &self,
        project_id: &str,
    ) -> Result<super::hooks::RepoHooksInspection, RepositoryError> {
        let project = self.projects.resolve_id(project_id).await?;
        let repo = self
            .show_on_host(&project.execution_host_id, format!("id:{}", project.id))
            .await?;
        let host = self
            .hosts
            .execution_host(&project.execution_host_id)
            .await?;
        super::hooks::inspect_strict(&repo, &HostFilesystem::new(host))
            .await
            .map_err(Into::into)
    }

    pub(crate) async fn hooks_check(&self, selector: &str, host_id: Option<&str>) -> Value {
        let result = async {
            let host_id = host_id.unwrap_or("local");
            let repo = self.show_on_host(host_id, selector.to_owned()).await?;
            let host = self.hosts.execution_host(repo_host_id(&repo)).await?;
            super::hooks::check(&repo, &HostFilesystem::new(host))
                .await
                .map_err(RepositoryError::from)
        }
        .await;
        result.unwrap_or_else(|_| {
            json!({
                "status":"error", "hasHooks":false, "hooks":null, "mayNeedUpdate":false
            })
        })
    }

    pub(crate) async fn setup_script_imports(
        &self,
        selector: &str,
    ) -> Result<Vec<Value>, RepositoryError> {
        let (repo, filesystem) = self.filesystem_for_repo(selector).await?;
        if repo.get("kind").and_then(Value::as_str) == Some("folder") {
            return Ok(Vec::new());
        }
        super::setup_imports::inspect(&repo, &filesystem)
            .await
            .map_err(Into::into)
    }

    pub(crate) async fn filesystem_for_repo(
        &self,
        selector: &str,
    ) -> Result<(Value, HostFilesystem), RepositoryError> {
        let repo = self.show(selector.to_owned()).await?;
        let host_id = repo
            .get("executionHostId")
            .and_then(Value::as_str)
            .unwrap_or("local");
        let host = self.hosts.execution_host(host_id).await?;
        Ok((repo, HostFilesystem::new(host)))
    }

    pub(super) async fn persist_add(
        &self,
        input: AddInput,
    ) -> Result<RepositoryResult, RepositoryError> {
        let _mutation = self.projects.mutation_guard().await;
        let (response, result) = oneshot::channel();
        self.projects
            .submit_repository(RepositoryRequest::Add { input, response })
            .await?;
        let mutation = receive(result).await?;
        if mutation.added {
            self.events.publish_repos_changed();
        }
        Ok(mutation.result)
    }

    pub(super) async fn store_enriched_identity(
        &self,
        project_id: String,
        path: String,
        remotes: Vec<crate::projects::GitRemoteIdentity>,
    ) -> Result<bool, RepositoryError> {
        let (response, result) = oneshot::channel();
        self.projects
            .submit_repository(RepositoryRequest::EnrichIdentity {
                host_id: "local".to_owned(),
                path,
                project_id,
                remotes,
                response,
            })
            .await?;
        let changed = receive(result).await?;
        if changed {
            self.events.publish_repos_changed();
        }
        Ok(changed)
    }

    pub(super) async fn assert_revision(
        &self,
        expected_revision: i64,
    ) -> Result<(), RepositoryError> {
        let actual_revision = self.list_all().await?.revision;
        if actual_revision == expected_revision {
            Ok(())
        } else {
            Err(ProjectCatalogError::RevisionConflict {
                actual_revision,
                expected_revision,
                scope: "project-catalog",
            }
            .into())
        }
    }

    pub(super) async fn record_existing_add(
        &self,
        expected_revision: i64,
        project_id: String,
    ) -> Result<i64, RepositoryError> {
        let _mutation = self.projects.mutation_guard().await;
        let (response, result) = oneshot::channel();
        self.projects
            .submit_repository(RepositoryRequest::RecordExistingAdd {
                expected_revision,
                project_id,
                response,
            })
            .await?;
        receive(result).await
    }

    pub(super) async fn find_path(
        &self,
        host_id: &str,
        path: &str,
    ) -> Result<Option<Value>, RepositoryError> {
        let (response, result) = oneshot::channel();
        self.projects
            .submit_repository(RepositoryRequest::FindPath {
                host_id: host_id.to_owned(),
                path: path.to_owned(),
                response,
            })
            .await?;
        receive(result).await
    }
}

async fn receive<T>(
    result: oneshot::Receiver<Result<T, ProjectCatalogError>>,
) -> Result<T, RepositoryError> {
    result
        .await
        .map_err(|_| RepositoryError::WorkerUnavailable)?
        .map_err(Into::into)
}

fn normalize_preset_name(name: &str) -> Result<String, RepositoryError> {
    let name = super::ecmascript::trim(name);
    if name.is_empty() {
        return Err(RepositoryError::Runtime(
            "Preset name is required.".to_owned(),
        ));
    }
    if super::ecmascript::utf16_len(name) > 80 {
        return Err(RepositoryError::Runtime(
            "Preset name is too long.".to_owned(),
        ));
    }
    Ok(name.to_owned())
}

fn normalize_preset_directories(directories: Vec<String>) -> Result<Vec<String>, RepositoryError> {
    let mut output = Vec::new();
    let mut seen = HashSet::new();
    for raw in directories {
        let raw = super::ecmascript::trim(&raw);
        let bytes = raw.as_bytes();
        let is_drive = bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':';
        if raw.starts_with(['/', '\\']) || is_drive {
            return Err(RepositoryError::Runtime(
                "Preset directories must be repo-relative paths.".to_owned(),
            ));
        }
        let normalized = raw.replace('\\', "/").trim_matches('/').to_owned();
        if normalized.is_empty() || normalized == "." {
            continue;
        }
        if normalized.split('/').any(|part| part == "..") {
            return Err(RepositoryError::Runtime(
                "Preset directories must be repo-relative paths.".to_owned(),
            ));
        }
        if seen.insert(normalized.clone()) {
            output.push(normalized);
        }
    }
    if output.is_empty() {
        return Err(RepositoryError::Runtime(
            "Preset must have at least one directory.".to_owned(),
        ));
    }
    Ok(output)
}

fn repo_host_id(repo: &Value) -> &str {
    repo.get("executionHostId")
        .and_then(Value::as_str)
        .unwrap_or("local")
}

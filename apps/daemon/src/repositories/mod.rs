mod authority;
mod creation;
mod detection;
pub(crate) mod ecmascript;
pub(crate) mod hooks;
mod icon_detection;
mod identity_enrichment;
mod locale;
mod model;
mod record_storage;
mod records;
mod setup_codex_import;
mod setup_imports;
mod setup_json_imports;
mod setup_package_import;
mod sparse_presets;

pub(crate) use authority::{RepositoryAuthority, RepositoryError};
pub(crate) use model::{
    AddInput, AddMutation, RemoveInput, RemoveMutation, RemoveResult, ReorderInput, ReorderResult,
    ReorderStatus, RepositoryList, RepositoryResult, SparsePresetSaveInput, UpdateInput,
};
pub(crate) use record_storage::repo_icons;

use tokio::sync::oneshot;

use crate::projects::ProjectCatalogError;

pub(crate) enum RepositoryRequest {
    List {
        response: oneshot::Sender<Result<RepositoryList, ProjectCatalogError>>,
    },
    Show {
        host_id: String,
        selector: String,
        response: oneshot::Sender<Result<serde_json::Value, ProjectCatalogError>>,
    },
    FindPath {
        host_id: String,
        path: String,
        response: oneshot::Sender<Result<Option<serde_json::Value>, ProjectCatalogError>>,
    },
    Add {
        input: AddInput,
        response: oneshot::Sender<Result<AddMutation, ProjectCatalogError>>,
    },
    EnrichIdentity {
        host_id: String,
        path: String,
        project_id: String,
        remotes: Vec<crate::projects::GitRemoteIdentity>,
        response: oneshot::Sender<Result<bool, ProjectCatalogError>>,
    },
    RecordExistingAdd {
        expected_revision: i64,
        project_id: String,
        response: oneshot::Sender<Result<i64, ProjectCatalogError>>,
    },
    Update {
        input: UpdateInput,
        response: oneshot::Sender<Result<RepositoryResult, ProjectCatalogError>>,
    },
    Remove {
        input: RemoveInput,
        response: oneshot::Sender<Result<RemoveMutation, ProjectCatalogError>>,
    },
    Reorder {
        input: ReorderInput,
        response: oneshot::Sender<Result<ReorderResult, ProjectCatalogError>>,
    },
    ListSparsePresets {
        host_id: String,
        selector: String,
        response: oneshot::Sender<Result<Vec<serde_json::Value>, ProjectCatalogError>>,
    },
    SaveSparsePreset {
        input: SparsePresetSaveInput,
        response: oneshot::Sender<Result<serde_json::Value, ProjectCatalogError>>,
    },
    RemoveSparsePreset {
        host_id: String,
        preset_id: String,
        selector: String,
        response: oneshot::Sender<Result<(), ProjectCatalogError>>,
    },
}

pub(crate) struct RepositoryWorker;

impl RepositoryWorker {
    pub(crate) fn handle(connection: &mut rusqlite::Connection, request: RepositoryRequest) {
        match request {
            RepositoryRequest::List { response } => {
                let _ = response.send(records::list(connection));
            }
            RepositoryRequest::Show {
                host_id,
                selector,
                response,
            } => {
                let _ = response.send(records::show(connection, &host_id, &selector));
            }
            RepositoryRequest::FindPath {
                host_id,
                path,
                response,
            } => {
                let _ = response.send(records::find_path(connection, &host_id, &path));
            }
            RepositoryRequest::Add { input, response } => {
                let _ = response.send(records::add(connection, input));
            }
            RepositoryRequest::EnrichIdentity {
                host_id,
                path,
                project_id,
                remotes,
                response,
            } => {
                let _ = response.send(records::enrich_identity(
                    connection,
                    &project_id,
                    &host_id,
                    &path,
                    &remotes,
                ));
            }
            RepositoryRequest::RecordExistingAdd {
                expected_revision,
                project_id,
                response,
            } => {
                let _ = response.send(records::record_existing_add(
                    connection,
                    expected_revision,
                    &project_id,
                ));
            }
            RepositoryRequest::Update { input, response } => {
                let _ = response.send(records::update(connection, input));
            }
            RepositoryRequest::Remove { input, response } => {
                let _ = response.send(records::remove(connection, input));
            }
            RepositoryRequest::Reorder { input, response } => {
                let _ = response.send(records::reorder(connection, input));
            }
            RepositoryRequest::ListSparsePresets {
                host_id,
                selector,
                response,
            } => {
                let _ = response.send(sparse_presets::list(connection, &host_id, &selector));
            }
            RepositoryRequest::SaveSparsePreset { input, response } => {
                let _ = response.send(sparse_presets::save(connection, input));
            }
            RepositoryRequest::RemoveSparsePreset {
                host_id,
                preset_id,
                selector,
                response,
            } => {
                let _ = response.send(sparse_presets::remove(
                    connection, &host_id, &selector, &preset_id,
                ));
            }
        }
    }
}

mod read;
mod repository;
mod write;

use rusqlite::{Connection, TransactionBehavior};

use crate::project_groups::records::revision;
use crate::projects::ProjectCatalogError;

use super::{
    CleanupTombstone, SetupCreate, SetupDelete, SetupUpdate, StoredMutation,
    model::{PreparedRepository, SetupListSnapshot},
    schema,
};

pub(super) fn pending_cleanups(
    connection: &mut Connection,
) -> Result<Vec<CleanupTombstone>, ProjectCatalogError> {
    schema::ensure(connection)?;
    let mut statement = connection
        .prepare(
            "SELECT repo_id, wire_repo_id, host_id, prune_all_hosts, drop_sparse_presets
             FROM project_host_setup_cleanup
             ORDER BY created_at ASC, repo_id ASC, host_id ASC",
        )
        .map_err(ProjectCatalogError::storage)?;
    let rows = statement
        .query_map([], |row| {
            Ok(CleanupTombstone {
                storage_id: row.get(0)?,
                repo_id: row.get(1)?,
                host_id: row.get(2)?,
                prune_all_hosts: row.get(3)?,
                drop_sparse_presets: row.get(4)?,
            })
        })
        .map_err(ProjectCatalogError::storage)?;
    rows.map(|row| row.map_err(ProjectCatalogError::storage))
        .collect()
}

pub(super) fn ack_cleanup(
    connection: &mut Connection,
    cleanup: CleanupTombstone,
) -> Result<(), ProjectCatalogError> {
    schema::ensure(connection)?;
    connection
        .execute(
            "DELETE FROM project_host_setup_cleanup WHERE repo_id=?1 AND host_id=?2",
            [cleanup.storage_id, cleanup.host_id],
        )
        .map(|_| ())
        .map_err(ProjectCatalogError::storage)
}

pub(super) fn list(connection: &mut Connection) -> Result<SetupListSnapshot, ProjectCatalogError> {
    schema::ensure(connection)?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Deferred)
        .map_err(ProjectCatalogError::storage)?;
    let setups = read::list(&transaction)?;
    let projects = crate::projects::records::list(&transaction)?;
    let runtime_projects = crate::projects::wire_records::list_projects(&transaction)?;
    let revision = revision::read(&transaction)?;
    transaction.commit().map_err(ProjectCatalogError::storage)?;
    Ok(SetupListSnapshot {
        projects,
        revision,
        runtime_projects,
        setups,
    })
}

pub(super) fn create(
    connection: &mut Connection,
    input: SetupCreate,
) -> Result<StoredMutation, ProjectCatalogError> {
    schema::ensure(connection)?;
    write::create(connection, input)
}

pub(super) fn attach_repository(
    connection: &mut Connection,
    expected_revision: i64,
    prepared: PreparedRepository,
) -> Result<StoredMutation, ProjectCatalogError> {
    schema::ensure(connection)?;
    repository::attach(connection, expected_revision, prepared)
}

pub(super) fn update(
    connection: &mut Connection,
    input: SetupUpdate,
) -> Result<StoredMutation, ProjectCatalogError> {
    schema::ensure(connection)?;
    repository::update(connection, input)
}

pub(super) fn delete(
    connection: &mut Connection,
    input: SetupDelete,
) -> Result<StoredMutation, ProjectCatalogError> {
    schema::ensure(connection)?;
    repository::delete(connection, input)
}

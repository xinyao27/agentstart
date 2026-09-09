use std::collections::{HashMap, HashSet};

use rusqlite::{Connection, Transaction, TransactionBehavior, params};
use serde_json::{Value, json};

use crate::project_groups::records::revision;
use crate::project_host_setups::CleanupTombstone;
use crate::projects::{ProjectCatalogError, identity, records};

use super::{
    AddInput, AddMutation, RemoveInput, RemoveMutation, RemoveResult, ReorderInput, ReorderResult,
    ReorderStatus, RepositoryList, RepositoryResult, UpdateInput, record_storage,
};

pub(super) fn list(connection: &mut Connection) -> Result<RepositoryList, ProjectCatalogError> {
    record_storage::ensure_schema(connection)?;
    let repos = records::list(connection)?
        .into_iter()
        .filter(|project| project.execution_host_id == "local")
        .map(|project| record_storage::repo_value(connection, project))
        .collect::<Result<Vec<_>, _>>()?;
    Ok(RepositoryList {
        repos,
        revision: revision::read(connection)?,
    })
}

pub(super) fn show(
    connection: &mut Connection,
    host_id: &str,
    selector: &str,
) -> Result<Value, ProjectCatalogError> {
    record_storage::ensure_schema(connection)?;
    let project = record_storage::resolve(connection, host_id, selector)?;
    record_storage::repo_value(connection, project)
}

pub(super) fn find_path(
    connection: &mut Connection,
    host_id: &str,
    path: &str,
) -> Result<Option<Value>, ProjectCatalogError> {
    record_storage::ensure_schema(connection)?;
    records::list(connection)?
        .into_iter()
        .find(|project| {
            project.execution_host_id == host_id && crate::runtime_path::equal(&project.path, path)
        })
        .map(|project| record_storage::repo_value(connection, project))
        .transpose()
}

pub(super) fn add(
    connection: &mut Connection,
    input: AddInput,
) -> Result<AddMutation, ProjectCatalogError> {
    record_storage::ensure_schema(connection)?;
    let transaction = immediate(connection)?;
    revision::assert(&transaction, input.expected_revision)?;
    if let Some(project) = records::find_location(&transaction, &input.host_id, &input.path)? {
        let repo = record_storage::repo_value(&transaction, project)?;
        let revision = revision::read(&transaction)?;
        transaction.commit().map_err(ProjectCatalogError::storage)?;
        return Ok(AddMutation {
            added: false,
            result: RepositoryResult { repo, revision },
        });
    }
    let id = identity::random_uuid()?;
    let storage_id = id.clone();
    let added_at = identity::now_millis()?;
    let primary_remote = primary_remote(&input.remotes);
    transaction
        .execute(
            "INSERT INTO project(
               id,wire_id,path,host_id,display_name,badge_color,kind,remote_url,added_at
             ) VALUES (?1,?2,?3,?4,?5,'#737373',?6,?7,?8)",
            params![
                storage_id,
                id,
                input.path,
                input.host_id,
                input.display_name,
                input.kind.database_value(),
                primary_remote.map(|remote| remote.remote_url.as_str()),
                added_at,
            ],
        )
        .map_err(ProjectCatalogError::storage)?;
    records::replace_all_remotes(&transaction, &storage_id, &input.remotes)?;
    record_storage::insert_repo_state(&transaction, &storage_id)?;
    record_storage::insert_legacy_setup(
        &transaction,
        &storage_id,
        &input,
        primary_remote,
        added_at,
    )?;
    let mut metadata = input.detected;
    metadata.remove("upstream");
    record_storage::write_metadata(&transaction, &storage_id, &metadata)?;
    let project =
        records::find_id(&transaction, &storage_id)?.ok_or(ProjectCatalogError::NotFound)?;
    let repo = record_storage::repo_value(&transaction, project)?;
    let revision = revision::append(
        &transaction,
        "project.added",
        [("hostId", json!(input.host_id)), ("projectId", json!(id))],
    )?;
    transaction.commit().map_err(ProjectCatalogError::storage)?;
    Ok(AddMutation {
        added: true,
        result: RepositoryResult { repo, revision },
    })
}

pub(super) fn update(
    connection: &mut Connection,
    input: UpdateInput,
) -> Result<RepositoryResult, ProjectCatalogError> {
    record_storage::ensure_schema(connection)?;
    let transaction = immediate(connection)?;
    revision::assert(&transaction, input.expected_revision)?;
    let project = record_storage::resolve(&transaction, &input.host_id, &input.selector)?;
    let mut metadata = record_storage::metadata(&transaction, &project.storage_id)?;
    let mut updates = input.updates;
    let group_id = updates.remove("projectGroupId");
    let group_order = updates.remove("projectGroupOrder");
    if group_id.is_some() || group_order.is_some() {
        record_storage::update_project_group(
            &transaction,
            &project.storage_id,
            group_id.as_ref(),
            group_order.as_ref(),
        )?;
    }
    for (key, value) in updates {
        match key.as_str() {
            "displayName" => {
                record_storage::update_text(
                    &transaction,
                    &project.storage_id,
                    "display_name",
                    &value,
                )?;
            }
            "badgeColor" => {
                record_storage::update_text(
                    &transaction,
                    &project.storage_id,
                    "badge_color",
                    &value,
                )?;
            }
            "kind" => record_storage::update_kind(&transaction, &project.storage_id, &value)?,
            "worktreeBasePath" => record_storage::update_worktree_base_path(
                &transaction,
                &project.storage_id,
                value.as_str(),
            )?,
            "upstream" => {
                record_storage::update_upstream(&transaction, &project.storage_id, &value)?;
            }
            "externalWorktreeVisibility" => {
                record_storage::update_visibility(&transaction, &project, &value)?;
            }
            _ => record_storage::apply_optional(&mut metadata, key, value),
        }
    }
    record_storage::write_metadata(&transaction, &project.storage_id, &metadata)?;
    let updated = records::find_id(&transaction, &project.storage_id)?
        .ok_or(ProjectCatalogError::NotFound)?;
    let repo = record_storage::repo_value(&transaction, updated)?;
    let revision = revision::append(
        &transaction,
        "project.updated",
        [("projectId", json!(project.id))],
    )?;
    transaction.commit().map_err(ProjectCatalogError::storage)?;
    Ok(RepositoryResult { repo, revision })
}

pub(super) fn enrich_identity(
    connection: &mut Connection,
    project_id: &str,
    host_id: &str,
    path: &str,
    remotes: &[crate::projects::GitRemoteIdentity],
) -> Result<bool, ProjectCatalogError> {
    let transaction = immediate(connection)?;
    let Some(project) = records::find_wire(&transaction, host_id, project_id)? else {
        transaction.commit().map_err(ProjectCatalogError::storage)?;
        return Ok(false);
    };
    if project.execution_host_id != host_id
        || project.path != path
        || project.git_remote_identity.is_some()
    {
        transaction.commit().map_err(ProjectCatalogError::storage)?;
        return Ok(false);
    }
    records::replace_all_remotes(&transaction, &project.storage_id, remotes)?;
    let primary = primary_remote(remotes);
    transaction
        .execute(
            "UPDATE project SET remote_url=?1 WHERE id=?2 AND host_id=?3 AND path=?4",
            params![
                primary.map(|remote| remote.remote_url.as_str()),
                project.storage_id,
                host_id,
                path
            ],
        )
        .map_err(ProjectCatalogError::storage)?;
    transaction.commit().map_err(ProjectCatalogError::storage)?;
    Ok(true)
}

pub(super) fn record_existing_add(
    connection: &mut Connection,
    expected_revision: i64,
    project_id: &str,
) -> Result<i64, ProjectCatalogError> {
    let transaction = immediate(connection)?;
    revision::assert(&transaction, expected_revision)?;
    let revision = revision::append(
        &transaction,
        "project.added",
        [("projectId", json!(project_id))],
    )?;
    transaction.commit().map_err(ProjectCatalogError::storage)?;
    Ok(revision)
}

pub(super) fn remove(
    connection: &mut Connection,
    input: RemoveInput,
) -> Result<RemoveMutation, ProjectCatalogError> {
    record_storage::ensure_schema(connection)?;
    let transaction = immediate(connection)?;
    revision::assert(&transaction, input.expected_revision)?;
    let previous = crate::projects::wire_records::list_projects(&transaction)?;
    let project = record_storage::resolve(&transaction, &input.host_id, &input.selector)?;
    let cleanups = records::list(&transaction)?
        .into_iter()
        .filter(|candidate| candidate.id == project.id)
        .map(|candidate| CleanupTombstone {
            drop_sparse_presets: true,
            host_id: candidate.execution_host_id,
            prune_all_hosts: true,
            repo_id: candidate.id,
            storage_id: candidate.storage_id,
        })
        .collect::<Vec<_>>();
    let now = identity::now_millis()?;
    for cleanup in &cleanups {
        transaction
            .execute(
                "INSERT INTO project_host_setup_cleanup(
                   repo_id,wire_repo_id,host_id,prune_all_hosts,drop_sparse_presets,created_at
                 ) VALUES (?1,?2,?3,1,1,?4)
                 ON CONFLICT(repo_id,host_id) DO UPDATE SET
                   wire_repo_id=excluded.wire_repo_id,
                   prune_all_hosts=1,drop_sparse_presets=1",
                params![cleanup.storage_id, cleanup.repo_id, cleanup.host_id, now],
            )
            .map_err(ProjectCatalogError::storage)?;
        transaction
            .execute(
                "DELETE FROM project_host_setup WHERE repo_id=?1",
                [&cleanup.storage_id],
            )
            .map_err(ProjectCatalogError::storage)?;
        transaction
            .execute("DELETE FROM project WHERE id=?1", [&cleanup.storage_id])
            .map_err(ProjectCatalogError::storage)?;
    }
    crate::projects::independent::reconcile(&transaction, previous)?;
    let revision = revision::append(
        &transaction,
        "project.removed",
        [
            ("hostId", json!(project.execution_host_id)),
            ("projectId", json!(project.id)),
        ],
    )?;
    transaction.commit().map_err(ProjectCatalogError::storage)?;
    Ok(RemoveMutation {
        cleanups,
        result: RemoveResult {
            removed: true,
            revision,
        },
    })
}

pub(super) fn reorder(
    connection: &mut Connection,
    input: ReorderInput,
) -> Result<ReorderResult, ProjectCatalogError> {
    record_storage::ensure_schema(connection)?;
    let transaction = immediate(connection)?;
    revision::assert(&transaction, input.expected_revision)?;
    let current = records::list(&transaction)?
        .into_iter()
        .filter(|project| project.execution_host_id == "local")
        .map(|project| (project.id, project.storage_id))
        .collect::<Vec<_>>();
    let current_wire_ids = current
        .iter()
        .map(|(wire_id, _)| wire_id.clone())
        .collect::<Vec<_>>();
    if !is_permutation(&current_wire_ids, &input.ordered_ids) {
        let revision = revision::read(&transaction)?;
        transaction.commit().map_err(ProjectCatalogError::storage)?;
        return Ok(ReorderResult {
            revision,
            status: ReorderStatus::Rejected,
        });
    }
    {
        let mut statement = transaction
            .prepare(
                "INSERT INTO project_catalog_order(project_id,position) VALUES (?1,?2)
                 ON CONFLICT(project_id) DO UPDATE SET position=excluded.position",
            )
            .map_err(ProjectCatalogError::storage)?;
        let storage_by_wire = current.into_iter().collect::<HashMap<_, _>>();
        for (position, project_id) in input.ordered_ids.iter().enumerate() {
            let storage_id = storage_by_wire.get(project_id).ok_or_else(|| {
                ProjectCatalogError::storage(std::io::Error::new(
                    std::io::ErrorKind::InvalidData,
                    "validated repository order was unavailable",
                ))
            })?;
            statement
                .execute(params![
                    storage_id,
                    i64::try_from(position).map_err(ProjectCatalogError::storage)?
                ])
                .map_err(ProjectCatalogError::storage)?;
        }
    }
    let revision = revision::append(
        &transaction,
        "project.reordered",
        [("count", json!(input.ordered_ids.len()))],
    )?;
    transaction.commit().map_err(ProjectCatalogError::storage)?;
    Ok(ReorderResult {
        revision,
        status: ReorderStatus::Applied,
    })
}

fn immediate(connection: &mut Connection) -> Result<Transaction<'_>, ProjectCatalogError> {
    connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ProjectCatalogError::storage)
}

fn is_permutation(current: &[String], requested: &[String]) -> bool {
    if current.len() != requested.len() {
        return false;
    }
    let counts = current
        .iter()
        .fold(HashMap::<&str, usize>::new(), |mut counts, id| {
            *counts.entry(id).or_default() += 1;
            counts
        });
    let requested = requested.iter().map(String::as_str).collect::<HashSet<_>>();
    requested.len() == current.len()
        && counts.values().all(|count| *count == 1)
        && counts.keys().all(|id| requested.contains(id))
}

fn primary_remote(
    remotes: &[crate::projects::GitRemoteIdentity],
) -> Option<&crate::projects::GitRemoteIdentity> {
    remotes.iter().min_by(|left, right| {
        let priority = |name: &str| match name {
            "upstream" => 0,
            "origin" => 1,
            _ => 2,
        };
        priority(&left.remote_name)
            .cmp(&priority(&right.remote_name))
            .then_with(|| super::locale::compare(&left.remote_name, &right.remote_name))
    })
}

use std::collections::{HashMap, HashSet};

use rusqlite::{Connection, Transaction, TransactionBehavior, params};

use crate::project_groups::records::revision;
use crate::project_host_setups::CleanupTombstone;
use crate::projects::{ProjectCatalogError, identity, records};

use super::{
    RemoveForHostInput, RemoveForHostResult, RemoveMutation, ReorderForHostInput,
    ReorderForHostResult, ReorderStatus,
};

pub(super) fn remove_for_host(
    connection: &mut Connection,
    input: RemoveForHostInput,
) -> Result<RemoveMutation, ProjectCatalogError> {
    crate::project_host_setups::ensure_schema(connection)?;
    let transaction = immediate(connection)?;
    revision::assert(&transaction, input.expected_revision)?;
    let previous = crate::projects::wire_records::list_projects(&transaction)?;
    let project = records::find_wire(&transaction, &input.host_id, &input.repo_id)?;
    let survives_elsewhere = match project.as_ref() {
        Some(project) => repo_survives_elsewhere(&transaction, &project.id, &project.storage_id)?,
        None => false,
    };
    let cleanup = project.as_ref().map(|project| CleanupTombstone {
        drop_sparse_presets: !survives_elsewhere,
        host_id: input.host_id.clone(),
        prune_all_hosts: !survives_elsewhere,
        repo_id: project.id.clone(),
        storage_id: project.storage_id.clone(),
    });
    if let Some(cleanup) = cleanup.as_ref() {
        transaction
            .execute(
                "INSERT INTO project_host_setup_cleanup(
                   repo_id,wire_repo_id,host_id,prune_all_hosts,drop_sparse_presets,created_at
                 ) VALUES (?1,?2,?3,?4,?5,?6)
                 ON CONFLICT(repo_id,host_id) DO UPDATE SET
                   wire_repo_id=excluded.wire_repo_id,
                   prune_all_hosts=MAX(prune_all_hosts,excluded.prune_all_hosts),
                   drop_sparse_presets=MAX(drop_sparse_presets,excluded.drop_sparse_presets)",
                params![
                    cleanup.storage_id,
                    cleanup.repo_id,
                    cleanup.host_id,
                    cleanup.prune_all_hosts,
                    cleanup.drop_sparse_presets,
                    identity::now_millis()?
                ],
            )
            .map_err(ProjectCatalogError::storage)?;
        transaction
            .execute(
                "DELETE FROM project_host_setup WHERE repo_id=?1 AND host_id=?2",
                params![cleanup.storage_id, cleanup.host_id],
            )
            .map_err(ProjectCatalogError::storage)?;
        transaction
            .execute(
                "DELETE FROM project WHERE id=?1 AND host_id=?2",
                params![cleanup.storage_id, cleanup.host_id],
            )
            .map_err(ProjectCatalogError::storage)?;
    }
    crate::projects::independent::reconcile(&transaction, previous)?;
    let revision = revision::append(
        &transaction,
        "project.removed",
        [
            ("hostId", serde_json::json!(input.host_id)),
            ("projectId", serde_json::json!(input.repo_id)),
        ],
    )?;
    transaction.commit().map_err(ProjectCatalogError::storage)?;
    Ok(RemoveMutation {
        cleanup,
        result: RemoveForHostResult {
            removed: true,
            revision,
        },
    })
}

fn repo_survives_elsewhere(
    connection: &Connection,
    wire_id: &str,
    storage_id: &str,
) -> Result<bool, ProjectCatalogError> {
    connection
        .query_row(
            "SELECT EXISTS(
               SELECT 1 FROM project
               WHERE wire_id=?1 AND id<>?2
             )",
            params![wire_id, storage_id],
            |row| row.get(0),
        )
        .map_err(ProjectCatalogError::storage)
}

pub(super) fn reorder_for_host(
    connection: &mut Connection,
    input: ReorderForHostInput,
) -> Result<ReorderForHostResult, ProjectCatalogError> {
    let transaction = immediate(connection)?;
    revision::assert(&transaction, input.expected_revision)?;
    let ordered = list_ordered(&transaction)?;
    let host_ids = ordered
        .iter()
        .filter(|entry| entry.host_id == input.host_id)
        .map(|entry| entry.wire_id.clone())
        .collect::<Vec<_>>();
    if !is_permutation(&host_ids, &input.ordered_ids) {
        let revision = revision::read(&transaction)?;
        transaction.commit().map_err(ProjectCatalogError::storage)?;
        return Ok(ReorderForHostResult {
            revision: Some(revision),
            status: ReorderStatus::Rejected,
        });
    }
    let replacements = input
        .ordered_ids
        .iter()
        .map(|wire_id| {
            ordered
                .iter()
                .find(|entry| entry.host_id == input.host_id && entry.wire_id == *wire_id)
                .map(|entry| entry.storage_id.as_str())
                .ok_or_else(invalid_order)
        })
        .collect::<Result<Vec<_>, _>>()?;
    let mut replacements = replacements.into_iter();
    {
        let mut statement = transaction
            .prepare(
                "INSERT INTO project_catalog_order(project_id,position) VALUES (?1,?2)
                 ON CONFLICT(project_id) DO UPDATE SET position=excluded.position",
            )
            .map_err(ProjectCatalogError::storage)?;
        for (position, entry) in ordered.iter().enumerate() {
            let project_id = if entry.host_id == input.host_id {
                replacements.next().ok_or_else(invalid_order)?
            } else {
                &entry.storage_id
            };
            statement
                .execute(params![
                    project_id,
                    i64::try_from(position).map_err(ProjectCatalogError::storage)?
                ])
                .map_err(ProjectCatalogError::storage)?;
        }
    }
    let revision = revision::append(
        &transaction,
        "project.reordered",
        [
            ("count", serde_json::json!(input.ordered_ids.len())),
            ("hostId", serde_json::json!(input.host_id)),
        ],
    )?;
    transaction.commit().map_err(ProjectCatalogError::storage)?;
    Ok(ReorderForHostResult {
        revision: Some(revision),
        status: ReorderStatus::Applied,
    })
}

fn invalid_order() -> ProjectCatalogError {
    ProjectCatalogError::storage(std::io::Error::new(
        std::io::ErrorKind::InvalidData,
        "validated project order was unavailable",
    ))
}

fn immediate(connection: &mut Connection) -> Result<Transaction<'_>, ProjectCatalogError> {
    connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ProjectCatalogError::storage)
}

struct OrderedProject {
    host_id: String,
    storage_id: String,
    wire_id: String,
}

fn list_ordered(connection: &Connection) -> Result<Vec<OrderedProject>, ProjectCatalogError> {
    let mut statement = connection
        .prepare(
            "SELECT project.id,project.wire_id,project.host_id
             FROM project LEFT JOIN project_catalog_order
               ON project_catalog_order.project_id=project.id
             ORDER BY project_catalog_order.position IS NULL,
                      project_catalog_order.position,project.added_at,project.id",
        )
        .map_err(ProjectCatalogError::storage)?;
    let rows = statement
        .query_map([], |row| {
            Ok(OrderedProject {
                storage_id: row.get(0)?,
                wire_id: row.get(1)?,
                host_id: row.get(2)?,
            })
        })
        .map_err(ProjectCatalogError::storage)?;
    rows.map(|row| row.map_err(ProjectCatalogError::storage))
        .collect()
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
    if counts.values().any(|count| *count != 1) {
        return false;
    }
    let requested = requested.iter().map(String::as_str).collect::<HashSet<_>>();
    requested.len() == current.len() && counts.keys().all(|id| requested.contains(id))
}

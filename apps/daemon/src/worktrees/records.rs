use std::collections::HashMap;

use rusqlite::{Connection, OptionalExtension, Transaction};
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};

use super::metadata::{WorkbenchWorktreeMetadata, WorktreeMetadata, WorktreeMetadataError};

pub(super) fn list(
    connection: &Connection,
    storage_project_id: &str,
) -> Result<Vec<WorktreeMetadata>, WorktreeMetadataError> {
    let mut statement = connection
        .prepare(
            "SELECT id, project_id, host_id, path, display_name, metadata_json
             FROM worktree_metadata
             WHERE project_id = ?1
             ORDER BY id ASC",
        )
        .map_err(WorktreeMetadataError::storage)?;
    let rows = statement
        .query_map([storage_project_id], |row| {
            let metadata_json = row.get::<_, String>(5)?;
            let metadata = serde_json::from_str::<Value>(&metadata_json)
                .ok()
                .and_then(|value| value.as_object().cloned())
                .unwrap_or_default();
            Ok(WorktreeMetadata {
                id: row.get(0)?,
                host_id: row.get(2)?,
                path: row.get(3)?,
                display_name: row.get(4)?,
                metadata,
            })
        })
        .map_err(WorktreeMetadataError::storage)?;
    rows.map(|row| row.map_err(WorktreeMetadataError::storage))
        .collect()
}

pub(super) fn merge_workbench(
    connection: &mut Connection,
    entries: &[WorkbenchWorktreeMetadata],
) -> Result<(), WorktreeMetadataError> {
    const IMPORT_KEY: &str = "worktree-metadata";
    let projects = known_projects(connection)?;
    let stored_ids = stored_worktree_ids(connection)?;
    let entries = entries
        .iter()
        .filter_map(|entry| {
            let host_id = entry.host_id.as_deref().unwrap_or("local");
            projects
                .get(&(host_id.to_owned(), entry.project_id.clone()))
                .map(|storage_project_id| {
                    let storage_id = stored_ids
                        .get(&(storage_project_id.clone(), entry.id.clone()))
                        .cloned()
                        .unwrap_or_else(|| worktree_storage_id(storage_project_id, &entry.id));
                    (entry, storage_project_id, storage_id)
                })
        })
        .collect::<Vec<_>>();
    let transaction = connection
        .transaction()
        .map_err(WorktreeMetadataError::storage)?;
    let completed = transaction
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM legacy_import WHERE key = ?1)",
            [IMPORT_KEY],
            |row| row.get::<_, bool>(0),
        )
        .map_err(WorktreeMetadataError::storage)?;
    if completed {
        return Ok(());
    }
    let import_entries = stored_ids.is_empty();
    for (entry, storage_project_id, storage_id) in &entries {
        if import_entries {
            insert_legacy(&transaction, entry, storage_project_id, storage_id)?;
        }
    }
    transaction
        .execute(
            "INSERT INTO legacy_import(key, completed_at) VALUES (?1, ?2)",
            rusqlite::params![IMPORT_KEY, unix_millis()],
        )
        .map_err(WorktreeMetadataError::storage)?;
    transaction.commit().map_err(WorktreeMetadataError::storage)
}

fn insert_legacy(
    transaction: &Transaction<'_>,
    entry: &WorkbenchWorktreeMetadata,
    storage_project_id: &str,
    storage_id: &str,
) -> Result<(), WorktreeMetadataError> {
    transaction
        .execute(
            "INSERT OR IGNORE INTO worktree_metadata(
               storage_id, id, project_id, host_id, path, display_name, metadata_json, updated_at, authority
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'workbench')",
            rusqlite::params![
                storage_id,
                entry.id,
                storage_project_id,
                entry.host_id,
                entry.path,
                entry.display_name,
                bounded_json(&entry.metadata)?,
                entry.updated_at,
            ],
        )
        .map(|_| ())
        .map_err(WorktreeMetadataError::storage)
}

fn stored_worktree_ids(
    connection: &Connection,
) -> Result<HashMap<(String, String), String>, WorktreeMetadataError> {
    let mut statement = connection
        .prepare("SELECT project_id,id,storage_id FROM worktree_metadata")
        .map_err(WorktreeMetadataError::storage)?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                (row.get::<_, String>(0)?, row.get::<_, String>(1)?),
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(WorktreeMetadataError::storage)?;
    rows.map(|row| row.map_err(WorktreeMetadataError::storage))
        .collect()
}

fn known_projects(
    connection: &Connection,
) -> Result<HashMap<(String, String), String>, WorktreeMetadataError> {
    let mut statement = connection
        .prepare("SELECT id,host_id,wire_id FROM project")
        .map_err(WorktreeMetadataError::storage)?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                (row.get::<_, String>(1)?, row.get::<_, String>(2)?),
                row.get::<_, String>(0)?,
            ))
        })
        .map_err(WorktreeMetadataError::storage)?;
    rows.map(|row| row.map_err(WorktreeMetadataError::storage))
        .collect()
}

pub(super) fn patch(
    connection: &mut Connection,
    display_name: &str,
    host_id: &str,
    path: &str,
    storage_project_id: &str,
    worktree_id: &str,
    patch: Map<String, Value>,
) -> Result<WorktreeMetadata, WorktreeMetadataError> {
    let transaction = connection
        .transaction()
        .map_err(WorktreeMetadataError::storage)?;
    let mut metadata =
        read_one(&transaction, storage_project_id, worktree_id)?.unwrap_or_else(|| {
            WorktreeMetadata {
                display_name: display_name.to_owned(),
                host_id: Some(host_id.to_owned()),
                id: worktree_id.to_owned(),
                metadata: Map::new(),
                path: path.to_owned(),
            }
        });
    for (key, value) in patch {
        if value.is_null() {
            metadata.metadata.remove(&key);
        } else {
            metadata.metadata.insert(key, value);
        }
    }
    metadata.display_name = metadata
        .metadata
        .get("displayName")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned();
    transaction
        .execute(
            "INSERT INTO worktree_metadata(
               storage_id,id,project_id,host_id,path,display_name,metadata_json,updated_at,authority
             ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,'workbench')
             ON CONFLICT(project_id,id) DO UPDATE SET
               host_id=excluded.host_id,
               path=excluded.path,
               display_name=excluded.display_name,
               metadata_json=excluded.metadata_json,
               updated_at=excluded.updated_at",
            rusqlite::params![
                worktree_storage_id(storage_project_id, worktree_id),
                worktree_id,
                storage_project_id,
                host_id,
                path,
                metadata.display_name,
                bounded_json(&metadata.metadata)?,
                unix_millis(),
            ],
        )
        .map_err(WorktreeMetadataError::storage)?;
    transaction
        .commit()
        .map_err(WorktreeMetadataError::storage)?;
    Ok(metadata)
}

pub(super) fn reorder(
    connection: &mut Connection,
    ordered_ids: &[String],
) -> Result<usize, WorktreeMetadataError> {
    let transaction = connection
        .transaction()
        .map_err(WorktreeMetadataError::storage)?;
    let now = unix_millis();
    let mut updated = 0_usize;
    for (index, worktree_id) in ordered_ids.iter().enumerate() {
        let mut statement = transaction
            .prepare(
                "SELECT storage_id, metadata_json FROM worktree_metadata
                 WHERE id = ?1 AND COALESCE(host_id, 'local') = 'local'",
            )
            .map_err(WorktreeMetadataError::storage)?;
        let stored = statement
            .query_row([worktree_id], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .optional()
            .map_err(WorktreeMetadataError::storage)?;
        drop(statement);
        let Some((storage_id, stored)) = stored else {
            continue;
        };
        let mut metadata = serde_json::from_str::<Value>(&stored)
            .ok()
            .and_then(|value| value.as_object().cloned())
            .unwrap_or_default();
        let index_millis = i64::try_from(index)
            .unwrap_or(i64::MAX)
            .saturating_mul(1_000);
        metadata.insert(
            "sortOrder".to_owned(),
            Value::from(now.saturating_sub(index_millis)),
        );
        transaction
            .execute(
                "UPDATE worktree_metadata SET metadata_json = ?2, updated_at = ?3
                 WHERE storage_id = ?1",
                rusqlite::params![storage_id, bounded_json(&metadata)?, now,],
            )
            .map_err(WorktreeMetadataError::storage)?;
        updated += 1;
    }
    transaction
        .commit()
        .map_err(WorktreeMetadataError::storage)?;
    Ok(updated)
}

pub(super) fn remove(
    connection: &Connection,
    storage_project_id: &str,
    worktree_id: &str,
) -> Result<bool, WorktreeMetadataError> {
    let deleted = connection
        .execute(
            "DELETE FROM worktree_metadata WHERE project_id = ?1 AND id = ?2",
            [storage_project_id, worktree_id],
        )
        .map_err(WorktreeMetadataError::storage)?;
    Ok(deleted > 0)
}

fn read_one(
    connection: &Connection,
    storage_project_id: &str,
    worktree_id: &str,
) -> Result<Option<WorktreeMetadata>, WorktreeMetadataError> {
    connection
        .query_row(
            "SELECT id,host_id,path,display_name,metadata_json
             FROM worktree_metadata WHERE project_id = ?1 AND id = ?2",
            [storage_project_id, worktree_id],
            |row| {
                let stored = row.get::<_, String>(4)?;
                Ok(WorktreeMetadata {
                    id: row.get(0)?,
                    host_id: row.get(1)?,
                    path: row.get(2)?,
                    display_name: row.get(3)?,
                    metadata: serde_json::from_str::<Value>(&stored)
                        .ok()
                        .and_then(|value| value.as_object().cloned())
                        .unwrap_or_default(),
                })
            },
        )
        .optional()
        .map_err(WorktreeMetadataError::storage)
}

fn bounded_json(metadata: &Map<String, Value>) -> Result<String, WorktreeMetadataError> {
    const MAX_BYTES: usize = 256 * 1_024;
    let encoded = serde_json::to_string(metadata).map_err(WorktreeMetadataError::storage)?;
    if encoded.len() > MAX_BYTES {
        return Err(WorktreeMetadataError::storage(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "worktree metadata exceeds 256 KiB",
        )));
    }
    Ok(encoded)
}

fn unix_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .ok()
        .and_then(|duration| i64::try_from(duration.as_millis()).ok())
        .unwrap_or(i64::MAX)
}

fn worktree_storage_id(storage_project_id: &str, wire_id: &str) -> String {
    let mut digest = Sha256::new();
    digest.update(storage_project_id.len().to_le_bytes());
    digest.update(storage_project_id.as_bytes());
    digest.update(wire_id.len().to_le_bytes());
    digest.update(wire_id.as_bytes());
    format!("worktree:{:x}", digest.finalize())
}

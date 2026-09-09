use rusqlite::{Connection, OptionalExtension, params};
use serde_json::{Value, json};

use crate::projects::{ProjectCatalogError, identity};

use super::{SparsePresetSaveInput, record_storage};

pub(super) fn save(
    connection: &mut Connection,
    input: SparsePresetSaveInput,
) -> Result<Value, ProjectCatalogError> {
    record_storage::ensure_schema(connection)?;
    let project = record_storage::resolve(connection, &input.host_id, &input.selector)?;
    let now = identity::now_millis()?;
    let existing = input
        .id
        .as_deref()
        .map(|id| preset(connection, &project.storage_id, &project.id, id))
        .transpose()?
        .flatten();
    let id = existing
        .as_ref()
        .and_then(|value| value.get("id"))
        .and_then(Value::as_str)
        .map(str::to_owned)
        .unwrap_or(identity::random_uuid()?);
    let created_at = existing
        .as_ref()
        .and_then(|value| value.get("createdAt"))
        .and_then(Value::as_i64)
        .unwrap_or(now);
    let directories =
        serde_json::to_string(&input.directories).map_err(ProjectCatalogError::storage)?;
    connection
        .execute(
            "INSERT INTO repo_sparse_preset(id,repo_id,name,directories,created_at,updated_at)
             VALUES (?1,?2,?3,?4,?5,?6)
             ON CONFLICT(id) DO UPDATE SET name=excluded.name,
               directories=excluded.directories,updated_at=excluded.updated_at",
            params![
                id,
                project.storage_id,
                input.name,
                directories,
                created_at,
                now
            ],
        )
        .map_err(ProjectCatalogError::storage)?;
    preset(connection, &project.storage_id, &project.id, &id)?.ok_or(ProjectCatalogError::NotFound)
}

pub(super) fn list(
    connection: &mut Connection,
    host_id: &str,
    selector: &str,
) -> Result<Vec<Value>, ProjectCatalogError> {
    record_storage::ensure_schema(connection)?;
    let project = record_storage::resolve(connection, host_id, selector)?;
    let mut statement = connection
        .prepare(
            "SELECT id,name,directories,created_at,updated_at FROM repo_sparse_preset
             WHERE repo_id=?1 ORDER BY name COLLATE NOCASE,id",
        )
        .map_err(ProjectCatalogError::storage)?;
    let rows = statement
        .query_map([&project.storage_id], |row| {
            let directories = row.get::<_, String>(2)?;
            let directories = serde_json::from_str::<Value>(&directories).map_err(|error| {
                rusqlite::Error::FromSqlConversionFailure(
                    2,
                    rusqlite::types::Type::Text,
                    Box::new(error),
                )
            })?;
            Ok(json!({
                "id": row.get::<_, String>(0)?,
                "repoId": project.id,
                "name": row.get::<_, String>(1)?,
                "directories": directories,
                "createdAt": row.get::<_, i64>(3)?,
                "updatedAt": row.get::<_, i64>(4)?,
            }))
        })
        .map_err(ProjectCatalogError::storage)?;
    let mut presets = rows
        .map(|row| row.map_err(ProjectCatalogError::storage))
        .collect::<Result<Vec<_>, _>>()?;
    presets.sort_by(|left, right| {
        let left = left.get("name").and_then(Value::as_str).unwrap_or_default();
        let right = right
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or_default();
        super::locale::compare(left, right)
    });
    Ok(presets)
}

pub(super) fn remove(
    connection: &mut Connection,
    host_id: &str,
    selector: &str,
    preset_id: &str,
) -> Result<(), ProjectCatalogError> {
    record_storage::ensure_schema(connection)?;
    let project = record_storage::resolve(connection, host_id, selector)?;
    connection
        .execute(
            "DELETE FROM repo_sparse_preset WHERE repo_id=?1 AND id=?2",
            params![project.storage_id, preset_id],
        )
        .map(|_| ())
        .map_err(ProjectCatalogError::storage)
}

fn preset(
    connection: &Connection,
    storage_repo_id: &str,
    wire_repo_id: &str,
    preset_id: &str,
) -> Result<Option<Value>, ProjectCatalogError> {
    connection
        .query_row(
            "SELECT id,name,directories,created_at,updated_at FROM repo_sparse_preset
             WHERE repo_id=?1 AND id=?2",
            params![storage_repo_id, preset_id],
            |row| {
                let directories = row.get::<_, String>(2)?;
                let directories = serde_json::from_str::<Value>(&directories).map_err(|error| {
                    rusqlite::Error::FromSqlConversionFailure(
                        2,
                        rusqlite::types::Type::Text,
                        Box::new(error),
                    )
                })?;
                Ok(json!({
                    "id": row.get::<_, String>(0)?,
                    "repoId": wire_repo_id,
                    "name": row.get::<_, String>(1)?,
                    "directories": directories,
                    "createdAt": row.get::<_, i64>(3)?,
                    "updatedAt": row.get::<_, i64>(4)?,
                }))
            },
        )
        .optional()
        .map_err(ProjectCatalogError::storage)
}

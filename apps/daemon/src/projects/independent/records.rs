use std::collections::HashSet;

use rusqlite::{Connection, params};

use crate::projects::{ProjectCatalogError, RuntimeProject, wire_records};

pub(super) fn ensure(connection: &Connection) -> Result<(), ProjectCatalogError> {
    connection
        .execute_batch(
            "CREATE TABLE IF NOT EXISTS project_independent (
           id TEXT PRIMARY KEY, document TEXT NOT NULL
         );
         CREATE TABLE IF NOT EXISTS project_independent_import (
           id INTEGER PRIMARY KEY CHECK(id=1)
         );",
        )
        .map_err(ProjectCatalogError::storage)
}

pub(crate) fn list(connection: &Connection) -> Result<Vec<RuntimeProject>, ProjectCatalogError> {
    ensure(connection)?;
    let mut statement = connection
        .prepare(
            "SELECT document FROM project_independent
         WHERE EXISTS(SELECT 1 FROM project_host_setup
           WHERE project_id=project_independent.id AND repo_id='') ORDER BY rowid",
        )
        .map_err(ProjectCatalogError::storage)?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(ProjectCatalogError::storage)?;
    rows.map(|row| {
        serde_json::from_str(&row.map_err(ProjectCatalogError::storage)?)
            .map_err(ProjectCatalogError::storage)
    })
    .collect()
}

// Why: callers capture before deleting source repos and reconcile inside the same transaction;
// a repo-backed projection always wins, and only source-less projects own stored documents.
pub(crate) fn reconcile(
    connection: &Connection,
    previous: Vec<RuntimeProject>,
) -> Result<(), ProjectCatalogError> {
    ensure(connection)?;
    let projected = wire_records::list_repo_projects(connection)?
        .into_iter()
        .map(|project| project.id)
        .collect::<HashSet<_>>();
    for mut project in previous {
        let independent: bool = connection.query_row(
            "SELECT EXISTS(SELECT 1 FROM project_host_setup WHERE project_id=?1 AND repo_id='')",
            [&project.id], |row| row.get(0),
        ).map_err(ProjectCatalogError::storage)?;
        if independent && !projected.contains(&project.id) {
            project.source_repo_ids.clear();
            project.local_windows_runtime_preference = None;
            connection
                .execute(
                    "INSERT INTO project_independent(id,document) VALUES (?1,?2)
                 ON CONFLICT(id) DO UPDATE SET document=excluded.document",
                    params![
                        project.id,
                        serde_json::to_string(&project).map_err(ProjectCatalogError::storage)?
                    ],
                )
                .map_err(ProjectCatalogError::storage)?;
        } else {
            connection
                .execute("DELETE FROM project_independent WHERE id=?1", [&project.id])
                .map_err(ProjectCatalogError::storage)?;
            if !projected.contains(&project.id) {
                connection
                    .execute(
                        "DELETE FROM project_wire_metadata WHERE project_id=?1",
                        [&project.id],
                    )
                    .map_err(ProjectCatalogError::storage)?;
            }
        }
    }
    Ok(())
}

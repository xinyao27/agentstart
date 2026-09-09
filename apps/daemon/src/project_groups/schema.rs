use rusqlite::Connection;

use crate::projects::ProjectCatalogError;

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS project_group (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  parent_path TEXT,
  connection_id TEXT,
  parent_group_id TEXT,
  created_from TEXT NOT NULL CHECK(created_from IN ('manual', 'folder-scan', 'migration')),
  tab_order REAL NOT NULL,
  is_collapsed INTEGER NOT NULL CHECK(is_collapsed IN (0, 1)),
  color TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS project_group_parent ON project_group(parent_group_id);
CREATE TABLE IF NOT EXISTS project_group_membership (
  project_id TEXT PRIMARY KEY REFERENCES project(id) ON DELETE CASCADE,
  group_id TEXT,
  project_order REAL
);
CREATE INDEX IF NOT EXISTS project_group_membership_group
  ON project_group_membership(group_id, project_order);
"#;

pub(crate) fn ensure(connection: &Connection) -> Result<(), ProjectCatalogError> {
    connection
        .execute_batch(SCHEMA)
        .map_err(ProjectCatalogError::storage)
}

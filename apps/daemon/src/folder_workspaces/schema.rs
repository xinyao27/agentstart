use rusqlite::Connection;

use crate::projects::{ProjectCatalogError, identity};

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS folder_workspace (
  id TEXT PRIMARY KEY,
  project_group_id TEXT NOT NULL,
  name TEXT NOT NULL,
  folder_path TEXT NOT NULL,
  connection_id TEXT,
  linked_review_json TEXT,
  comment TEXT NOT NULL,
  is_archived INTEGER NOT NULL CHECK(is_archived IN (0, 1)),
  is_unread INTEGER NOT NULL CHECK(is_unread IN (0, 1)),
  is_pinned INTEGER NOT NULL CHECK(is_pinned IN (0, 1)),
  sort_order REAL NOT NULL,
  manual_order REAL,
  workspace_status TEXT,
  created_with_agent TEXT,
  pending_rename INTEGER CHECK(pending_rename IN (0, 1)),
  has_rename_error INTEGER NOT NULL CHECK(has_rename_error IN (0, 1)),
  rename_error TEXT,
  last_activity_at REAL NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS folder_workspace_group
  ON folder_workspace(project_group_id, sort_order DESC);
"#;

pub(crate) fn ensure(connection: &Connection) -> Result<(), ProjectCatalogError> {
    connection
        .execute_batch(SCHEMA)
        .map_err(ProjectCatalogError::storage)
}

pub(super) fn now() -> Result<i64, ProjectCatalogError> {
    identity::now_millis()
}

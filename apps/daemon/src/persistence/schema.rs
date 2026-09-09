use rusqlite::Connection;

use super::database::DatabaseError;

pub(super) const DATABASE_SCHEMA_VERSION: i64 = 22;

const RUST_OWNED_SCHEMA_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS worktree_metadata (
  storage_id TEXT PRIMARY KEY,
  id TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  host_id TEXT,
  path TEXT NOT NULL,
  display_name TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}'
    CHECK(length(metadata_json) <= 262144),
  updated_at INTEGER NOT NULL,
  authority TEXT NOT NULL DEFAULT 'workbench'
    CHECK(authority IN ('workbench')),
  UNIQUE(project_id, id)
);
CREATE TABLE IF NOT EXISTS project_wire_metadata (
  project_id TEXT PRIMARY KEY,
  local_windows_runtime_kind TEXT
    CHECK(local_windows_runtime_kind IN ('inherit-global', 'windows-host', 'wsl')),
  wsl_distro TEXT,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS project_catalog_order (
  project_id TEXT PRIMARY KEY REFERENCES project(id) ON DELETE CASCADE,
  position INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS project_catalog_order_position
  ON project_catalog_order(position, project_id);
CREATE TABLE IF NOT EXISTS project_repo_state (
  project_id TEXT PRIMARY KEY REFERENCES project(id) ON DELETE CASCADE,
  external_worktree_visibility TEXT NOT NULL
    CHECK(external_worktree_visibility IN ('hide', 'show')),
  external_worktree_visibility_legacy INTEGER NOT NULL CHECK(
    external_worktree_visibility_legacy IN (0, 1)
  )
);
"#;

const CREATE_SCHEMA_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS workspace_revision (
  scope TEXT PRIMARY KEY,
  revision INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS workspace_event (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope TEXT NOT NULL,
  revision INTEGER NOT NULL,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  occurred_at INTEGER NOT NULL,
  UNIQUE(scope, revision)
);
CREATE INDEX IF NOT EXISTS workspace_event_scope_id
  ON workspace_event(scope, id);
CREATE INDEX IF NOT EXISTS workspace_event_scope_occurred
  ON workspace_event(scope, occurred_at);
CREATE TABLE IF NOT EXISTS execution_host (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('ssh', 'wsl')),
  label TEXT NOT NULL,
  target TEXT NOT NULL,
  platform TEXT NOT NULL CHECK(platform IN ('darwin', 'linux', 'win32', 'unknown')),
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS project (
  id TEXT PRIMARY KEY,
  wire_id TEXT NOT NULL,
  path TEXT NOT NULL,
  host_id TEXT NOT NULL DEFAULT 'local',
  display_name TEXT NOT NULL,
  badge_color TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('git', 'folder')),
  remote_url TEXT,
  added_at INTEGER NOT NULL,
  authority TEXT NOT NULL DEFAULT 'daemon'
    CHECK(authority IN ('daemon', 'workbench')),
  UNIQUE(host_id, wire_id)
);
CREATE TABLE IF NOT EXISTS project_remote (
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  remote_name TEXT NOT NULL,
  remote_url TEXT NOT NULL,
  canonical_key TEXT NOT NULL,
  PRIMARY KEY(project_id, remote_name, remote_url)
);
CREATE INDEX IF NOT EXISTS project_remote_canonical
  ON project_remote(canonical_key, project_id);
CREATE TABLE IF NOT EXISTS artifact (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_length INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('writing', 'ready')),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS artifact_project_created
  ON artifact(project_id, created_at DESC);
CREATE TABLE IF NOT EXISTS browser_replay (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  page_url TEXT NOT NULL,
  page_title TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER NOT NULL,
  events_json TEXT NOT NULL,
  video_artifact_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS browser_replay_project_created
  ON browser_replay(project_id, created_at DESC);
CREATE TABLE IF NOT EXISTS visual_capture (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  worktree_id TEXT NOT NULL,
  page_url TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  diff_ratio REAL,
  image_artifact_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS visual_capture_project_created
  ON visual_capture(project_id, worktree_id, created_at DESC);
CREATE TABLE IF NOT EXISTS agent_session (
  id TEXT PRIMARY KEY,
  terminal_handle TEXT NOT NULL UNIQUE,
  worktree_id TEXT NOT NULL,
  agent TEXT NOT NULL,
  phase TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('running', 'complete', 'interrupted')),
  title TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER
);
CREATE INDEX IF NOT EXISTS agent_session_worktree_updated
  ON agent_session(worktree_id, updated_at DESC);
CREATE TABLE IF NOT EXISTS worktree_archive (
  id TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  original_worktree_id TEXT NOT NULL,
  path TEXT NOT NULL,
  branch TEXT NOT NULL,
  head TEXT NOT NULL,
  stash_oid TEXT,
  status TEXT NOT NULL CHECK(status IN ('archiving', 'archived', 'failed', 'restored')),
  failure_detail TEXT,
  created_at INTEGER NOT NULL,
  restored_at INTEGER
);
CREATE INDEX IF NOT EXISTS worktree_archive_repo_created
  ON worktree_archive(repo_id, created_at DESC);
CREATE TABLE IF NOT EXISTS ritual_schedule (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  enabled INTEGER NOT NULL CHECK(enabled IN (0, 1)),
  start_minutes INTEGER NOT NULL CHECK(start_minutes BETWEEN 0 AND 1439),
  end_minutes INTEGER NOT NULL CHECK(end_minutes BETWEEN 0 AND 1439),
  timezone TEXT NOT NULL,
  weekdays_json TEXT NOT NULL,
  archive_on_end_day INTEGER NOT NULL CHECK(archive_on_end_day IN (0, 1)),
  last_start_at INTEGER,
  last_end_at INTEGER,
  last_failure TEXT
);
"#;

pub(super) fn migrate(connection: &mut Connection) -> Result<(), DatabaseError> {
    let version =
        connection.pragma_query_value(None, "user_version", |row| row.get::<_, i64>(0))?;
    if version > DATABASE_SCHEMA_VERSION {
        return Err(DatabaseError::SchemaUnsupported);
    }
    if version == DATABASE_SCHEMA_VERSION {
        connection.execute_batch(RUST_OWNED_SCHEMA_SQL)?;
        return Ok(());
    }
    {
        let transaction = connection.transaction()?;
        transaction.execute_batch(CREATE_SCHEMA_SQL)?;
        if version < 9 && !has_column(&transaction, "worktree_archive", "failure_detail")? {
            migrate_worktree_archive_v9(&transaction)?;
        }
        transaction.commit()?;
    }
    if version < 11 && !has_column(connection, "project", "host_id")? {
        migrate_project_host_v11(connection)?;
    }
    if version < 12 && !has_column(connection, "browser_replay", "video_artifact_id")? {
        connection.execute_batch("ALTER TABLE browser_replay ADD COLUMN video_artifact_id TEXT")?;
    }
    if version < 13 && !has_column(connection, "visual_capture", "image_artifact_id")? {
        connection.execute_batch("ALTER TABLE visual_capture ADD COLUMN image_artifact_id TEXT")?;
    }
    if version < 17 && !has_column(connection, "project", "authority")? {
        connection.execute_batch(
            "ALTER TABLE project ADD COLUMN authority TEXT NOT NULL DEFAULT 'daemon'
               CHECK(authority IN ('daemon', 'workbench'))",
        )?;
    }
    if version < 19 && !has_column(connection, "project", "wire_id")? {
        migrate_project_wire_id_v19(connection)?;
    }
    if version < 20
        && has_table(connection, "worktree_metadata")?
        && !has_column(connection, "worktree_metadata", "storage_id")?
    {
        migrate_worktree_identity_v20(connection)?;
    }
    if version < 21
        && has_table(connection, "worktree_metadata")?
        && !has_column(connection, "worktree_metadata", "metadata_json")?
    {
        connection.execute_batch(
            "ALTER TABLE worktree_metadata
               ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}'
               CHECK(length(metadata_json) <= 262144)",
        )?;
    }
    connection.execute_batch(
        "CREATE UNIQUE INDEX IF NOT EXISTS project_host_path ON project(host_id, path)",
    )?;
    connection.execute_batch(RUST_OWNED_SCHEMA_SQL)?;
    connection.execute_batch(
        "DROP TABLE IF EXISTS mobile_notification;
         DROP TABLE IF EXISTS mobile_device;
         DROP TABLE IF EXISTS dangerous_credential;",
    )?;
    connection.pragma_update(None, "user_version", DATABASE_SCHEMA_VERSION)?;
    Ok(())
}

fn migrate_worktree_identity_v20(connection: &mut Connection) -> Result<(), DatabaseError> {
    connection.pragma_update(None, "foreign_keys", false)?;
    let migration_result = (|| {
        let transaction = connection.transaction()?;
        transaction.execute_batch(
            "CREATE TABLE worktree_metadata_v20 (
               storage_id TEXT PRIMARY KEY,
               id TEXT NOT NULL,
               project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
               host_id TEXT,
               path TEXT NOT NULL,
               display_name TEXT NOT NULL,
               updated_at INTEGER NOT NULL,
               authority TEXT NOT NULL DEFAULT 'workbench'
                 CHECK(authority IN ('workbench')),
               UNIQUE(project_id, id)
             );
             INSERT INTO worktree_metadata_v20(
               storage_id,id,project_id,host_id,path,display_name,updated_at,authority
             )
             SELECT id,id,project_id,host_id,path,display_name,updated_at,authority
             FROM worktree_metadata;
             DROP TABLE worktree_metadata;
             ALTER TABLE worktree_metadata_v20 RENAME TO worktree_metadata;",
        )?;
        transaction.commit()?;
        if connection.prepare("PRAGMA foreign_key_check")?.exists([])? {
            return Err(DatabaseError::WorktreeIdentityMigrationForeignKeyFailure);
        }
        Ok(())
    })();
    let enable_result = connection.pragma_update(None, "foreign_keys", true);
    if let Err(error) = enable_result {
        return Err(error.into());
    }
    migration_result
}

fn migrate_project_wire_id_v19(connection: &mut Connection) -> Result<(), DatabaseError> {
    connection.pragma_update(None, "foreign_keys", false)?;
    let migration_result = (|| {
        let transaction = connection.transaction()?;
        transaction.execute_batch(
            "CREATE TABLE project_v19 (
               id TEXT PRIMARY KEY,
               wire_id TEXT NOT NULL,
               path TEXT NOT NULL,
               host_id TEXT NOT NULL DEFAULT 'local',
               display_name TEXT NOT NULL,
               badge_color TEXT NOT NULL,
               kind TEXT NOT NULL CHECK(kind IN ('git', 'folder')),
               remote_url TEXT,
               added_at INTEGER NOT NULL,
               authority TEXT NOT NULL DEFAULT 'daemon'
                 CHECK(authority IN ('daemon', 'workbench')),
               UNIQUE(host_id, wire_id)
             );
             INSERT INTO project_v19(
               id,wire_id,path,host_id,display_name,badge_color,kind,remote_url,added_at,authority
             )
             SELECT id,id,path,host_id,display_name,badge_color,kind,remote_url,added_at,authority
             FROM project;
             DROP TABLE project;
             ALTER TABLE project_v19 RENAME TO project;
             CREATE UNIQUE INDEX project_host_path ON project(host_id,path);",
        )?;
        transaction.commit()?;
        if connection.prepare("PRAGMA foreign_key_check")?.exists([])? {
            return Err(DatabaseError::WireIdentityMigrationForeignKeyFailure);
        }
        Ok(())
    })();
    let enable_result = connection.pragma_update(None, "foreign_keys", true);
    if let Err(error) = enable_result {
        return Err(error.into());
    }
    migration_result
}

fn has_column(connection: &Connection, table: &str, column: &str) -> Result<bool, rusqlite::Error> {
    connection.query_row(
        "SELECT EXISTS(
           SELECT 1 FROM pragma_table_info(?1) WHERE name = ?2
         )",
        [table, column],
        |row| row.get(0),
    )
}

fn has_table(connection: &Connection, table: &str) -> Result<bool, rusqlite::Error> {
    connection.query_row(
        "SELECT EXISTS(
           SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1
         )",
        [table],
        |row| row.get(0),
    )
}

fn migrate_worktree_archive_v9(connection: &Connection) -> Result<(), rusqlite::Error> {
    connection.execute_batch(
        "CREATE TABLE worktree_archive_v9 (
           id TEXT PRIMARY KEY,
           repo_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
           original_worktree_id TEXT NOT NULL,
           path TEXT NOT NULL,
           branch TEXT NOT NULL,
           head TEXT NOT NULL,
           stash_oid TEXT,
           status TEXT NOT NULL CHECK(status IN ('archiving', 'archived', 'failed', 'restored')),
           failure_detail TEXT,
           created_at INTEGER NOT NULL,
           restored_at INTEGER
         );
         INSERT INTO worktree_archive_v9(
           id, repo_id, original_worktree_id, path, branch, head, stash_oid,
           status, failure_detail, created_at, restored_at
         )
         SELECT id, repo_id, original_worktree_id, path, branch, head, stash_oid,
                status, NULL, created_at, restored_at
         FROM worktree_archive;
         DROP TABLE worktree_archive;
         ALTER TABLE worktree_archive_v9 RENAME TO worktree_archive;
         CREATE INDEX worktree_archive_repo_created
           ON worktree_archive(repo_id, created_at DESC);",
    )
}

fn migrate_project_host_v11(connection: &mut Connection) -> Result<(), DatabaseError> {
    connection.pragma_update(None, "foreign_keys", false)?;
    let migration_result = (|| {
        let transaction = connection.transaction()?;
        transaction.execute_batch(
            "CREATE TABLE project_v11 (
               id TEXT PRIMARY KEY,
               path TEXT NOT NULL,
               host_id TEXT NOT NULL DEFAULT 'local',
               display_name TEXT NOT NULL,
               badge_color TEXT NOT NULL,
               kind TEXT NOT NULL CHECK(kind IN ('git', 'folder')),
               remote_url TEXT,
               added_at INTEGER NOT NULL
             );
             INSERT INTO project_v11(
               id, path, host_id, display_name, badge_color, kind, remote_url, added_at
             )
             SELECT id, path, 'local', display_name, badge_color, kind, remote_url, added_at
             FROM project;
             DROP TABLE project;
             ALTER TABLE project_v11 RENAME TO project;
             CREATE UNIQUE INDEX project_host_path ON project(host_id, path);",
        )?;
        transaction.commit()?;
        if connection.prepare("PRAGMA foreign_key_check")?.exists([])? {
            return Err(DatabaseError::HostMigrationForeignKeyFailure);
        }
        Ok(())
    })();
    let enable_result = connection.pragma_update(None, "foreign_keys", true);
    if let Err(error) = enable_result {
        return Err(error.into());
    }
    migration_result
}

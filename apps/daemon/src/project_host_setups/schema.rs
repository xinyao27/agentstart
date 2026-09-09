use rusqlite::Connection;

use crate::projects::ProjectCatalogError;

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS project_host_setup (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  host_id TEXT NOT NULL,
  repo_id TEXT NOT NULL DEFAULT '',
  path TEXT NOT NULL,
  display_name TEXT NOT NULL,
  kind TEXT CHECK(kind IN ('git', 'folder')),
  worktree_base_path TEXT,
  git_username TEXT,
  upstream_owner TEXT,
  upstream_repo TEXT,
  setup_state TEXT NOT NULL
    CHECK(setup_state IN ('ready', 'not-set-up', 'setting-up', 'error', 'unsupported')),
  setup_method TEXT NOT NULL
    CHECK(setup_method IN ('legacy-repo', 'imported-existing-folder', 'cloned', 'provisioned')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS project_host_setup_repo ON project_host_setup(repo_id);
CREATE UNIQUE INDEX IF NOT EXISTS project_host_setup_independent_host
  ON project_host_setup(project_id, host_id) WHERE repo_id = '';
CREATE TABLE IF NOT EXISTS project_host_setup_cleanup (
  repo_id TEXT NOT NULL,
  wire_repo_id TEXT NOT NULL DEFAULT '',
  host_id TEXT NOT NULL,
  prune_all_hosts INTEGER NOT NULL DEFAULT 0 CHECK(prune_all_hosts IN (0, 1)),
  drop_sparse_presets INTEGER NOT NULL DEFAULT 0 CHECK(drop_sparse_presets IN (0, 1)),
  created_at INTEGER NOT NULL,
  PRIMARY KEY(repo_id, host_id)
);
"#;

pub(crate) fn ensure(connection: &Connection) -> Result<(), ProjectCatalogError> {
    connection
        .execute_batch(SCHEMA)
        .map_err(ProjectCatalogError::storage)?;
    add_column(connection, "upstream_owner", "TEXT")?;
    add_column(connection, "upstream_repo", "TEXT")?;
    add_cleanup_column(connection, "wire_repo_id", "TEXT NOT NULL DEFAULT ''")?;
    connection
        .execute(
            "UPDATE project_host_setup_cleanup SET wire_repo_id=repo_id WHERE wire_repo_id=''",
            [],
        )
        .map_err(ProjectCatalogError::storage)?;
    add_cleanup_column(
        connection,
        "prune_all_hosts",
        "INTEGER NOT NULL DEFAULT 0 CHECK(prune_all_hosts IN (0, 1))",
    )?;
    add_cleanup_column(
        connection,
        "drop_sparse_presets",
        "INTEGER NOT NULL DEFAULT 0 CHECK(drop_sparse_presets IN (0, 1))",
    )?;
    remove_legacy_host_unique(connection)
}

fn add_column(
    connection: &Connection,
    name: &str,
    definition: &str,
) -> Result<(), ProjectCatalogError> {
    let mut statement = connection
        .prepare("PRAGMA table_info(project_host_setup)")
        .map_err(ProjectCatalogError::storage)?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(ProjectCatalogError::storage)?;
    for row in rows {
        if row.map_err(ProjectCatalogError::storage)? == name {
            return Ok(());
        }
    }
    connection
        .execute_batch(&format!(
            "ALTER TABLE project_host_setup ADD COLUMN {name} {definition}"
        ))
        .map_err(ProjectCatalogError::storage)
}

fn add_cleanup_column(
    connection: &Connection,
    name: &str,
    definition: &str,
) -> Result<(), ProjectCatalogError> {
    let mut statement = connection
        .prepare("PRAGMA table_info(project_host_setup_cleanup)")
        .map_err(ProjectCatalogError::storage)?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(ProjectCatalogError::storage)?;
    for row in rows {
        if row.map_err(ProjectCatalogError::storage)? == name {
            return Ok(());
        }
    }
    connection
        .execute_batch(&format!(
            "ALTER TABLE project_host_setup_cleanup ADD COLUMN {name} {definition}"
        ))
        .map_err(ProjectCatalogError::storage)
}

fn remove_legacy_host_unique(connection: &Connection) -> Result<(), ProjectCatalogError> {
    let table_sql = connection
        .query_row(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='project_host_setup'",
            [],
            |row| row.get::<_, String>(0),
        )
        .map_err(ProjectCatalogError::storage)?;
    let normalized = table_sql
        .chars()
        .filter(|character| !character.is_ascii_whitespace())
        .collect::<String>()
        .to_ascii_lowercase();
    if !normalized.contains("unique(project_id,host_id)") {
        return Ok(());
    }
    let migration = r#"
BEGIN IMMEDIATE;
ALTER TABLE project_host_setup RENAME TO project_host_setup_legacy_unique;
CREATE TABLE project_host_setup (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  host_id TEXT NOT NULL,
  repo_id TEXT NOT NULL DEFAULT '',
  path TEXT NOT NULL,
  display_name TEXT NOT NULL,
  kind TEXT CHECK(kind IN ('git', 'folder')),
  worktree_base_path TEXT,
  git_username TEXT,
  upstream_owner TEXT,
  upstream_repo TEXT,
  setup_state TEXT NOT NULL
    CHECK(setup_state IN ('ready', 'not-set-up', 'setting-up', 'error', 'unsupported')),
  setup_method TEXT NOT NULL
    CHECK(setup_method IN ('legacy-repo', 'imported-existing-folder', 'cloned', 'provisioned')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
INSERT INTO project_host_setup(
  id, project_id, host_id, repo_id, path, display_name, kind, worktree_base_path,
  git_username, upstream_owner, upstream_repo, setup_state, setup_method, created_at, updated_at
)
SELECT id, project_id, host_id, repo_id, path, display_name, kind, worktree_base_path,
       git_username, upstream_owner, upstream_repo, setup_state, setup_method, created_at, updated_at
FROM project_host_setup_legacy_unique;
DROP TABLE project_host_setup_legacy_unique;
CREATE INDEX project_host_setup_repo ON project_host_setup(repo_id);
CREATE UNIQUE INDEX project_host_setup_independent_host
  ON project_host_setup(project_id, host_id) WHERE repo_id = '';
COMMIT;
"#;
    if let Err(error) = connection.execute_batch(migration) {
        let _ = connection.execute_batch("ROLLBACK");
        return Err(ProjectCatalogError::storage(error));
    }
    Ok(())
}

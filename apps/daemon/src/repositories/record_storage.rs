use rusqlite::{Connection, OptionalExtension, Transaction, params};
use serde_json::{Map, Value, json};

use crate::projects::{Project, ProjectCatalogError, ProjectKind, records};

use super::AddInput;

const DEFAULT_HOOK_SETTINGS: &str = r#"{"mode":"auto","setupRunPolicy":"run-by-default","setupAgentStartupPolicy":"start-immediately","scripts":{"setup":"","archive":""}}"#;

pub(super) fn ensure_schema(connection: &Connection) -> Result<(), ProjectCatalogError> {
    connection
        .execute_batch(
            "CREATE TABLE IF NOT EXISTS repo_metadata(
               repo_id TEXT PRIMARY KEY REFERENCES project(id) ON DELETE CASCADE,
               document TEXT NOT NULL
             );
             CREATE TABLE IF NOT EXISTS repo_sparse_preset(
               id TEXT PRIMARY KEY,
               repo_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
               name TEXT NOT NULL,
               directories TEXT NOT NULL,
               created_at INTEGER NOT NULL,
               updated_at INTEGER NOT NULL
             );
             CREATE INDEX IF NOT EXISTS repo_sparse_preset_repo
               ON repo_sparse_preset(repo_id,name,id);
             CREATE TABLE IF NOT EXISTS project_repo_state(
               project_id TEXT PRIMARY KEY REFERENCES project(id) ON DELETE CASCADE,
               external_worktree_visibility TEXT NOT NULL
                 CHECK(external_worktree_visibility IN ('hide','show')),
               external_worktree_visibility_legacy INTEGER NOT NULL
                 CHECK(external_worktree_visibility_legacy IN (0,1))
             );",
        )
        .map_err(ProjectCatalogError::storage)
}

pub(super) fn resolve(
    connection: &Connection,
    host_id: &str,
    selector: &str,
) -> Result<Project, ProjectCatalogError> {
    let selector_kind = selector
        .split_once(':')
        .filter(|(kind, _)| matches!(*kind, "id" | "path" | "name"));
    let matches = records::list(connection)?
        .into_iter()
        .filter(|project| project.execution_host_id == host_id)
        .filter(|project| match selector_kind {
            Some(("id", value)) => project.id == value,
            Some(("path", value)) => paths_equal(&project.path, value),
            Some(("name", value)) => project.display_name == value,
            Some(_) => false,
            None => {
                project.id == selector
                    || paths_equal(&project.path, selector)
                    || project.display_name == selector
            }
        })
        .collect::<Vec<_>>();
    match matches.len() {
        0 => Err(ProjectCatalogError::NotFound),
        1 => matches
            .into_iter()
            .next()
            .ok_or(ProjectCatalogError::NotFound),
        _ => Err(ProjectCatalogError::AmbiguousSelector),
    }
}

pub(super) fn repo_value(
    connection: &Connection,
    project: Project,
) -> Result<Value, ProjectCatalogError> {
    let mut repo = Map::new();
    repo.insert("id".to_owned(), json!(project.id));
    repo.insert("path".to_owned(), json!(project.path));
    repo.insert("displayName".to_owned(), json!(project.display_name));
    repo.insert("badgeColor".to_owned(), json!(project.badge_color));
    repo.insert("addedAt".to_owned(), json!(project.added_at));
    repo.insert(
        "kind".to_owned(),
        json!(match project.kind {
            ProjectKind::Folder => "folder",
            ProjectKind::Git => "git",
        }),
    );
    repo.insert("gitUsername".to_owned(), json!(""));
    repo.insert(
        "hookSettings".to_owned(),
        serde_json::from_str(DEFAULT_HOOK_SETTINGS).map_err(ProjectCatalogError::storage)?,
    );
    if project.execution_host_id != "local" {
        repo.insert(
            "executionHostId".to_owned(),
            json!(project.execution_host_id),
        );
    }
    if project.kind == ProjectKind::Git {
        repo.insert(
            "externalWorktreeVisibility".to_owned(),
            json!(project.external_worktree_visibility),
        );
        if let Some(legacy) = project.external_worktree_visibility_legacy {
            repo.insert("externalWorktreeVisibilityLegacy".to_owned(), json!(legacy));
        }
        repo.insert(
            "upstream".to_owned(),
            setup_upstream(connection, &project.storage_id)?,
        );
    }
    if let Some(identity) = project.git_remote_identity {
        repo.insert(
            "gitRemoteIdentity".to_owned(),
            serde_json::to_value(identity).map_err(ProjectCatalogError::storage)?,
        );
    }
    if let Some(path) = project.worktree_base_path {
        repo.insert("worktreeBasePath".to_owned(), json!(path));
    }
    let (group_id, group_order) = project_group(connection, &project.storage_id)?;
    if let Some(group_id) = group_id {
        repo.insert("projectGroupId".to_owned(), json!(group_id));
    }
    if let Some(group_order) = group_order {
        repo.insert("projectGroupOrder".to_owned(), json!(group_order));
    }
    repo.extend(metadata(connection, &project.storage_id)?);
    Ok(Value::Object(repo))
}

pub(super) fn metadata(
    connection: &Connection,
    project_id: &str,
) -> Result<Map<String, Value>, ProjectCatalogError> {
    connection
        .query_row(
            "SELECT document FROM repo_metadata WHERE repo_id=?1",
            [project_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(ProjectCatalogError::storage)?
        .map(|document| {
            serde_json::from_str::<Map<String, Value>>(&document)
                .map_err(ProjectCatalogError::storage)
        })
        .transpose()
        .map(Option::unwrap_or_default)
}

pub(super) fn write_metadata(
    transaction: &Transaction<'_>,
    project_id: &str,
    metadata: &Map<String, Value>,
) -> Result<(), ProjectCatalogError> {
    let document = serde_json::to_string(metadata).map_err(ProjectCatalogError::storage)?;
    transaction
        .execute(
            "INSERT INTO repo_metadata(repo_id,document) VALUES (?1,?2)
             ON CONFLICT(repo_id) DO UPDATE SET document=excluded.document",
            params![project_id, document],
        )
        .map(|_| ())
        .map_err(ProjectCatalogError::storage)
}

pub(super) fn update_text(
    transaction: &Transaction<'_>,
    project_id: &str,
    column: &str,
    value: &Value,
) -> Result<(), ProjectCatalogError> {
    let Some(value) = value.as_str() else {
        return Ok(());
    };
    let sql = match column {
        "badge_color" => "UPDATE project SET badge_color=?1 WHERE id=?2",
        "display_name" => "UPDATE project SET display_name=?1 WHERE id=?2",
        _ => return Ok(()),
    };
    let now = crate::projects::identity::now_millis()?;
    transaction
        .execute(sql, params![value, project_id])
        .and_then(|_| {
            if column == "display_name" {
                transaction.execute(
                    "UPDATE project_host_setup SET display_name=?1,updated_at=?2 WHERE repo_id=?3",
                    params![value, now, project_id],
                )?;
            }
            Ok(())
        })
        .map(|_| ())
        .map_err(ProjectCatalogError::storage)
}

pub(super) fn update_kind(
    transaction: &Transaction<'_>,
    project_id: &str,
    value: &Value,
) -> Result<(), ProjectCatalogError> {
    let Some(value) = value
        .as_str()
        .filter(|value| matches!(*value, "git" | "folder"))
    else {
        return Ok(());
    };
    let now = crate::projects::identity::now_millis()?;
    transaction
        .execute(
            "UPDATE project SET kind=?1 WHERE id=?2",
            params![value, project_id],
        )
        .and_then(|_| {
            transaction.execute(
                "UPDATE project_host_setup SET kind=?1,updated_at=?2 WHERE repo_id=?3",
                params![value, now, project_id],
            )?;
            Ok(())
        })
        .map(|_| ())
        .map_err(ProjectCatalogError::storage)
}

pub(super) fn insert_legacy_setup(
    transaction: &Transaction<'_>,
    repo_id: &str,
    input: &AddInput,
    primary_remote: Option<&crate::projects::GitRemoteIdentity>,
    added_at: i64,
) -> Result<(), ProjectCatalogError> {
    let (owner, repo) = upstream_fields(input.detected.get("upstream"));
    let project_id = crate::projects::wire_records::identity_for_repo(repo_id, primary_remote);
    transaction
        .execute(
            "INSERT INTO project_host_setup(
               id,project_id,host_id,repo_id,path,display_name,kind,upstream_owner,
               upstream_repo,setup_state,setup_method,created_at,updated_at
             ) VALUES (?1,?2,?3,?1,?4,?5,?6,?7,?8,'ready','legacy-repo',?9,?9)
             ON CONFLICT(id) DO NOTHING",
            params![
                repo_id,
                project_id,
                input.host_id,
                input.path,
                input.display_name,
                input.kind.database_value(),
                owner,
                repo,
                added_at,
            ],
        )
        .map(|_| ())
        .map_err(ProjectCatalogError::storage)
}

pub(super) fn insert_repo_state(
    transaction: &Transaction<'_>,
    project_id: &str,
) -> Result<(), ProjectCatalogError> {
    transaction
        .execute(
            "INSERT INTO project_repo_state(
               project_id,external_worktree_visibility,external_worktree_visibility_legacy
             ) VALUES (?1,'hide',0) ON CONFLICT(project_id) DO NOTHING",
            [project_id],
        )
        .map(|_| ())
        .map_err(ProjectCatalogError::storage)
}

pub(super) fn update_visibility(
    transaction: &Transaction<'_>,
    project: &Project,
    value: &Value,
) -> Result<(), ProjectCatalogError> {
    let Some(visibility) = value
        .as_str()
        .filter(|value| matches!(*value, "hide" | "show"))
    else {
        return Ok(());
    };
    let legacy = transaction
        .query_row(
            "SELECT external_worktree_visibility_legacy FROM project_repo_state
             WHERE project_id=?1",
            [&project.storage_id],
            |row| row.get::<_, bool>(0),
        )
        .optional()
        .map_err(ProjectCatalogError::storage)?
        .unwrap_or(project.added_at < 1_779_494_400_000);
    transaction
        .execute(
            "INSERT INTO project_repo_state(
               project_id,external_worktree_visibility,external_worktree_visibility_legacy
             ) VALUES (?1,?2,?3) ON CONFLICT(project_id) DO UPDATE SET
             external_worktree_visibility=excluded.external_worktree_visibility",
            params![project.storage_id, visibility, legacy],
        )
        .map(|_| ())
        .map_err(ProjectCatalogError::storage)
}

pub(super) fn update_worktree_base_path(
    transaction: &Transaction<'_>,
    repo_id: &str,
    value: Option<&str>,
) -> Result<(), ProjectCatalogError> {
    transaction
        .execute(
            "UPDATE project_host_setup SET worktree_base_path=?1,updated_at=?2 WHERE repo_id=?3",
            params![value, crate::projects::identity::now_millis()?, repo_id],
        )
        .map(|_| ())
        .map_err(ProjectCatalogError::storage)
}

pub(super) fn update_upstream(
    transaction: &Transaction<'_>,
    repo_id: &str,
    value: &Value,
) -> Result<(), ProjectCatalogError> {
    let (owner, repo) = upstream_fields(Some(value));
    transaction
        .execute(
            "UPDATE project_host_setup SET upstream_owner=?1,upstream_repo=?2,updated_at=?3
             WHERE repo_id=?4",
            params![
                owner,
                repo,
                crate::projects::identity::now_millis()?,
                repo_id
            ],
        )
        .map(|_| ())
        .map_err(ProjectCatalogError::storage)
}

pub(super) fn update_project_group(
    transaction: &Transaction<'_>,
    project_id: &str,
    group_update: Option<&Value>,
    order_update: Option<&Value>,
) -> Result<(), ProjectCatalogError> {
    crate::project_groups::ensure_schema(transaction)?;
    let current = project_group(transaction, project_id)?;
    let group_id = match group_update {
        Some(Value::String(group_id)) => transaction
            .query_row(
                "SELECT id FROM project_group WHERE id=?1",
                [group_id],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(ProjectCatalogError::storage)?,
        Some(_) => None,
        None => current.0,
    };
    let order = order_update.and_then(Value::as_f64).or(current.1);
    transaction
        .execute(
            "INSERT INTO project_group_membership(project_id,group_id,project_order)
             VALUES (?1,?2,?3) ON CONFLICT(project_id) DO UPDATE SET
             group_id=excluded.group_id,project_order=excluded.project_order",
            params![project_id, group_id, order],
        )
        .map(|_| ())
        .map_err(ProjectCatalogError::storage)
}

fn project_group(
    connection: &Connection,
    project_id: &str,
) -> Result<(Option<String>, Option<f64>), ProjectCatalogError> {
    crate::project_groups::ensure_schema(connection)?;
    connection
        .query_row(
            "SELECT group_id,project_order FROM project_group_membership WHERE project_id=?1",
            [project_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map(Option::unwrap_or_default)
        .map_err(ProjectCatalogError::storage)
}

fn setup_upstream(connection: &Connection, repo_id: &str) -> Result<Value, ProjectCatalogError> {
    let upstream = connection
        .query_row(
            "SELECT upstream_owner,upstream_repo FROM project_host_setup
             WHERE repo_id=?1 ORDER BY created_at,id LIMIT 1",
            [repo_id],
            |row| {
                Ok((
                    row.get::<_, Option<String>>(0)?,
                    row.get::<_, Option<String>>(1)?,
                ))
            },
        )
        .optional()
        .map_err(ProjectCatalogError::storage)?;
    Ok(match upstream {
        Some((Some(owner), Some(repo))) if !owner.is_empty() && !repo.is_empty() => {
            json!({ "owner":owner, "repo":repo })
        }
        _ => Value::Null,
    })
}

fn upstream_fields(value: Option<&Value>) -> (Option<&str>, Option<&str>) {
    let object = value.and_then(Value::as_object);
    (
        object
            .and_then(|value| value.get("owner"))
            .and_then(Value::as_str),
        object
            .and_then(|value| value.get("repo"))
            .and_then(Value::as_str),
    )
}

pub(super) fn apply_optional(metadata: &mut Map<String, Value>, key: String, value: Value) {
    if value.is_null()
        && matches!(
            key.as_str(),
            "externalWorktreeDiscoverySuppressedAt" | "sourceControlAi" | "worktreeBasePath"
        )
    {
        metadata.remove(&key);
    } else {
        metadata.insert(key, value);
    }
}

fn paths_equal(left: &str, right: &str) -> bool {
    crate::runtime_path::equal(left, right)
}

// Why: project projections read the repository-owned icon document rather than persisting
// a second icon that would drift after repo.update changes or clears it.
pub(crate) fn repo_icons(
    connection: &Connection,
) -> Result<std::collections::HashMap<String, Value>, ProjectCatalogError> {
    ensure_schema(connection)?;
    let mut statement = connection
        .prepare("SELECT repo_id, document FROM repo_metadata")
        .map_err(ProjectCatalogError::storage)?;
    let rows = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(ProjectCatalogError::storage)?;
    let mut icons = std::collections::HashMap::new();
    for row in rows {
        let (repo_id, document) = row.map_err(ProjectCatalogError::storage)?;
        let mut metadata: Map<String, Value> =
            serde_json::from_str(&document).map_err(ProjectCatalogError::storage)?;
        if let Some(icon) = metadata.remove("repoIcon") {
            icons.insert(repo_id, icon);
        }
    }
    Ok(icons)
}

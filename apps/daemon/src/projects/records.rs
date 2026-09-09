use rusqlite::{Connection, OptionalExtension, Transaction};
use std::collections::HashSet;

use super::{
    GitRemoteIdentity, Project, ProjectCatalogError, ProjectKind, ProjectRegistration,
    WorkbenchProject,
    identity::{now_millis, random_uuid},
    model::ProjectWorktreeVisibility,
    remotes,
};

const DEFAULT_BADGE_COLOR: &str = "#737373";

type ProjectRow = (
    String,
    String,
    String,
    String,
    String,
    String,
    String,
    Option<String>,
    i64,
    Option<String>,
    Option<String>,
    Option<bool>,
);

pub(crate) fn list(connection: &Connection) -> Result<Vec<Project>, ProjectCatalogError> {
    crate::project_host_setups::ensure_schema(connection)?;
    let mut statement = connection
        .prepare(
            "SELECT project.id, project.wire_id, project.path, project.host_id, project.display_name,
                    project.badge_color, project.kind, project.remote_url, project.added_at,
                    (SELECT setup.worktree_base_path
                     FROM project_host_setup AS setup
                     WHERE setup.repo_id=project.id
                     ORDER BY setup.updated_at DESC,setup.id
                     LIMIT 1),
                    project_repo_state.external_worktree_visibility,
                    project_repo_state.external_worktree_visibility_legacy
             FROM project LEFT JOIN project_repo_state ON project_repo_state.project_id=project.id
             LEFT JOIN project_catalog_order ON project_catalog_order.project_id=project.id
             ORDER BY project_catalog_order.position IS NULL,
                      project_catalog_order.position, project.added_at, project.id",
        )
        .map_err(ProjectCatalogError::storage)?;
    let rows = statement
        .query_map([], read_project)
        .map_err(ProjectCatalogError::storage)?;
    rows.map(|row| hydrate_project(row.map_err(ProjectCatalogError::storage)?))
        .collect()
}

pub(crate) fn resolve_id(
    connection: &Connection,
    project_id: &str,
) -> Result<Project, ProjectCatalogError> {
    crate::project_host_setups::ensure_schema(connection)?;
    let mut statement = connection
        .prepare(
            "SELECT project.id, project.wire_id, project.path, project.host_id, project.display_name,
                    project.badge_color, project.kind, project.remote_url, project.added_at,
                    (SELECT setup.worktree_base_path
                     FROM project_host_setup AS setup
                     WHERE setup.repo_id=project.id
                     ORDER BY setup.updated_at DESC,setup.id
                     LIMIT 1),
                    project_repo_state.external_worktree_visibility,
                    project_repo_state.external_worktree_visibility_legacy
             FROM project LEFT JOIN project_repo_state ON project_repo_state.project_id=project.id
             WHERE project.wire_id = ?1
             LIMIT 2",
        )
        .map_err(ProjectCatalogError::storage)?;
    let mut rows = statement
        .query_map([project_id], read_project)
        .map_err(ProjectCatalogError::storage)?;
    let first = rows
        .next()
        .transpose()
        .map_err(ProjectCatalogError::storage)?
        .ok_or(ProjectCatalogError::NotFound)?;
    if rows
        .next()
        .transpose()
        .map_err(ProjectCatalogError::storage)?
        .is_some()
    {
        return Err(ProjectCatalogError::AmbiguousSelector);
    }
    hydrate_project(first)
}

pub(super) fn register(
    connection: &mut Connection,
    input: ProjectRegistration,
) -> Result<Project, ProjectCatalogError> {
    if let Some(existing) =
        find_location(connection, &input.location.host_id, &input.location.path)?
    {
        return Ok(existing);
    }
    let primary_remote = input
        .remotes
        .iter()
        .find(|remote| remote.remote_name == "origin")
        .or_else(|| input.remotes.first());
    let storage_id = random_uuid()?;
    let project = Project {
        added_at: now_millis()?,
        badge_color: DEFAULT_BADGE_COLOR.to_owned(),
        display_name: input.display_name,
        execution_host_id: input.location.host_id,
        external_worktree_visibility: ProjectWorktreeVisibility::Hide,
        external_worktree_visibility_legacy: Some(false),
        git_remote_identity: primary_remote.cloned(),
        id: storage_id.clone(),
        kind: input.kind,
        path: input.location.path,
        storage_id,
        worktree_base_path: None,
    };
    connection
        .execute(
            "INSERT INTO project(
               id, wire_id, path, host_id, display_name, badge_color, kind, remote_url, added_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            rusqlite::params![
                project.storage_id,
                project.id,
                project.path,
                project.execution_host_id,
                project.display_name,
                project.badge_color,
                project.kind.database_value(),
                primary_remote.map(|remote| remote.remote_url.as_str()),
                project.added_at,
            ],
        )
        .map_err(ProjectCatalogError::storage)?;
    connection
        .execute(
            "INSERT INTO project_repo_state(
               project_id,external_worktree_visibility,external_worktree_visibility_legacy
             ) VALUES (?1,'hide',0)",
            [&project.storage_id],
        )
        .map_err(ProjectCatalogError::storage)?;
    replace_remotes(connection, &project.storage_id, &input.remotes)?;
    Ok(project)
}

pub(super) fn replace_remotes(
    connection: &mut Connection,
    project_id: &str,
    remotes: &[GitRemoteIdentity],
) -> Result<(), ProjectCatalogError> {
    let transaction = connection
        .transaction()
        .map_err(ProjectCatalogError::storage)?;
    replace_all_remotes(&transaction, project_id, remotes)?;
    transaction.commit().map_err(ProjectCatalogError::storage)
}

pub(super) fn resolve_by_remote(
    connection: &Connection,
    canonical_key: &str,
) -> Result<Vec<Project>, ProjectCatalogError> {
    let projects = list(connection)?;
    let mut statement = connection
        .prepare(
            "SELECT DISTINCT project_id
             FROM project_remote
             WHERE canonical_key = ?1",
        )
        .map_err(ProjectCatalogError::storage)?;
    let rows = statement
        .query_map([canonical_key], |row| row.get::<_, String>(0))
        .map_err(ProjectCatalogError::storage)?;
    let mut ids = HashSet::new();
    for row in rows {
        ids.insert(row.map_err(ProjectCatalogError::storage)?);
    }
    Ok(projects
        .into_iter()
        .filter(|project| ids.contains(&project.storage_id))
        .collect())
}

pub(super) fn sync_workbench(
    connection: &mut Connection,
    projects: &[WorkbenchProject],
) -> Result<(), ProjectCatalogError> {
    let project_ids = projects
        .iter()
        .map(|project| {
            (
                project.host_id.as_deref().unwrap_or("local"),
                project.id.as_str(),
            )
        })
        .collect::<HashSet<_>>();
    let transaction = connection
        .transaction()
        .map_err(ProjectCatalogError::storage)?;
    let previous = super::wire_records::list_projects(&transaction)?;
    for project in projects {
        let host_id = project.host_id.as_deref().unwrap_or("local");
        let kind = project.kind.unwrap_or(ProjectKind::Git);
        let storage_id = storage_id_for_wire(&transaction, host_id, &project.id)?;
        transaction
            .execute(
                "INSERT INTO project(
                   id, wire_id, path, host_id, display_name, badge_color, kind, remote_url, added_at,
                   authority
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'workbench')
                 ON CONFLICT(id) DO UPDATE SET
                   wire_id = excluded.wire_id,
                   path = excluded.path,
                   host_id = excluded.host_id,
                   display_name = excluded.display_name,
                   badge_color = excluded.badge_color,
                   kind = excluded.kind,
                   remote_url = excluded.remote_url,
                   added_at = excluded.added_at,
                   authority = 'workbench'",
                rusqlite::params![
                    storage_id,
                    project.id,
                    project.path,
                    host_id,
                    project.display_name,
                    project.badge_color,
                    kind.database_value(),
                    project
                        .git_remote_identity
                        .as_ref()
                        .map(|identity| identity.remote_url.as_str()),
                    project.added_at,
                ],
            )
            .map_err(ProjectCatalogError::storage)?;
        replace_projected_remote(&transaction, &storage_id, project)?;
    }
    let mut statement = transaction
        .prepare("SELECT id,host_id,wire_id FROM project WHERE authority = 'workbench'")
        .map_err(ProjectCatalogError::storage)?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(ProjectCatalogError::storage)?;
    let mut removed = Vec::new();
    for row in rows {
        let (storage_id, host_id, wire_id) = row.map_err(ProjectCatalogError::storage)?;
        if !project_ids.contains(&(host_id.as_str(), wire_id.as_str())) {
            removed.push(storage_id);
        }
    }
    drop(statement);
    for id in removed {
        transaction
            .execute("DELETE FROM project WHERE id = ?1", [id])
            .map_err(ProjectCatalogError::storage)?;
    }
    super::independent::reconcile(&transaction, previous)?;
    transaction.commit().map_err(ProjectCatalogError::storage)
}

pub(crate) fn find_location(
    connection: &Connection,
    host_id: &str,
    path: &str,
) -> Result<Option<Project>, ProjectCatalogError> {
    crate::project_host_setups::ensure_schema(connection)?;
    connection
        .query_row(
            "SELECT project.id, project.wire_id, project.path, project.host_id, project.display_name,
                    project.badge_color, project.kind, project.remote_url, project.added_at,
                    (SELECT setup.worktree_base_path
                     FROM project_host_setup AS setup
                     WHERE setup.repo_id=project.id
                     ORDER BY setup.updated_at DESC,setup.id
                     LIMIT 1),
                    project_repo_state.external_worktree_visibility,
                    project_repo_state.external_worktree_visibility_legacy
             FROM project LEFT JOIN project_repo_state ON project_repo_state.project_id=project.id
             WHERE project.host_id = ?1 AND project.path = ?2",
            [host_id, path],
            read_project,
        )
        .optional()
        .map_err(ProjectCatalogError::storage)?
        .map(hydrate_project)
        .transpose()
}

pub(crate) fn find_id(
    connection: &Connection,
    id: &str,
) -> Result<Option<Project>, ProjectCatalogError> {
    crate::project_host_setups::ensure_schema(connection)?;
    connection
        .query_row(
            "SELECT project.id, project.wire_id, project.path, project.host_id, project.display_name,
                    project.badge_color, project.kind, project.remote_url, project.added_at,
                    (SELECT setup.worktree_base_path
                     FROM project_host_setup AS setup
                     WHERE setup.repo_id=project.id
                     ORDER BY setup.updated_at DESC,setup.id
                     LIMIT 1),
                    project_repo_state.external_worktree_visibility,
                    project_repo_state.external_worktree_visibility_legacy
             FROM project LEFT JOIN project_repo_state ON project_repo_state.project_id=project.id
             WHERE project.id = ?1",
            [id],
            read_project,
        )
        .optional()
        .map_err(ProjectCatalogError::storage)?
        .map(hydrate_project)
        .transpose()
}

pub(crate) fn find_wire(
    connection: &Connection,
    host_id: &str,
    wire_id: &str,
) -> Result<Option<Project>, ProjectCatalogError> {
    crate::project_host_setups::ensure_schema(connection)?;
    connection
        .query_row(
            "SELECT project.id, project.wire_id, project.path, project.host_id, project.display_name,
                    project.badge_color, project.kind, project.remote_url, project.added_at,
                    (SELECT setup.worktree_base_path
                     FROM project_host_setup AS setup
                     WHERE setup.repo_id=project.id
                     ORDER BY setup.updated_at DESC,setup.id
                     LIMIT 1),
                    project_repo_state.external_worktree_visibility,
                    project_repo_state.external_worktree_visibility_legacy
             FROM project LEFT JOIN project_repo_state ON project_repo_state.project_id=project.id
             WHERE project.host_id = ?1 AND project.wire_id = ?2",
            [host_id, wire_id],
            read_project,
        )
        .optional()
        .map_err(ProjectCatalogError::storage)?
        .map(hydrate_project)
        .transpose()
}

pub(crate) fn replace_all_remotes(
    transaction: &Transaction<'_>,
    project_id: &str,
    remotes: &[GitRemoteIdentity],
) -> Result<(), ProjectCatalogError> {
    transaction
        .execute(
            "DELETE FROM project_remote WHERE project_id = ?1",
            [project_id],
        )
        .map_err(ProjectCatalogError::storage)?;
    for remote in remotes {
        transaction
            .execute(
                "INSERT INTO project_remote(project_id, remote_name, remote_url, canonical_key)
                 VALUES (?1, ?2, ?3, ?4)",
                rusqlite::params![
                    project_id,
                    remote.remote_name,
                    remote.remote_url,
                    remote.canonical_key,
                ],
            )
            .map_err(ProjectCatalogError::storage)?;
    }
    Ok(())
}

fn replace_projected_remote(
    transaction: &Transaction<'_>,
    storage_id: &str,
    project: &WorkbenchProject,
) -> Result<(), ProjectCatalogError> {
    let remotes = project.git_remote_identity.as_slice();
    replace_all_remotes(transaction, storage_id, remotes)
}

fn read_project(row: &rusqlite::Row<'_>) -> Result<ProjectRow, rusqlite::Error> {
    Ok((
        row.get(0)?,
        row.get(1)?,
        row.get(2)?,
        row.get(3)?,
        row.get(4)?,
        row.get(5)?,
        row.get(6)?,
        row.get(7)?,
        row.get(8)?,
        row.get(9)?,
        row.get(10)?,
        row.get(11)?,
    ))
}

fn hydrate_project(row: ProjectRow) -> Result<Project, ProjectCatalogError> {
    let (
        storage_id,
        id,
        path,
        host_id,
        display_name,
        badge_color,
        kind,
        remote_url,
        added_at,
        worktree_base_path,
        visibility,
        visibility_legacy,
    ) = row;
    let kind = match kind.as_str() {
        "folder" => ProjectKind::Folder,
        "git" => ProjectKind::Git,
        _ => return Err(ProjectCatalogError::InvalidKind(kind)),
    };
    Ok(Project {
        added_at,
        badge_color,
        display_name,
        execution_host_id: host_id,
        external_worktree_visibility: match visibility.as_deref() {
            Some(value) => ProjectWorktreeVisibility::parse(value).ok_or_else(|| {
                ProjectCatalogError::storage(std::io::Error::new(
                    std::io::ErrorKind::InvalidData,
                    format!("invalid external worktree visibility {value}"),
                ))
            })?,
            None if added_at < 1_779_494_400_000 => ProjectWorktreeVisibility::Show,
            None => ProjectWorktreeVisibility::Hide,
        },
        external_worktree_visibility_legacy: visibility_legacy,
        git_remote_identity: remote_url
            .as_deref()
            .and_then(|url| remotes::normalize("origin", url)),
        id,
        kind,
        path,
        storage_id,
        worktree_base_path,
    })
}

fn storage_id_for_wire(
    connection: &Connection,
    host_id: &str,
    wire_id: &str,
) -> Result<String, ProjectCatalogError> {
    if let Some(storage_id) = connection
        .query_row(
            "SELECT id FROM project WHERE host_id=?1 AND wire_id=?2",
            [host_id, wire_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(ProjectCatalogError::storage)?
    {
        return Ok(storage_id);
    }
    let storage_id_available = !connection
        .prepare("SELECT 1 FROM project WHERE id=?1")
        .map_err(ProjectCatalogError::storage)?
        .exists([wire_id])
        .map_err(ProjectCatalogError::storage)?;
    if storage_id_available {
        Ok(wire_id.to_owned())
    } else {
        random_uuid()
    }
}

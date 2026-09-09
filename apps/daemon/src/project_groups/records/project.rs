use rusqlite::Connection;

use crate::projects::{ProjectCatalogError, ProjectKind, ProjectWorktreeVisibility, remotes};

use super::super::model::RuntimeRepo;

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
);

pub(super) fn resolve(
    connection: &Connection,
    selector: &str,
) -> Result<RuntimeRepo, ProjectCatalogError> {
    let selector = selector.strip_prefix("id:").unwrap_or(selector);
    let mut statement = connection
        .prepare(
            "SELECT project.id,project.wire_id,project.path,project.host_id,project.display_name,
                    project.badge_color,project.kind,project.remote_url,project.added_at,
                    project_repo_state.external_worktree_visibility
             FROM project LEFT JOIN project_repo_state ON project_repo_state.project_id=project.id
             WHERE project.host_id='local' AND
               (project.wire_id=?1 OR project.path=?1 OR project.display_name=?1)",
        )
        .map_err(ProjectCatalogError::storage)?;
    let rows = statement
        .query_map([selector], read_row)
        .map_err(ProjectCatalogError::storage)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(ProjectCatalogError::storage)?;
    if rows.len() > 1 {
        return Err(ProjectCatalogError::AmbiguousSelector);
    }
    hydrate(
        rows.into_iter()
            .next()
            .ok_or(ProjectCatalogError::NotFound)?,
    )
}

fn read_row(row: &rusqlite::Row<'_>) -> Result<ProjectRow, rusqlite::Error> {
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
    ))
}

fn hydrate(row: ProjectRow) -> Result<RuntimeRepo, ProjectCatalogError> {
    let (
        storage_id,
        id,
        path,
        execution_host_id,
        display_name,
        badge_color,
        kind,
        remote_url,
        added_at,
        visibility,
    ) = row;
    let kind = match kind.as_str() {
        "folder" => ProjectKind::Folder,
        "git" => ProjectKind::Git,
        _ => return Err(ProjectCatalogError::InvalidKind(kind)),
    };
    Ok(RuntimeRepo {
        added_at,
        badge_color,
        display_name,
        execution_host_id,
        external_worktree_visibility: visibility
            .as_deref()
            .and_then(ProjectWorktreeVisibility::parse)
            .unwrap_or(if added_at < 1_779_494_400_000 {
                ProjectWorktreeVisibility::Show
            } else {
                ProjectWorktreeVisibility::Hide
            }),
        git_remote_identity: remote_url
            .as_deref()
            .and_then(|url| remotes::normalize("origin", url)),
        id,
        kind,
        path,
        project_group_id: None,
        project_group_order: None,
        storage_id,
    })
}

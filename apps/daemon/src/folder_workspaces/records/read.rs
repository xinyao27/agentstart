use rusqlite::{Connection, OptionalExtension};

use crate::projects::ProjectCatalogError;

use super::super::{FolderWorkspace, LinkedReview};

type Row = (
    String,
    String,
    String,
    String,
    Option<String>,
    Option<String>,
    String,
    bool,
    bool,
    bool,
    f64,
    Option<f64>,
    Option<String>,
    Option<String>,
    Option<bool>,
    bool,
    Option<String>,
    f64,
    i64,
    i64,
);

pub(super) fn list(connection: &Connection) -> Result<Vec<FolderWorkspace>, ProjectCatalogError> {
    let mut statement = connection
        .prepare(&format!("{} ORDER BY sort_order DESC, name ASC", SELECT))
        .map_err(ProjectCatalogError::storage)?;
    let rows = statement
        .query_map([], row)
        .map_err(ProjectCatalogError::storage)?;
    rows.map(|row| hydrate(row.map_err(ProjectCatalogError::storage)?))
        .collect()
}

pub(super) fn find(
    connection: &Connection,
    id: &str,
) -> Result<Option<FolderWorkspace>, ProjectCatalogError> {
    connection
        .query_row(&format!("{} WHERE id=?1", SELECT), [id], row)
        .optional()
        .map_err(ProjectCatalogError::storage)?
        .map(hydrate)
        .transpose()
}

const SELECT: &str = "SELECT id, project_group_id, name, folder_path, connection_id,
 linked_review_json, comment, is_archived, is_unread, is_pinned, sort_order, manual_order,
 workspace_status, created_with_agent, pending_rename, has_rename_error, rename_error,
 last_activity_at, created_at, updated_at FROM folder_workspace";

fn row(row: &rusqlite::Row<'_>) -> Result<Row, rusqlite::Error> {
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
        row.get(12)?,
        row.get(13)?,
        row.get(14)?,
        row.get(15)?,
        row.get(16)?,
        row.get(17)?,
        row.get(18)?,
        row.get(19)?,
    ))
}

fn hydrate(row: Row) -> Result<FolderWorkspace, ProjectCatalogError> {
    let (
        id,
        project_group_id,
        name,
        folder_path,
        connection_id,
        linked,
        comment,
        is_archived,
        is_unread,
        is_pinned,
        sort_order,
        manual_order,
        workspace_status,
        created_with_agent,
        pending,
        has_error,
        error,
        last_activity_at,
        created_at,
        updated_at,
    ) = row;
    let linked_review = linked
        .map(|value| serde_json::from_str::<LinkedReview>(&value))
        .transpose()
        .map_err(ProjectCatalogError::storage)?;
    Ok(FolderWorkspace {
        comment,
        connection_id,
        created_at,
        created_with_agent,
        first_agent_message_rename_error: has_error.then_some(error),
        folder_path,
        id,
        is_archived,
        is_pinned,
        is_unread,
        last_activity_at,
        linked_review,
        manual_order,
        name,
        pending_first_agent_message_rename: pending,
        project_group_id,
        sort_order,
        updated_at,
        workspace_status,
    })
}

use rusqlite::{Connection, OptionalExtension};

use crate::projects::ProjectCatalogError;

use super::super::model::{ProjectGroup, ProjectGroupCreatedFrom};

type GroupRow = (
    String,
    String,
    Option<String>,
    Option<String>,
    Option<String>,
    String,
    f64,
    bool,
    Option<String>,
    i64,
    i64,
);

pub(super) fn list(connection: &Connection) -> Result<Vec<ProjectGroup>, ProjectCatalogError> {
    let mut statement = connection
        .prepare(
            "SELECT id, name, parent_path, connection_id, parent_group_id, created_from,
                    tab_order, is_collapsed, color, created_at, updated_at
             FROM project_group ORDER BY tab_order ASC, name ASC",
        )
        .map_err(ProjectCatalogError::storage)?;
    let rows = statement
        .query_map([], read_row)
        .map_err(ProjectCatalogError::storage)?;
    rows.map(|row| hydrate(row.map_err(ProjectCatalogError::storage)?))
        .collect()
}

pub(super) fn find(
    connection: &Connection,
    group_id: &str,
) -> Result<Option<ProjectGroup>, ProjectCatalogError> {
    connection
        .query_row(
            "SELECT id, name, parent_path, connection_id, parent_group_id, created_from,
                    tab_order, is_collapsed, color, created_at, updated_at
             FROM project_group WHERE id = ?1",
            [group_id],
            read_row,
        )
        .optional()
        .map_err(ProjectCatalogError::storage)?
        .map(hydrate)
        .transpose()
}

fn read_row(row: &rusqlite::Row<'_>) -> Result<GroupRow, rusqlite::Error> {
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
    ))
}

fn hydrate(row: GroupRow) -> Result<ProjectGroup, ProjectCatalogError> {
    let (
        id,
        name,
        parent_path,
        connection_id,
        parent_group_id,
        created_from,
        tab_order,
        is_collapsed,
        color,
        created_at,
        updated_at,
    ) = row;
    let created_from = ProjectGroupCreatedFrom::parse(&created_from).ok_or_else(|| {
        ProjectCatalogError::storage(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "invalid project group origin",
        ))
    })?;
    Ok(ProjectGroup {
        color,
        connection_id,
        created_at,
        created_from,
        id,
        is_collapsed,
        name,
        parent_group_id,
        parent_path,
        tab_order,
        updated_at,
    })
}

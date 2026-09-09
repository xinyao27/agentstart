mod import;
mod project;
mod read;
pub(crate) mod revision;

use rusqlite::{Connection, TransactionBehavior, params};

use crate::projects::{ProjectCatalogError, identity};

use super::model::{
    NullableProjectGroupResult, ProjectGroup, ProjectGroupCreate, ProjectGroupDelete,
    ProjectGroupDeleteResult, ProjectGroupListResult, ProjectGroupMoveProject,
    ProjectGroupMoveProjectResult, ProjectGroupResult, ProjectGroupUpdate, RuntimeRepo,
};
use super::schema;

pub(super) fn import_nested(
    connection: &mut Connection,
    input: super::import_model::PreparedImport,
) -> Result<super::import_model::ProjectGroupImportResult, ProjectCatalogError> {
    import::import_nested(connection, input)
}

pub(super) fn list(
    connection: &mut Connection,
) -> Result<ProjectGroupListResult, ProjectCatalogError> {
    schema::ensure(connection)?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Deferred)
        .map_err(ProjectCatalogError::storage)?;
    let groups = read::list(&transaction)?;
    let revision = revision::read(&transaction)?;
    transaction.commit().map_err(ProjectCatalogError::storage)?;
    Ok(ProjectGroupListResult { groups, revision })
}

pub(crate) fn find_group(
    connection: &rusqlite::Connection,
    group_id: &str,
) -> Result<Option<ProjectGroup>, ProjectCatalogError> {
    super::schema::ensure(connection)?;
    read::find(connection, group_id)
}

pub(super) fn create(
    connection: &mut Connection,
    input: ProjectGroupCreate,
) -> Result<ProjectGroupResult, ProjectCatalogError> {
    schema::ensure(connection)?;
    let transaction = immediate(connection)?;
    revision::assert(&transaction, input.expected_revision)?;
    let now = identity::now_millis()?;
    let id = identity::random_uuid()?;
    let tab_order: f64 = transaction
        .query_row(
            "SELECT COALESCE(MAX(tab_order), -1) + 1 FROM project_group",
            [],
            |row| row.get(0),
        )
        .map_err(ProjectCatalogError::storage)?;
    transaction
        .execute(
            "INSERT INTO project_group(
               id, name, parent_path, connection_id, parent_group_id, created_from,
               tab_order, is_collapsed, color, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, NULL, ?8, ?8)",
            params![
                id,
                normalize_name(&input.name, "Untitled group"),
                input.parent_path,
                input.connection_id,
                input.parent_group_id,
                input.created_from.database_value(),
                tab_order,
                now,
            ],
        )
        .map_err(ProjectCatalogError::storage)?;
    let group = read::find(&transaction, &id)?.ok_or(ProjectCatalogError::NotFound)?;
    let revision = revision::append(
        &transaction,
        "project-group.created",
        revision::id_payload("groupId", &id),
    )?;
    transaction.commit().map_err(ProjectCatalogError::storage)?;
    Ok(ProjectGroupResult { group, revision })
}

pub(super) fn update(
    connection: &mut Connection,
    input: ProjectGroupUpdate,
) -> Result<NullableProjectGroupResult, ProjectCatalogError> {
    schema::ensure(connection)?;
    let transaction = immediate(connection)?;
    revision::assert(&transaction, input.expected_revision)?;
    let Some(mut group) = read::find(&transaction, &input.group_id)? else {
        return unchanged(transaction, None);
    };
    apply_update(&mut group, input)?;
    transaction
        .execute(
            "UPDATE project_group SET name=?2, is_collapsed=?3, tab_order=?4,
                    color=?5, updated_at=?6 WHERE id=?1",
            params![
                group.id,
                group.name,
                group.is_collapsed,
                group.tab_order,
                group.color,
                group.updated_at,
            ],
        )
        .map_err(ProjectCatalogError::storage)?;
    let revision = revision::append(
        &transaction,
        "project-group.updated",
        revision::id_payload("groupId", &group.id),
    )?;
    transaction.commit().map_err(ProjectCatalogError::storage)?;
    Ok(NullableProjectGroupResult {
        group: Some(group),
        revision,
    })
}

pub(super) fn delete(
    connection: &mut Connection,
    input: ProjectGroupDelete,
) -> Result<ProjectGroupDeleteResult, ProjectCatalogError> {
    schema::ensure(connection)?;
    crate::folder_workspaces::ensure_schema(connection)?;
    let transaction = immediate(connection)?;
    revision::assert(&transaction, input.expected_revision)?;
    let exists = read::find(&transaction, &input.group_id)?.is_some();
    if !exists {
        let revision = revision::read(&transaction)?;
        transaction.commit().map_err(ProjectCatalogError::storage)?;
        return Ok(ProjectGroupDeleteResult {
            deleted: false,
            revision,
        });
    }
    let subtree = "WITH RECURSIVE subtree(id) AS (
      SELECT ?1 UNION ALL SELECT child.id FROM project_group child JOIN subtree parent
      ON child.parent_group_id = parent.id
    )";
    transaction
        .execute(
            &format!("{subtree} DELETE FROM project_group_membership WHERE group_id IN subtree"),
            [&input.group_id],
        )
        .map_err(ProjectCatalogError::storage)?;
    crate::folder_workspaces::delete_for_group_subtree(&transaction, &input.group_id)?;
    transaction
        .execute(
            &format!("{subtree} DELETE FROM project_group WHERE id IN subtree"),
            [&input.group_id],
        )
        .map_err(ProjectCatalogError::storage)?;
    let revision = revision::append(
        &transaction,
        "project-group.deleted",
        revision::id_payload("groupId", &input.group_id),
    )?;
    transaction.commit().map_err(ProjectCatalogError::storage)?;
    Ok(ProjectGroupDeleteResult {
        deleted: true,
        revision,
    })
}

pub(super) fn move_project(
    connection: &mut Connection,
    input: ProjectGroupMoveProject,
) -> Result<ProjectGroupMoveProjectResult, ProjectCatalogError> {
    schema::ensure(connection)?;
    let transaction = immediate(connection)?;
    revision::assert(&transaction, input.expected_revision)?;
    let project = project::resolve(&transaction, &input.project_selector)?;
    let group_id = input
        .group_id
        .filter(|id| read::find(&transaction, id).ok().flatten().is_some());
    let order = input
        .order
        .unwrap_or(next_order(&transaction, group_id.as_deref())?);
    transaction
        .execute(
            "INSERT INTO project_group_membership(project_id, group_id, project_order)
             VALUES (?1, ?2, ?3) ON CONFLICT(project_id) DO UPDATE SET
             group_id=excluded.group_id, project_order=excluded.project_order",
            params![project.storage_id, group_id, order],
        )
        .map_err(ProjectCatalogError::storage)?;
    let repo = RuntimeRepo {
        project_group_id: group_id.clone(),
        project_group_order: Some(order),
        ..project
    };
    let revision = revision::append(
        &transaction,
        "project.moved-to-group",
        [
            ("groupId", serde_json::json!(group_id)),
            ("projectId", serde_json::json!(repo.id)),
        ],
    )?;
    transaction.commit().map_err(ProjectCatalogError::storage)?;
    Ok(ProjectGroupMoveProjectResult { repo, revision })
}

fn immediate(
    connection: &mut Connection,
) -> Result<rusqlite::Transaction<'_>, ProjectCatalogError> {
    connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ProjectCatalogError::storage)
}

fn normalize_name(value: &str, fallback: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        fallback.to_owned()
    } else {
        trimmed.to_owned()
    }
}

fn unchanged(
    transaction: rusqlite::Transaction<'_>,
    group: Option<ProjectGroup>,
) -> Result<NullableProjectGroupResult, ProjectCatalogError> {
    let revision = revision::read(&transaction)?;
    transaction.commit().map_err(ProjectCatalogError::storage)?;
    Ok(NullableProjectGroupResult { group, revision })
}

fn apply_update(
    group: &mut ProjectGroup,
    input: ProjectGroupUpdate,
) -> Result<(), ProjectCatalogError> {
    if let Some(name) = input.name {
        group.name = normalize_name(&name, &group.name);
    }
    if let Some(value) = input.is_collapsed {
        group.is_collapsed = value;
    }
    if let Some(value) = input.tab_order {
        group.tab_order = value;
    }
    if let Some(value) = input.color {
        group.color = value;
    }
    group.updated_at = identity::now_millis()?;
    Ok(())
}

fn next_order(
    connection: &rusqlite::Connection,
    group_id: Option<&str>,
) -> Result<f64, ProjectCatalogError> {
    connection
        .query_row(
            "SELECT COALESCE(MAX(project_order), -1) + 1 FROM project_group_membership
             WHERE group_id IS ?1",
            [group_id],
            |row| row.get(0),
        )
        .map_err(ProjectCatalogError::storage)
}

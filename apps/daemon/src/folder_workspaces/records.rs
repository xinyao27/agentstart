mod read;

use rusqlite::{Connection, TransactionBehavior, params};
use serde_json::json;

use crate::project_groups::records::revision;
use crate::projects::{ProjectCatalogError, identity};

use super::schema;
use super::{
    FolderWorkspaceCreate, FolderWorkspaceDelete, FolderWorkspaceDeleteResult,
    FolderWorkspaceListResult, FolderWorkspaceResult, FolderWorkspaceUpdate,
    NullableFolderWorkspaceResult,
};

pub(super) fn list(
    connection: &mut Connection,
) -> Result<FolderWorkspaceListResult, ProjectCatalogError> {
    schema::ensure(connection)?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Deferred)
        .map_err(ProjectCatalogError::storage)?;
    let folder_workspaces = read::list(&transaction)?;
    let revision = revision::read(&transaction)?;
    transaction.commit().map_err(ProjectCatalogError::storage)?;
    Ok(FolderWorkspaceListResult {
        folder_workspaces,
        revision,
    })
}

pub(super) fn create(
    connection: &mut Connection,
    input: FolderWorkspaceCreate,
) -> Result<FolderWorkspaceResult, ProjectCatalogError> {
    schema::ensure(connection)?;
    let transaction = immediate(connection)?;
    revision::assert(&transaction, input.expected_revision)?;
    let group = crate::project_groups::records::find_group(&transaction, &input.project_group_id)?
        .ok_or(ProjectCatalogError::NotFound)?;
    let folder_path = input
        .folder_path
        .filter(|path| !path.trim().is_empty())
        .or(group.parent_path)
        .ok_or(ProjectCatalogError::NotFound)?;
    let now = schema::now()?;
    let id = identity::random_uuid()?;
    let name = normalize_name(input.name.as_deref(), &format!("{} workspace", group.name));
    let linked = input
        .linked_review
        .map(|value| serde_json::to_string(&value))
        .transpose()
        .map_err(ProjectCatalogError::storage)?;
    let pending = (input.pending_first_agent_message_rename == Some(true)
        && input.created_with_agent.is_some())
    .then_some(true);
    transaction
        .execute(
            "INSERT INTO folder_workspace(id, project_group_id, name, folder_path, connection_id,
         linked_review_json, comment, is_archived, is_unread, is_pinned, sort_order, manual_order,
         workspace_status, created_with_agent, pending_rename, has_rename_error, rename_error,
         last_activity_at, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,'',0,0,0,?7,NULL,NULL,?8,?9,0,NULL,0,?7,?7)",
            params![
                id,
                input.project_group_id,
                name,
                folder_path,
                input.connection_id.or(group.connection_id),
                linked,
                now,
                input.created_with_agent,
                pending
            ],
        )
        .map_err(ProjectCatalogError::storage)?;
    let folder_workspace = read::find(&transaction, &id)?.ok_or(ProjectCatalogError::NotFound)?;
    let revision = revision::append(
        &transaction,
        "folder-workspace.created",
        [("folderWorkspaceId", json!(id))],
    )?;
    transaction.commit().map_err(ProjectCatalogError::storage)?;
    Ok(FolderWorkspaceResult {
        folder_workspace,
        revision,
    })
}

pub(super) fn update(
    connection: &mut Connection,
    input: FolderWorkspaceUpdate,
) -> Result<NullableFolderWorkspaceResult, ProjectCatalogError> {
    schema::ensure(connection)?;
    let transaction = immediate(connection)?;
    revision::assert(&transaction, input.expected_revision)?;
    let Some(mut value) = read::find(&transaction, &input.folder_workspace_id)? else {
        let revision = revision::read(&transaction)?;
        transaction.commit().map_err(ProjectCatalogError::storage)?;
        return Ok(NullableFolderWorkspaceResult {
            folder_workspace: None,
            revision,
        });
    };
    if let Some(name) = input.name {
        value.name = normalize_name(Some(&name), &value.name);
    }
    if let Some(path) = input.folder_path.filter(|path| !path.trim().is_empty()) {
        value.folder_path = path;
    }
    if let Some(linked) = input.linked_review {
        value.linked_review = linked;
    }
    if let Some(comment) = input.comment {
        value.comment = comment;
    }
    if let Some(flag) = input.is_archived {
        value.is_archived = flag;
    }
    if let Some(flag) = input.is_unread {
        value.is_unread = flag;
    }
    if let Some(flag) = input.is_pinned {
        value.is_pinned = flag;
    }
    if let Some(order) = input.sort_order {
        value.sort_order = order;
    }
    if let Some(order) = input.manual_order {
        value.manual_order = Some(order);
    }
    if let Some(status) = input.workspace_status {
        value.workspace_status = Some(status);
    }
    if let Some(agent) = input.created_with_agent {
        value.created_with_agent = Some(agent);
    }
    if let Some(flag) = input.pending_first_agent_message_rename {
        value.pending_first_agent_message_rename = Some(flag);
    }
    if let Some(error) = input.first_agent_message_rename_error {
        value.first_agent_message_rename_error = Some(error);
    }
    if let Some(activity) = input.last_activity_at {
        value.last_activity_at = activity;
    }
    value.updated_at = schema::now()?;
    let linked = value
        .linked_review
        .as_ref()
        .map(serde_json::to_string)
        .transpose()
        .map_err(ProjectCatalogError::storage)?;
    transaction
        .execute(
            "UPDATE folder_workspace SET name=?2,folder_path=?3,linked_review_json=?4,comment=?5,
         is_archived=?6,is_unread=?7,is_pinned=?8,sort_order=?9,manual_order=?10,
         workspace_status=?11,created_with_agent=?12,pending_rename=?13,has_rename_error=?14,
         rename_error=?15,last_activity_at=?16,updated_at=?17 WHERE id=?1",
            params![
                value.id,
                value.name,
                value.folder_path,
                linked,
                value.comment,
                value.is_archived,
                value.is_unread,
                value.is_pinned,
                value.sort_order,
                value.manual_order,
                value.workspace_status,
                value.created_with_agent,
                value.pending_first_agent_message_rename,
                value.first_agent_message_rename_error.is_some(),
                value.first_agent_message_rename_error.clone().flatten(),
                value.last_activity_at,
                value.updated_at
            ],
        )
        .map_err(ProjectCatalogError::storage)?;
    let revision = revision::append(
        &transaction,
        "folder-workspace.updated",
        [("folderWorkspaceId", json!(value.id))],
    )?;
    transaction.commit().map_err(ProjectCatalogError::storage)?;
    Ok(NullableFolderWorkspaceResult {
        folder_workspace: Some(value),
        revision,
    })
}

pub(super) fn delete(
    connection: &mut Connection,
    input: FolderWorkspaceDelete,
) -> Result<FolderWorkspaceDeleteResult, ProjectCatalogError> {
    schema::ensure(connection)?;
    let transaction = immediate(connection)?;
    revision::assert(&transaction, input.expected_revision)?;
    let deleted = transaction
        .execute(
            "DELETE FROM folder_workspace WHERE id=?1",
            [&input.folder_workspace_id],
        )
        .map_err(ProjectCatalogError::storage)?
        > 0;
    let revision = if deleted {
        revision::append(
            &transaction,
            "folder-workspace.deleted",
            [("folderWorkspaceId", json!(input.folder_workspace_id))],
        )?
    } else {
        revision::read(&transaction)?
    };
    transaction.commit().map_err(ProjectCatalogError::storage)?;
    Ok(FolderWorkspaceDeleteResult { deleted, revision })
}

pub(crate) fn delete_for_group_subtree(
    transaction: &rusqlite::Transaction<'_>,
    group_id: &str,
) -> Result<(), ProjectCatalogError> {
    transaction
        .execute(
            "WITH RECURSIVE subtree(id) AS (
               SELECT ?1 UNION ALL SELECT child.id FROM project_group child JOIN subtree parent
               ON child.parent_group_id = parent.id
             ) DELETE FROM folder_workspace WHERE project_group_id IN subtree",
            [group_id],
        )
        .map_err(ProjectCatalogError::storage)?;
    Ok(())
}

fn normalize_name(value: Option<&str>, fallback: &str) -> String {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(fallback)
        .to_owned()
}

fn immediate(
    connection: &mut Connection,
) -> Result<rusqlite::Transaction<'_>, ProjectCatalogError> {
    connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ProjectCatalogError::storage)
}

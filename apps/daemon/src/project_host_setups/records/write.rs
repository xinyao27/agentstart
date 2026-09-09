use rusqlite::{Connection, OptionalExtension, Transaction, TransactionBehavior, params};

use crate::project_groups::records::revision;
use crate::projects::{Project, ProjectCatalogError, ProjectKind, identity, records};

use super::super::{
    ProjectHostSetup, SetupCreate, SetupMethod, SetupRepo, SetupState, StoredMutation,
    model::PreparedRepository,
};
use super::read;

pub(super) fn create(
    connection: &mut Connection,
    input: SetupCreate,
) -> Result<StoredMutation, ProjectCatalogError> {
    let transaction = immediate(connection)?;
    revision::assert(&transaction, input.expected_revision)?;
    if let Some(id) = find_project_host(&transaction, &input.project_id, &input.host_id)? {
        return Err(ProjectCatalogError::SetupExists(id));
    }
    let previous = crate::projects::wire_records::list_projects(&transaction)?;
    if !previous
        .iter()
        .any(|project| project.id == input.project_id)
    {
        return Err(ProjectCatalogError::NotFound);
    }
    let now = identity::now_millis()?;
    let base_id = input
        .setup_id
        .unwrap_or_else(|| format!("{}::{}", input.project_id, input.host_id));
    let id = available_id(&transaction, &base_id)?;
    transaction
        .execute(
            "INSERT INTO project_host_setup(
               id,project_id,host_id,repo_id,path,display_name,kind,worktree_base_path,
               git_username,setup_state,setup_method,created_at,updated_at
             ) VALUES (?1,?2,?3,'',?4,?5,?6,?7,?8,?9,?10,?11,?11)",
            params![
                id,
                input.project_id,
                input.host_id,
                input.path.unwrap_or_default(),
                input.display_name.unwrap_or_default(),
                input.kind.map(ProjectKind::database_value),
                input.worktree_base_path,
                input.git_username,
                input
                    .setup_state
                    .unwrap_or(SetupState::NotSetUp)
                    .database_value(),
                input
                    .setup_method
                    .unwrap_or(SetupMethod::Provisioned)
                    .database_value(),
                now,
            ],
        )
        .map_err(ProjectCatalogError::storage)?;
    crate::projects::independent::reconcile(&transaction, previous)?;
    finish(transaction, &id, None, "project-host-setup.created")
}

pub(super) fn insert_repository(
    transaction: &Transaction<'_>,
    input: &PreparedRepository,
) -> Result<Project, ProjectCatalogError> {
    let id = identity::random_uuid()?;
    let added_at = identity::now_millis()?;
    let primary = input
        .remotes
        .iter()
        .find(|remote| remote.remote_name == "origin")
        .or_else(|| input.remotes.first());
    transaction
        .execute(
            "INSERT INTO project(
               id,wire_id,path,host_id,display_name,badge_color,kind,remote_url,added_at
             ) VALUES (?1,?1,?2,?3,?4,'#737373',?5,?6,?7)",
            params![
                id,
                input.path,
                input.host_id,
                input.display_name,
                input.kind.database_value(),
                primary.map(|remote| remote.remote_url.as_str()),
                added_at,
            ],
        )
        .map_err(ProjectCatalogError::storage)?;
    records::find_id(transaction, &id)?.ok_or(ProjectCatalogError::NotFound)
}

pub(super) fn update_repo(
    transaction: &Transaction<'_>,
    setup: &ProjectHostSetup,
) -> Result<Option<Project>, ProjectCatalogError> {
    if setup.storage_repo_id.is_empty() {
        return Ok(None);
    }
    transaction
        .execute(
            "UPDATE project SET display_name=?2, kind=COALESCE(?3,kind) WHERE id=?1",
            params![
                setup.storage_repo_id,
                setup.display_name,
                setup.kind.map(ProjectKind::database_value),
            ],
        )
        .map_err(ProjectCatalogError::storage)?;
    records::find_id(transaction, &setup.storage_repo_id)
}

pub(super) fn finish(
    transaction: Transaction<'_>,
    setup_id: &str,
    repo: Option<Project>,
    event: &str,
) -> Result<StoredMutation, ProjectCatalogError> {
    let setup = read::find(&transaction, setup_id)?
        .ok_or_else(|| ProjectCatalogError::SetupNotFound(setup_id.to_owned()))?;
    let revision = revision::append(
        &transaction,
        event,
        [
            ("projectId", serde_json::json!(setup.project_id)),
            ("setupId", serde_json::json!(setup.id)),
        ],
    )?;
    transaction.commit().map_err(ProjectCatalogError::storage)?;
    Ok(StoredMutation {
        cleanup: None,
        repo: repo.map(|repo| wire_repo(repo, &setup)),
        revision,
        setup,
    })
}

pub(super) fn find_project_host(
    connection: &Connection,
    project_id: &str,
    host_id: &str,
) -> Result<Option<String>, ProjectCatalogError> {
    connection
        .query_row(
            "SELECT id FROM project_host_setup WHERE project_id=?1 AND host_id=?2 LIMIT 1",
            [project_id, host_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(ProjectCatalogError::storage)
}

pub(super) fn immediate(
    connection: &mut Connection,
) -> Result<Transaction<'_>, ProjectCatalogError> {
    connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ProjectCatalogError::storage)
}

pub(super) fn wire_repo(repo: Project, setup: &ProjectHostSetup) -> SetupRepo {
    SetupRepo {
        added_at: repo.added_at,
        badge_color: repo.badge_color,
        display_name: repo.display_name,
        execution_host_id: repo.execution_host_id,
        external_worktree_visibility: repo.external_worktree_visibility,
        git_remote_identity: repo.git_remote_identity,
        id: repo.id,
        kind: repo.kind,
        path: repo.path,
        project_host_setup_method: matches!(
            setup.setup_method,
            SetupMethod::Cloned | SetupMethod::ImportedExistingFolder
        )
        .then_some(setup.setup_method),
        upstream: setup.upstream.clone(),
        worktree_base_path: setup.worktree_base_path.clone(),
    }
}

fn available_id(connection: &Connection, base: &str) -> Result<String, ProjectCatalogError> {
    for suffix in 0_u64.. {
        let candidate = if suffix == 0 {
            base.to_owned()
        } else {
            format!("{base}-{suffix}")
        };
        if read::find(connection, &candidate)?.is_none() {
            return Ok(candidate);
        }
    }
    unreachable!("an available setup identifier exists")
}

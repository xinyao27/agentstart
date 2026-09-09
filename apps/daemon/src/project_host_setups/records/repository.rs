use rusqlite::{Connection, params};

use crate::project_groups::records::revision;
use crate::projects::{ProjectCatalogError, ProjectKind, identity, records};

use super::super::{
    CleanupTombstone, SetupDelete, SetupMethod, SetupState, SetupUpdate, StoredMutation,
    model::PreparedRepository,
};
use super::{read, write};

pub(super) fn attach(
    connection: &mut Connection,
    expected_revision: i64,
    prepared: PreparedRepository,
) -> Result<StoredMutation, ProjectCatalogError> {
    let transaction = write::immediate(connection)?;
    revision::assert(&transaction, expected_revision)?;
    let previous = crate::projects::wire_records::list_projects(&transaction)?;
    if !previous
        .iter()
        .any(|project| project.id == prepared.project_id)
    {
        return Err(ProjectCatalogError::NotFound);
    }
    let mut repo = match records::find_location(&transaction, &prepared.host_id, &prepared.path)? {
        Some(repo) => repo,
        None => write::insert_repository(&transaction, &prepared)?,
    };
    if prepared.setup_method == SetupMethod::Cloned && repo.kind == ProjectKind::Folder {
        transaction
            .execute(
                "UPDATE project SET kind='git' WHERE id=?1",
                [&repo.storage_id],
            )
            .map_err(ProjectCatalogError::storage)?;
        repo = records::find_id(&transaction, &repo.storage_id)?
            .ok_or(ProjectCatalogError::NotFound)?;
    }
    records::replace_all_remotes(&transaction, &repo.storage_id, &prepared.remotes)?;
    let primary = prepared
        .remotes
        .iter()
        .find(|remote| remote.remote_name == "origin")
        .or_else(|| prepared.remotes.first());
    let derived = crate::projects::wire_records::identity_for_repo(&repo.id, primary);
    let upstream = if derived == prepared.project_id {
        None
    } else {
        Some(
            prepared
                .selected_github
                .as_ref()
                .ok_or(ProjectCatalogError::SetupIdentityMismatch)?,
        )
    };
    let now = identity::now_millis()?;
    transaction
        .execute(
            "INSERT INTO project_host_setup(
               id,project_id,host_id,repo_id,path,display_name,kind,upstream_owner,
               upstream_repo,setup_state,setup_method,created_at,updated_at
             ) VALUES (?1,?2,?3,?1,?4,?5,?6,?7,?8,'ready',?9,?10,?10)
             ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id,
               host_id=excluded.host_id,repo_id=excluded.repo_id,path=excluded.path,
               display_name=excluded.display_name,kind=excluded.kind,
               upstream_owner=excluded.upstream_owner,upstream_repo=excluded.upstream_repo,
               setup_state='ready',setup_method=excluded.setup_method,updated_at=excluded.updated_at",
            params![
                repo.storage_id,
                prepared.project_id,
                prepared.host_id,
                prepared.path,
                prepared.display_name,
                prepared.kind.database_value(),
                upstream.map(|value| value.owner.as_str()),
                upstream.map(|value| value.repo.as_str()),
                prepared.setup_method.database_value(),
                now,
            ],
        )
        .map_err(ProjectCatalogError::storage)?;
    let repo_id = repo.storage_id.clone();
    let event = match prepared.setup_method {
        SetupMethod::Cloned => "project-host-setup.cloned",
        _ => "project-host-setup.existing-folder-configured",
    };
    crate::projects::independent::reconcile(&transaction, previous)?;
    write::finish(transaction, &repo_id, Some(repo), event)
}

pub(super) fn update(
    connection: &mut Connection,
    input: SetupUpdate,
) -> Result<StoredMutation, ProjectCatalogError> {
    let transaction = write::immediate(connection)?;
    revision::assert(&transaction, input.expected_revision)?;
    let mut setup = read::find(&transaction, &input.setup_id)?
        .or_else(|| input.fallback.map(|setup| *setup))
        .ok_or_else(|| ProjectCatalogError::SetupNotFound(input.setup_id.clone()))?;
    let repo_backed = !setup.repo_id.is_empty();
    let requested_path = input
        .path
        .as_ref()
        .map(|path| path.trim())
        .filter(|path| !path.is_empty());
    if repo_backed && requested_path.is_some_and(|path| path != setup.path) {
        return Err(ProjectCatalogError::SetupPathImmutable);
    }
    if repo_backed
        && input
            .setup_state
            .is_some_and(|state| state != SetupState::Ready)
    {
        return Err(ProjectCatalogError::SetupUnavailable);
    }
    if repo_backed && input.setup_method == Some(SetupMethod::Provisioned) {
        return Err(ProjectCatalogError::SetupProvisioned);
    }
    setup.display_name = input
        .display_name
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
        .unwrap_or(setup.display_name);
    setup.kind = input.kind.or(setup.kind);
    if input.worktree_base_path_present {
        setup.worktree_base_path = input
            .worktree_base_path
            .map(|value| value.trim().to_owned())
            .filter(|value| !value.is_empty());
    }
    if !repo_backed {
        if input.git_username_present {
            setup.git_username = input
                .git_username
                .map(|value| value.trim().to_owned())
                .filter(|value| !value.is_empty());
        }
        setup.path = requested_path.map(str::to_owned).unwrap_or(setup.path);
        setup.setup_state = input.setup_state.unwrap_or(setup.setup_state);
    }
    setup.setup_method = match input.setup_method {
        Some(SetupMethod::LegacyRepo) if repo_backed => setup.setup_method,
        Some(method) => method,
        None => setup.setup_method,
    };
    setup.updated_at = identity::now_millis()?;
    store_update(&transaction, &setup)?;
    let repo = write::update_repo(&transaction, &setup)?;
    write::finish(
        transaction,
        &setup.storage_id,
        repo,
        "project-host-setup.updated",
    )
}

pub(super) fn delete(
    connection: &mut Connection,
    input: SetupDelete,
) -> Result<StoredMutation, ProjectCatalogError> {
    let transaction = write::immediate(connection)?;
    revision::assert(&transaction, input.expected_revision)?;
    let previous = crate::projects::wire_records::list_projects(&transaction)?;
    let setup = read::find(&transaction, &input.setup_id)?
        .or_else(|| input.fallback.map(|setup| *setup))
        .ok_or_else(|| ProjectCatalogError::SetupNotFound(input.setup_id.clone()))?;
    let repo = records::find_id(&transaction, &setup.storage_repo_id)?;
    let survives_elsewhere = match repo.as_ref() {
        Some(project) => repo_survives_elsewhere(&transaction, &project.id, &project.storage_id)?,
        None => false,
    };
    let mut cleanup = (!setup.storage_repo_id.is_empty()).then(|| CleanupTombstone {
        drop_sparse_presets: !survives_elsewhere,
        host_id: setup.host_id.clone(),
        prune_all_hosts: !survives_elsewhere,
        repo_id: repo
            .as_ref()
            .map(|project| project.id.clone())
            .unwrap_or_else(|| setup.repo_id.clone()),
        storage_id: setup.storage_repo_id.clone(),
    });
    if let Some(value) = cleanup.as_mut() {
        transaction
            .execute(
                "INSERT INTO project_host_setup_cleanup(
                   repo_id,wire_repo_id,host_id,prune_all_hosts,drop_sparse_presets,created_at
                 ) VALUES (?1,?2,?3,?4,?5,?6)
                 ON CONFLICT(repo_id,host_id) DO UPDATE SET
                   wire_repo_id=excluded.wire_repo_id,
                   prune_all_hosts=MAX(prune_all_hosts,excluded.prune_all_hosts),
                   drop_sparse_presets=MAX(drop_sparse_presets,excluded.drop_sparse_presets)",
                params![
                    value.storage_id,
                    value.repo_id,
                    value.host_id,
                    value.prune_all_hosts,
                    value.drop_sparse_presets,
                    identity::now_millis()?
                ],
            )
            .map_err(ProjectCatalogError::storage)?;
        (value.prune_all_hosts, value.drop_sparse_presets) = transaction
            .query_row(
                "SELECT prune_all_hosts,drop_sparse_presets
                 FROM project_host_setup_cleanup WHERE repo_id=?1 AND host_id=?2",
                params![value.storage_id, value.host_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(ProjectCatalogError::storage)?;
    }
    transaction
        .execute(
            "DELETE FROM project_host_setup WHERE id=?1",
            [&setup.storage_id],
        )
        .map_err(ProjectCatalogError::storage)?;
    if !setup.storage_repo_id.is_empty() {
        transaction
            .execute("DELETE FROM project WHERE id=?1", [&setup.storage_repo_id])
            .map_err(ProjectCatalogError::storage)?;
    }
    crate::projects::independent::reconcile(&transaction, previous)?;
    let revision = revision::append(
        &transaction,
        "project-host-setup.deleted",
        [
            ("projectId", serde_json::json!(setup.project_id)),
            ("setupId", serde_json::json!(setup.id)),
        ],
    )?;
    transaction.commit().map_err(ProjectCatalogError::storage)?;
    Ok(StoredMutation {
        cleanup,
        repo: repo.map(|repo| write::wire_repo(repo, &setup)),
        revision,
        setup,
    })
}

fn repo_survives_elsewhere(
    connection: &Connection,
    wire_id: &str,
    storage_id: &str,
) -> Result<bool, ProjectCatalogError> {
    connection
        .query_row(
            "SELECT EXISTS(
               SELECT 1 FROM project
               WHERE wire_id=?1 AND id<>?2
             )",
            params![wire_id, storage_id],
            |row| row.get(0),
        )
        .map_err(ProjectCatalogError::storage)
}

fn store_update(
    transaction: &rusqlite::Transaction<'_>,
    setup: &super::super::ProjectHostSetup,
) -> Result<(), ProjectCatalogError> {
    transaction
        .execute(
            "INSERT INTO project_host_setup(
               id,project_id,host_id,repo_id,path,display_name,kind,worktree_base_path,
               git_username,upstream_owner,upstream_repo,setup_state,setup_method,
               created_at,updated_at
             ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)
             ON CONFLICT(id) DO UPDATE SET path=excluded.path,display_name=excluded.display_name,
               kind=excluded.kind,worktree_base_path=excluded.worktree_base_path,
               git_username=excluded.git_username,setup_state=excluded.setup_state,
               setup_method=excluded.setup_method,updated_at=excluded.updated_at",
            params![
                setup.storage_id,
                setup.project_id,
                setup.host_id,
                setup.storage_repo_id,
                setup.path,
                setup.display_name,
                setup.kind.map(ProjectKind::database_value),
                setup.worktree_base_path,
                setup.git_username,
                setup.upstream.as_ref().map(|value| value.owner.as_str()),
                setup.upstream.as_ref().map(|value| value.repo.as_str()),
                setup.setup_state.database_value(),
                setup.setup_method.database_value(),
                setup.created_at,
                setup.updated_at,
            ],
        )
        .map(|_| ())
        .map_err(ProjectCatalogError::storage)
}

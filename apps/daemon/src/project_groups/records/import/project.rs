use std::collections::HashMap;

use rusqlite::{OptionalExtension, Transaction, params};

use crate::projects::{ProjectCatalogError, identity};

use super::super::super::import_model::{
    PreparedImportProject, ProjectGroupImportProjectResult, ProjectGroupImportStatus,
};
use super::groups::GroupResolver;

const DEFAULT_BADGE_COLOR: &str = "#737373";

pub(super) struct ImportedProjectIdentity {
    storage_id: String,
    wire_id: String,
}

pub(super) fn import(
    transaction: &Transaction<'_>,
    groups: &mut GroupResolver<'_>,
    imported_ids: &mut HashMap<String, ImportedProjectIdentity>,
    prepared: PreparedImportProject,
) -> Result<ProjectGroupImportProjectResult, ProjectCatalogError> {
    let import_path = prepared
        .import_path
        .as_deref()
        .ok_or(ProjectCatalogError::NotFound)?;
    let key = normalized(import_path);
    if let Some(project) = imported_ids.get(&key) {
        return Ok(result(
            prepared.path,
            project.wire_id.clone(),
            ProjectGroupImportStatus::AlreadyKnown,
        ));
    }
    let group_id = groups.group_for_repo(&prepared.path)?;
    if let Some(project) = find_local_project(transaction, import_path)? {
        if let Some(group_id) = group_id {
            assign(transaction, &project.storage_id, &group_id, prepared.order)?;
        }
        let wire_id = project.wire_id.clone();
        imported_ids.insert(key, project);
        return Ok(result(
            prepared.path,
            wire_id,
            ProjectGroupImportStatus::AlreadyKnown,
        ));
    }
    let project_id = identity::random_uuid()?;
    let primary_remote = prepared
        .remotes
        .iter()
        .find(|remote| remote.remote_name == "origin")
        .or_else(|| prepared.remotes.first());
    transaction
        .execute(
            "INSERT INTO project(
               id, wire_id, path, host_id, display_name, badge_color, kind, remote_url, added_at
             ) VALUES (?1, ?1, ?2, 'local', ?3, ?4, 'git', ?5, ?6)",
            params![
                project_id,
                import_path,
                basename(import_path),
                DEFAULT_BADGE_COLOR,
                primary_remote.map(|remote| remote.remote_url.as_str()),
                identity::now_millis()?,
            ],
        )
        .map_err(ProjectCatalogError::storage)?;
    for remote in prepared.remotes {
        transaction
            .execute(
                "INSERT INTO project_remote(project_id, remote_name, remote_url, canonical_key)
                 VALUES (?1, ?2, ?3, ?4)",
                params![
                    project_id,
                    remote.remote_name,
                    remote.remote_url,
                    remote.canonical_key,
                ],
            )
            .map_err(ProjectCatalogError::storage)?;
    }
    if let Some(group_id) = group_id {
        assign(transaction, &project_id, &group_id, prepared.order)?;
    }
    imported_ids.insert(
        key,
        ImportedProjectIdentity {
            storage_id: project_id.clone(),
            wire_id: project_id.clone(),
        },
    );
    Ok(result(
        prepared.path,
        project_id,
        ProjectGroupImportStatus::Imported,
    ))
}

fn find_local_project(
    transaction: &Transaction<'_>,
    path: &str,
) -> Result<Option<ImportedProjectIdentity>, ProjectCatalogError> {
    let exact = transaction
        .query_row(
            "SELECT id,wire_id FROM project WHERE host_id='local' AND path=?1",
            [path],
            |row| {
                Ok(ImportedProjectIdentity {
                    storage_id: row.get(0)?,
                    wire_id: row.get(1)?,
                })
            },
        )
        .optional()
        .map_err(ProjectCatalogError::storage)?;
    if exact.is_some() || !cfg!(windows) {
        return Ok(exact);
    }
    let mut statement = transaction
        .prepare("SELECT id,wire_id,path FROM project WHERE host_id='local'")
        .map_err(ProjectCatalogError::storage)?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                ImportedProjectIdentity {
                    storage_id: row.get(0)?,
                    wire_id: row.get(1)?,
                },
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(ProjectCatalogError::storage)?;
    for row in rows {
        let (identity, candidate) = row.map_err(ProjectCatalogError::storage)?;
        if normalized(&candidate) == normalized(path) {
            return Ok(Some(identity));
        }
    }
    Ok(None)
}

fn assign(
    transaction: &Transaction<'_>,
    project_id: &str,
    group_id: &str,
    order: f64,
) -> Result<(), ProjectCatalogError> {
    transaction
        .execute(
            "INSERT INTO project_group_membership(project_id, group_id, project_order)
             VALUES (?1, ?2, ?3) ON CONFLICT(project_id) DO UPDATE SET
             group_id=excluded.group_id, project_order=excluded.project_order",
            params![project_id, group_id, order],
        )
        .map_err(ProjectCatalogError::storage)?;
    Ok(())
}

fn result(
    path: String,
    project_id: String,
    status: ProjectGroupImportStatus,
) -> ProjectGroupImportProjectResult {
    ProjectGroupImportProjectResult {
        error: None,
        path,
        project_id: Some(project_id),
        status,
    }
}

fn basename(path: &str) -> String {
    path.trim_end_matches(['/', '\\'])
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or_default()
        .to_owned()
}

fn normalized(path: &str) -> String {
    let path = path.replace('\\', "/").trim_end_matches('/').to_owned();
    if cfg!(windows) {
        path.to_lowercase()
    } else {
        path
    }
}

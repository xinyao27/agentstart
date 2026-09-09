use std::collections::HashMap;
use std::num::TryFromIntError;
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{Connection, OptionalExtension, Transaction, TransactionBehavior, params};
use serde_json::json;

use super::wire::{
    LocalWindowsRuntimePreference, ProjectProviderIdentity, ProjectWireUpdate, RuntimeProject,
    RuntimeProjectList, RuntimeProjectResult,
};
use super::{GitRemoteIdentity, ProjectCatalogError, ProjectKind, remotes};

const PROJECT_CATALOG_SCOPE: &str = "project-catalog";
// Why: This additive table preserves schema version 17 for existing installation databases.
type RepoRow = (
    String,
    String,
    String,
    String,
    String,
    Option<String>,
    i64,
    Option<String>,
    Option<String>,
    Option<String>,
);

pub(super) fn list(connection: &mut Connection) -> Result<RuntimeProjectList, ProjectCatalogError> {
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Deferred)
        .map_err(ProjectCatalogError::storage)?;
    let projects = list_projects(&transaction)?;
    let revision = read_revision(&transaction)?;
    transaction.commit().map_err(ProjectCatalogError::storage)?;
    Ok(RuntimeProjectList { projects, revision })
}

pub(super) fn update(
    connection: &mut Connection,
    input: ProjectWireUpdate,
) -> Result<RuntimeProjectResult, ProjectCatalogError> {
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ProjectCatalogError::storage)?;
    assert_revision(&transaction, input.expected_revision)?;
    let mut project = list_projects(&transaction)?
        .into_iter()
        .find(|project| project.id == input.project_id)
        .ok_or(ProjectCatalogError::NotFound)?;
    let preference = input
        .local_windows_runtime_preference
        .map(LocalWindowsRuntimePreference::normalized)
        .or(project.local_windows_runtime_preference);
    let updated_at = epoch_millis()?;
    if let Some(preference) = preference.as_ref() {
        write_metadata(&transaction, &input.project_id, preference, updated_at)?;
    }
    project.local_windows_runtime_preference = preference;
    project.updated_at = updated_at;
    super::independent::reconcile(&transaction, vec![project.clone()])?;
    let revision = append_event(&transaction, &input.project_id)?;
    transaction.commit().map_err(ProjectCatalogError::storage)?;
    Ok(RuntimeProjectResult { project, revision })
}

pub(crate) fn list_projects(
    connection: &Connection,
) -> Result<Vec<RuntimeProject>, ProjectCatalogError> {
    let mut projects = list_repo_projects(connection)?;
    let ids = projects
        .iter()
        .map(|project| project.id.clone())
        .collect::<std::collections::HashSet<_>>();
    projects.extend(
        super::independent::list(connection)?
            .into_iter()
            .filter(|project| !ids.contains(&project.id)),
    );
    for project in &mut projects {
        if let Some((preference, updated_at)) = read_metadata(connection, &project.id)? {
            project.local_windows_runtime_preference = Some(preference);
            project.updated_at = project.updated_at.max(updated_at);
        }
    }
    Ok(projects)
}

pub(crate) fn list_repo_projects(
    connection: &Connection,
) -> Result<Vec<RuntimeProject>, ProjectCatalogError> {
    crate::project_host_setups::ensure_schema(connection)?;
    let icons = crate::repositories::repo_icons(connection)?;
    let mut statement = connection
        .prepare(
            "SELECT project.id, project.wire_id, project.display_name, project.badge_color, project.kind,
                    project.remote_url, project.added_at, project_host_setup.project_id,
                    project_host_setup.upstream_owner, project_host_setup.upstream_repo
             FROM project LEFT JOIN project_host_setup
               ON project_host_setup.repo_id = project.id
             LEFT JOIN project_catalog_order ON project_catalog_order.project_id=project.id
             ORDER BY project_catalog_order.position IS NULL,
                      project_catalog_order.position, project.added_at, project.id",
        )
        .map_err(ProjectCatalogError::storage)?;
    let rows = statement
        .query_map([], read_repo_row)
        .map_err(ProjectCatalogError::storage)?;
    let mut projects = Vec::<RuntimeProject>::new();
    let mut positions = HashMap::<String, usize>::new();
    for row in rows {
        let projected = project_from_repo(row.map_err(ProjectCatalogError::storage)?, &icons)?;
        if let Some(index) = positions.get(&projected.id).copied() {
            merge_repo(&mut projects[index], projected);
        } else {
            positions.insert(projected.id.clone(), projects.len());
            projects.push(projected);
        }
    }
    drop(statement);
    Ok(projects)
}

fn read_repo_row(row: &rusqlite::Row<'_>) -> Result<RepoRow, rusqlite::Error> {
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

fn project_from_repo(
    row: RepoRow,
    icons: &HashMap<String, serde_json::Value>,
) -> Result<RuntimeProject, ProjectCatalogError> {
    let (
        storage_id,
        repo_id,
        display_name,
        badge_color,
        kind,
        remote_url,
        added_at,
        setup_project_id,
        upstream_owner,
        upstream_repo,
    ) = row;
    let kind = match kind.as_str() {
        "folder" => ProjectKind::Folder,
        "git" => ProjectKind::Git,
        _ => return Err(ProjectCatalogError::InvalidKind(kind)),
    };
    let git_remote_identity = remote_url
        .as_deref()
        .and_then(|remote_url| remotes::normalize("origin", remote_url));
    let repo_icon = icons.get(&storage_id).cloned();
    let provider_identity = match (upstream_owner, upstream_repo) {
        (Some(owner), Some(repo)) if !owner.trim().is_empty() && !repo.trim().is_empty() => Some(
            ProjectProviderIdentity::github(owner.trim().to_owned(), repo.trim().to_owned()),
        ),
        _ => repo_icon
            .as_ref()
            .and_then(icon_provider_identity)
            .or_else(|| git_remote_identity.as_ref().and_then(provider_identity)),
    };
    let id = setup_project_id.unwrap_or_else(|| {
        project_id(
            &repo_id,
            provider_identity.as_ref(),
            git_remote_identity.as_ref(),
        )
    });
    Ok(RuntimeProject {
        badge_color,
        created_at: added_at,
        display_name,
        git_remote_identity,
        id,
        kind: Some(kind),
        local_windows_runtime_preference: None,
        provider_identity,
        repo_icon,
        source_repo_ids: vec![repo_id],
        updated_at: added_at,
    })
}

fn merge_repo(project: &mut RuntimeProject, repo: RuntimeProject) {
    for repo_id in repo.source_repo_ids {
        if !project.source_repo_ids.contains(&repo_id) {
            project.source_repo_ids.push(repo_id);
        }
    }
    project.created_at = project.created_at.min(repo.created_at);
    project.updated_at = project.updated_at.max(repo.updated_at);
}

fn project_id(
    repo_id: &str,
    provider: Option<&ProjectProviderIdentity>,
    remote: Option<&GitRemoteIdentity>,
) -> String {
    if let Some(provider) = provider {
        provider.identity_key()
    } else if let Some(remote) = remote {
        format!("git:{}", remote.canonical_key.trim())
    } else {
        format!("repo:{repo_id}")
    }
}

fn icon_provider_identity(icon: &serde_json::Value) -> Option<ProjectProviderIdentity> {
    if icon.get("type").and_then(serde_json::Value::as_str) != Some("image")
        || icon.get("source").and_then(serde_json::Value::as_str) != Some("github")
    {
        return None;
    }
    let mut parts = icon.get("label")?.as_str()?.trim().split('/');
    let owner = parts.next()?.trim();
    let repo = parts.next()?.trim();
    if owner.is_empty() || repo.is_empty() || parts.next().is_some() {
        return None;
    }
    Some(ProjectProviderIdentity::github(
        owner.to_owned(),
        repo.to_owned(),
    ))
}

fn provider_identity(identity: &GitRemoteIdentity) -> Option<ProjectProviderIdentity> {
    let path = identity.canonical_key.trim().strip_prefix("github.com/")?;
    let mut parts = path.split('/');
    let owner = parts.next()?.trim();
    let repo = parts.next()?.trim();
    if owner.is_empty() || repo.is_empty() || parts.next().is_some() {
        return None;
    }
    Some(ProjectProviderIdentity::github(
        owner.to_owned(),
        repo.to_owned(),
    ))
}

pub(crate) fn identity_for_repo(repo_id: &str, remote: Option<&GitRemoteIdentity>) -> String {
    let provider = remote.and_then(provider_identity);
    project_id(repo_id, provider.as_ref(), remote)
}

fn read_metadata(
    connection: &Connection,
    project_id: &str,
) -> Result<Option<(LocalWindowsRuntimePreference, i64)>, ProjectCatalogError> {
    connection
        .query_row(
            "SELECT local_windows_runtime_kind, wsl_distro, updated_at
             FROM project_wire_metadata WHERE project_id = ?1",
            [project_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, i64>(2)?,
                ))
            },
        )
        .optional()
        .map_err(ProjectCatalogError::storage)?
        .map(|(kind, distro, updated_at)| {
            decode_preference(kind, distro).map(|preference| (preference, updated_at))
        })
        .transpose()
}

fn decode_preference(
    kind: String,
    distro: Option<String>,
) -> Result<LocalWindowsRuntimePreference, ProjectCatalogError> {
    match kind.as_str() {
        "inherit-global" => Ok(LocalWindowsRuntimePreference::InheritGlobal),
        "windows-host" => Ok(LocalWindowsRuntimePreference::WindowsHost),
        "wsl" => Ok(distro
            .filter(|value| !value.is_empty())
            .map_or(LocalWindowsRuntimePreference::InheritGlobal, |distro| {
                LocalWindowsRuntimePreference::Wsl { distro }
            })),
        _ => Err(ProjectCatalogError::storage(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            format!("invalid project runtime preference {kind}"),
        ))),
    }
}

fn write_metadata(
    transaction: &Transaction<'_>,
    project_id: &str,
    preference: &LocalWindowsRuntimePreference,
    updated_at: i64,
) -> Result<(), ProjectCatalogError> {
    let (kind, distro) = preference.database_values();
    transaction
        .execute(
            "INSERT INTO project_wire_metadata(
               project_id, local_windows_runtime_kind, wsl_distro, updated_at
             ) VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(project_id) DO UPDATE SET
               local_windows_runtime_kind = excluded.local_windows_runtime_kind,
               wsl_distro = excluded.wsl_distro,
               updated_at = excluded.updated_at",
            params![project_id, kind, distro, updated_at],
        )
        .map(|_| ())
        .map_err(ProjectCatalogError::storage)
}

fn assert_revision(
    transaction: &Transaction<'_>,
    expected_revision: i64,
) -> Result<(), ProjectCatalogError> {
    let actual_revision = read_revision(transaction)?;
    if actual_revision == expected_revision {
        Ok(())
    } else {
        Err(ProjectCatalogError::RevisionConflict {
            actual_revision,
            expected_revision,
            scope: PROJECT_CATALOG_SCOPE,
        })
    }
}

fn read_revision(connection: &Connection) -> Result<i64, ProjectCatalogError> {
    connection
        .query_row(
            "SELECT revision FROM workspace_revision WHERE scope = ?1",
            [PROJECT_CATALOG_SCOPE],
            |row| row.get(0),
        )
        .optional()
        .map(|revision| revision.unwrap_or(0))
        .map_err(ProjectCatalogError::storage)
}

fn append_event(
    transaction: &Transaction<'_>,
    project_id: &str,
) -> Result<i64, ProjectCatalogError> {
    let revision = read_revision(transaction)?
        .checked_add(1)
        .ok_or(ProjectCatalogError::RevisionUnavailable)?;
    transaction
        .execute(
            "INSERT INTO workspace_revision(scope, revision) VALUES (?1, ?2)
             ON CONFLICT(scope) DO UPDATE SET revision = excluded.revision",
            params![PROJECT_CATALOG_SCOPE, revision],
        )
        .map_err(ProjectCatalogError::storage)?;
    transaction
        .execute(
            "INSERT INTO workspace_event(scope, revision, kind, payload, occurred_at)
             VALUES (?1, ?2, 'project.updated', ?3, ?4)",
            params![
                PROJECT_CATALOG_SCOPE,
                revision,
                serde_json::to_string(&json!({ "projectId": project_id }))
                    .map_err(ProjectCatalogError::storage)?,
                epoch_millis()?
            ],
        )
        .map_err(ProjectCatalogError::storage)?;
    Ok(revision)
}

fn epoch_millis() -> Result<i64, ProjectCatalogError> {
    let millis = SystemTime::now().duration_since(UNIX_EPOCH)?.as_millis();
    i64::try_from(millis).map_err(milliseconds_overflow)
}

fn milliseconds_overflow(error: TryFromIntError) -> ProjectCatalogError {
    ProjectCatalogError::storage(rusqlite::Error::ToSqlConversionFailure(Box::new(error)))
}

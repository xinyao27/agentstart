use rusqlite::{Connection, OptionalExtension};

use crate::projects::{ProjectCatalogError, ProjectKind};

use super::super::{ProjectHostSetup, SetupMethod, SetupState};

type SetupRow = (
    String,
    String,
    String,
    String,
    String,
    String,
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
    String,
    String,
    i64,
    i64,
    Option<String>,
);

pub(super) fn list(connection: &Connection) -> Result<Vec<ProjectHostSetup>, ProjectCatalogError> {
    let mut statement = connection
        .prepare(
            "SELECT project_host_setup.id, project_host_setup.project_id,
                    project_host_setup.host_id, project_host_setup.repo_id,
                    project_host_setup.path, project_host_setup.display_name,
                    project_host_setup.kind,
                    worktree_base_path, git_username, upstream_owner, upstream_repo,
                    setup_state, setup_method,
                    project_host_setup.created_at, project_host_setup.updated_at, project.wire_id
             FROM project_host_setup LEFT JOIN project ON project.id=project_host_setup.repo_id
             ORDER BY project_host_setup.created_at ASC, project_host_setup.id ASC",
        )
        .map_err(ProjectCatalogError::storage)?;
    let rows = statement
        .query_map([], row)
        .map_err(ProjectCatalogError::storage)?;
    rows.map(|row| decode(row.map_err(ProjectCatalogError::storage)?))
        .collect()
}

pub(super) fn find(
    connection: &Connection,
    id: &str,
) -> Result<Option<ProjectHostSetup>, ProjectCatalogError> {
    connection
        .query_row(
            "SELECT project_host_setup.id, project_host_setup.project_id,
                    project_host_setup.host_id, project_host_setup.repo_id,
                    project_host_setup.path, project_host_setup.display_name,
                    project_host_setup.kind,
                    worktree_base_path, git_username, upstream_owner, upstream_repo,
                    setup_state, setup_method,
                    project_host_setup.created_at, project_host_setup.updated_at, project.wire_id
             FROM project_host_setup LEFT JOIN project ON project.id=project_host_setup.repo_id
             WHERE project_host_setup.id=?1",
            [id],
            row,
        )
        .optional()
        .map_err(ProjectCatalogError::storage)?
        .map(decode)
        .transpose()
}

fn row(row: &rusqlite::Row<'_>) -> Result<SetupRow, rusqlite::Error> {
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
    ))
}

fn decode(row: SetupRow) -> Result<ProjectHostSetup, ProjectCatalogError> {
    let (
        id,
        project_id,
        host_id,
        repo_id,
        path,
        display_name,
        kind,
        worktree_base_path,
        git_username,
        upstream_owner,
        upstream_repo,
        setup_state,
        setup_method,
        created_at,
        updated_at,
        wire_repo_id,
    ) = row;
    let storage_id = id;
    let storage_repo_id = repo_id;
    let repo_id = wire_repo_id.unwrap_or_else(|| storage_repo_id.clone());
    let id = storage_id.clone();
    let execution_host_id = (!storage_repo_id.is_empty()).then(|| host_id.clone());
    Ok(ProjectHostSetup {
        created_at,
        display_name,
        execution_host_id,
        git_username,
        host_id,
        id,
        kind: kind.as_deref().map(parse_kind).transpose()?,
        path,
        project_id,
        repo_id,
        setup_method: SetupMethod::parse(&setup_method)
            .ok_or_else(|| invalid("setup method", setup_method))?,
        setup_state: SetupState::parse(&setup_state)
            .ok_or_else(|| invalid("setup state", setup_state))?,
        updated_at,
        worktree_base_path,
        storage_id,
        storage_repo_id,
        upstream: match (upstream_owner, upstream_repo) {
            (Some(owner), Some(repo)) => Some(super::super::GitHubIdentity { owner, repo }),
            _ => None,
        },
    })
}

fn parse_kind(value: &str) -> Result<ProjectKind, ProjectCatalogError> {
    match value {
        "folder" => Ok(ProjectKind::Folder),
        "git" => Ok(ProjectKind::Git),
        _ => Err(invalid("setup kind", value.to_owned())),
    }
}

fn invalid(label: &str, value: String) -> ProjectCatalogError {
    ProjectCatalogError::storage(std::io::Error::new(
        std::io::ErrorKind::InvalidData,
        format!("invalid {label} {value}"),
    ))
}

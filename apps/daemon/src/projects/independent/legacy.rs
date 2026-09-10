use std::collections::HashSet;
use std::fs;
use std::io;
use std::path::Path;

use rusqlite::{Connection, TransactionBehavior, params};
use serde::Deserialize;
use serde_json::{Map, Value};

use super::records;
use crate::projects::{ProjectCatalogError, ProjectKind, RuntimeProject, wire_records};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacySetup {
    id: String,
    project_id: String,
    host_id: String,
    #[serde(default)]
    repo_id: String,
    path: String,
    display_name: String,
    kind: Option<ProjectKind>,
    worktree_base_path: Option<String>,
    git_username: Option<String>,
    setup_state: String,
    setup_method: String,
    created_at: i64,
    updated_at: i64,
}

pub(in crate::projects) fn import(
    connection: &mut Connection,
    root: &Path,
) -> Result<(), ProjectCatalogError> {
    crate::project_host_setups::ensure_schema(connection)?;
    records::ensure(connection)?;
    let done: bool = connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM project_independent_import WHERE id=1)",
            [],
            |row| row.get(0),
        )
        .map_err(ProjectCatalogError::storage)?;
    if done {
        return Ok(());
    }
    let mut document = read_recoverable(&root.join("agentstart-data.json"))?.unwrap_or_default();
    if let Some(region) = read_recoverable(&root.join("agentstart-data-projects.json"))? {
        document.extend(region);
    }
    let mut projects: Vec<RuntimeProject> = decode_array(&mut document, "projects")?;
    for project in &mut projects {
        // Why: legacy projects omit the default git kind, but protobuf clients require it.
        project.kind.get_or_insert(ProjectKind::Git);
    }
    let setups: Vec<LegacySetup> = decode_array(&mut document, "projectHostSetups")?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ProjectCatalogError::storage)?;
    let current = wire_records::list_projects(&transaction)?;
    let repo_ids = crate::projects::records::list(&transaction)?
        .into_iter()
        .map(|repo| repo.id)
        .collect::<HashSet<_>>();
    let project_ids = projects
        .iter()
        .chain(&current)
        .map(|project| project.id.as_str())
        .collect::<HashSet<_>>();
    for setup in setups {
        if repo_ids.contains(&setup.id)
            || (!setup.repo_id.is_empty()
                && (repo_ids.contains(&setup.repo_id) || setup.id == setup.repo_id))
            || !project_ids.contains(setup.project_id.as_str())
        {
            continue;
        }
        // Why: Bun treats a dangling repo reference with a distinct setup id as independent;
        // normalize that reference so future deletion cannot mistake it for a source repo.
        transaction
            .execute(
                "INSERT INTO project_host_setup(
               id,project_id,host_id,repo_id,path,display_name,kind,worktree_base_path,
               git_username,setup_state,setup_method,created_at,updated_at
             ) VALUES (?1,?2,?3,'',?4,?5,?6,?7,?8,?9,?10,?11,?12)
             ON CONFLICT(id) DO NOTHING",
                params![
                    setup.id,
                    setup.project_id,
                    setup.host_id,
                    setup.path,
                    setup.display_name,
                    setup.kind.map(ProjectKind::database_value),
                    setup.worktree_base_path,
                    setup.git_username,
                    setup.setup_state,
                    setup.setup_method,
                    setup.created_at,
                    setup.updated_at
                ],
            )
            .map_err(ProjectCatalogError::storage)?;
    }
    for project in &projects {
        if let Some(preference) = project.local_windows_runtime_preference.as_ref() {
            let preference = preference.clone().normalized();
            let (kind, distro) = preference.database_values();
            transaction.execute(
                "INSERT INTO project_wire_metadata(project_id,local_windows_runtime_kind,wsl_distro,updated_at)
                 VALUES (?1,?2,?3,?4) ON CONFLICT(project_id) DO NOTHING",
                params![project.id, kind, distro, project.updated_at],
            ).map_err(ProjectCatalogError::storage)?;
        }
    }
    let existing = current
        .iter()
        .map(|project| project.id.clone())
        .collect::<HashSet<_>>();
    let mut candidates = current;
    candidates.extend(
        projects
            .into_iter()
            .filter(|project| !existing.contains(&project.id)),
    );
    records::reconcile(&transaction, candidates)?;
    transaction
        .execute("INSERT INTO project_independent_import(id) VALUES (1)", [])
        .map_err(ProjectCatalogError::storage)?;
    transaction.commit().map_err(ProjectCatalogError::storage)
}

fn decode_array<T: serde::de::DeserializeOwned>(
    document: &mut Map<String, Value>,
    key: &str,
) -> Result<Vec<T>, ProjectCatalogError> {
    match document.remove(key) {
        None => Ok(Vec::new()),
        Some(value) => serde_json::from_value(value).map_err(ProjectCatalogError::storage),
    }
}

fn read_recoverable(path: &Path) -> Result<Option<Map<String, Value>>, ProjectCatalogError> {
    let mut failure = None;
    for index in 0..=5 {
        let candidate = if index == 0 {
            path.to_owned()
        } else {
            let mut name = path.as_os_str().to_owned();
            name.push(format!(".bak.{}", index - 1));
            name.into()
        };
        let bytes = match fs::read(&candidate) {
            Ok(bytes) => bytes,
            Err(error) if error.kind() == io::ErrorKind::NotFound => continue,
            Err(error) => {
                failure = Some(ProjectCatalogError::storage(error));
                continue;
            }
        };
        match decode_document(&bytes) {
            Ok(document) => return Ok(Some(document)),
            Err(error) => failure = Some(error),
        }
    }
    match failure {
        Some(error) => Err(error),
        None => Ok(None),
    }
}

fn decode_document(bytes: &[u8]) -> Result<Map<String, Value>, ProjectCatalogError> {
    let document: Map<String, Value> =
        serde_json::from_slice(bytes).map_err(ProjectCatalogError::storage)?;
    if let Some(projects) = document.get("projects") {
        serde_json::from_value::<Vec<RuntimeProject>>(projects.clone())
            .map_err(ProjectCatalogError::storage)?;
    }
    if let Some(setups) = document.get("projectHostSetups") {
        serde_json::from_value::<Vec<LegacySetup>>(setups.clone())
            .map_err(ProjectCatalogError::storage)?;
    }
    Ok(document)
}

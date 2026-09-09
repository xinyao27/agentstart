mod groups;
mod project;

use std::collections::HashMap;

use crate::projects::ProjectCatalogError;

use super::super::import_model::{
    PreparedImport, ProjectGroupImportProjectResult, ProjectGroupImportResult,
    ProjectGroupImportStatus,
};
use super::{immediate, revision};

pub(super) fn import_nested(
    connection: &mut rusqlite::Connection,
    input: PreparedImport,
) -> Result<ProjectGroupImportResult, ProjectCatalogError> {
    super::super::schema::ensure(connection)?;
    let transaction = immediate(connection)?;
    revision::assert(&transaction, input.expected_revision)?;
    let scopes = super::super::import_scope::build(&input.parent_path, &input.scope_paths);
    let mut groups = groups::GroupResolver::new(
        &transaction,
        input.mode,
        input.parent_path,
        input.group_name,
        scopes,
    );
    let mut projects = Vec::with_capacity(input.projects.len());
    let mut imported_ids: HashMap<String, project::ImportedProjectIdentity> = HashMap::new();
    let mut imported_count = 0;
    let mut already_known_count = 0;
    let mut failed_count = 0;
    for prepared in input.projects {
        let result = match prepared.rejection {
            Some(error) => ProjectGroupImportProjectResult::failed(prepared.path, error),
            None => project::import(&transaction, &mut groups, &mut imported_ids, prepared)?,
        };
        match result.status {
            ProjectGroupImportStatus::AlreadyKnown => already_known_count += 1,
            ProjectGroupImportStatus::Failed => failed_count += 1,
            ProjectGroupImportStatus::Imported => imported_count += 1,
        }
        projects.push(result);
    }
    let group = groups.root();
    let has_event = group.is_some() || imported_count > 0;
    let revision = if has_event {
        revision::append(
            &transaction,
            "project.nested-imported",
            [
                ("importedCount", serde_json::json!(imported_count)),
                ("mode", serde_json::json!(input.mode.database_value())),
            ],
        )?
    } else {
        revision::read(&transaction)?
    };
    transaction.commit().map_err(ProjectCatalogError::storage)?;
    Ok(ProjectGroupImportResult {
        already_known_count,
        failed_count,
        group,
        imported_count,
        projects,
        revision,
    })
}

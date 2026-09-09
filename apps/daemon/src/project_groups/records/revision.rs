use rusqlite::{Connection, Transaction};
use serde_json::{Value, json};

use crate::persistence::{WorkspaceEventPayload, append_workspace_event, workspace_revision};
use crate::projects::{ProjectCatalogError, identity::now_millis};

pub(super) const SCOPE: &str = "project-catalog";

pub(crate) fn read(connection: &Connection) -> Result<i64, ProjectCatalogError> {
    workspace_revision(connection, SCOPE).map_err(ProjectCatalogError::storage)
}

pub(crate) fn assert(
    transaction: &Transaction<'_>,
    expected_revision: i64,
) -> Result<(), ProjectCatalogError> {
    let actual_revision = read(transaction)?;
    if actual_revision == expected_revision {
        Ok(())
    } else {
        Err(ProjectCatalogError::RevisionConflict {
            actual_revision,
            expected_revision,
            scope: SCOPE,
        })
    }
}

pub(crate) fn append(
    transaction: &Transaction<'_>,
    kind: &str,
    values: impl IntoIterator<Item = (&'static str, Value)>,
) -> Result<i64, ProjectCatalogError> {
    let payload = values
        .into_iter()
        .map(|(key, value)| (key.to_owned(), value))
        .collect::<WorkspaceEventPayload>();
    append_workspace_event(transaction, SCOPE, kind, payload, now_millis()?)
        .map(|event| event.revision)
        .map_err(ProjectCatalogError::storage)
}

pub(super) fn id_payload(key: &'static str, id: &str) -> [(&'static str, Value); 1] {
    [(key, json!(id))]
}

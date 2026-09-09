pub(super) mod protocol;
pub(super) mod protocol_values;

use crate::project_host_setups::ProjectHostSetupAuthority;
use crate::projects::ProjectCatalogError;

#[derive(Clone)]
pub(crate) struct ProjectHostSetupRpc {
    pub(super) authority: ProjectHostSetupAuthority,
}

impl ProjectHostSetupRpc {
    pub(crate) fn new(authority: ProjectHostSetupAuthority) -> Self {
        Self { authority }
    }
}

// Why: both the workspaceRevisionConflict status projection and its
// actual/expected/scope detail originate here, so the protobuf handlers cannot
// drift from the legacy error shape callers still display.
pub(super) fn revision_conflict(
    error: &crate::project_host_setups::ProjectHostSetupError,
) -> Option<(i64, i64, String)> {
    match error {
        crate::project_host_setups::ProjectHostSetupError::Catalog(
            ProjectCatalogError::RevisionConflict {
                actual_revision,
                expected_revision,
                scope,
            },
        ) => Some((*actual_revision, *expected_revision, (*scope).to_owned())),
        _ => None,
    }
}

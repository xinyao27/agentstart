use agentstart_protocol::protocol::v1::{Status, StatusCode};
use agentstart_protocol::runtime::v1::project_runtime_preference::Kind as PreferenceKind;
use agentstart_protocol::runtime::v1::{ProjectServiceListRequest, ProjectServiceUpdateRequest};
use agentstart_protocol::transport::{decode, encode};

use crate::projects::ProjectCatalogError;
use crate::projects::wire::LocalWindowsRuntimePreference;
use crate::projects::wire::ProjectWireUpdate;

use super::ProjectRpc;
use super::protocol_values::{internal_error, project_list, project_result};

pub(in crate::rpc) async fn list(rpc: &ProjectRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    decode::<ProjectServiceListRequest>(payload)?;
    let list = rpc.catalog.runtime_list().await.map_err(catalog_status)?;
    Ok(encode(&project_list(&list)))
}

pub(in crate::rpc) async fn update(rpc: &ProjectRpc, payload: &[u8]) -> Result<Vec<u8>, Status> {
    let request = decode::<ProjectServiceUpdateRequest>(payload)?;
    if request.project_id.is_empty() {
        return Err(status(
            StatusCode::InvalidArgument,
            "Project id must not be empty",
        ));
    }
    // Why: the legacy surface requires the updates object to be present even
    // when it carries no preference, so a missing message is a 400 rather than
    // a silently skipped write.
    let updates = request
        .updates
        .ok_or_else(|| status(StatusCode::InvalidArgument, "Project updates are required"))?;
    let input = ProjectWireUpdate {
        expected_revision: request.expected_revision,
        local_windows_runtime_preference: updates
            .local_windows_runtime_preference
            .map(preference)
            .transpose()?,
        project_id: request.project_id,
    };
    let result = rpc
        .catalog
        .runtime_update(input)
        .await
        .map_err(catalog_status)?;
    Ok(encode(&project_result(&result)))
}

fn preference(
    value: agentstart_protocol::runtime::v1::ProjectRuntimePreference,
) -> Result<LocalWindowsRuntimePreference, Status> {
    match value.kind {
        Some(PreferenceKind::InheritGlobal(_)) => Ok(LocalWindowsRuntimePreference::InheritGlobal),
        Some(PreferenceKind::WindowsHost(_)) => Ok(LocalWindowsRuntimePreference::WindowsHost),
        Some(PreferenceKind::WslDistro(distro)) if !distro.is_empty() => {
            Ok(LocalWindowsRuntimePreference::Wsl { distro })
        }
        _ => Err(status(
            StatusCode::InvalidArgument,
            "Local Windows runtime preference is invalid",
        )),
    }
}

// Why: revision conflicts are the legacy surface's one structured catalog
// error (`workspaceRevisionConflict` with expected/actual/scope), so they map
// to a precondition failure carrying that shape while everything else stays a
// generic internal failure like the legacy dispatcher.
fn catalog_status(error: ProjectCatalogError) -> Status {
    if let ProjectCatalogError::RevisionConflict {
        actual_revision,
        expected_revision,
        scope,
    } = &error
    {
        return status(
            StatusCode::FailedPrecondition,
            &format!(
                "workspaceRevisionConflict: expected {expected_revision}, actual {actual_revision}, scope {scope}"
            ),
        );
    }
    match error {
        ProjectCatalogError::NotFound => internal_error("project_not_found"),
        ProjectCatalogError::WorkerUnavailable => {
            status(StatusCode::Unavailable, "Project catalog is unavailable")
        }
        _ => internal_error("Project catalog operation failed"),
    }
}

fn status(code: StatusCode, message: &str) -> Status {
    Status {
        code: code as i32,
        message: message.to_owned(),
        details: Vec::new(),
    }
}

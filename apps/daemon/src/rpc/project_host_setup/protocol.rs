use yiru_protocol::protocol::v1::{ErrorDetail, Status, StatusCode};
use yiru_protocol::runtime::v1::{
    ProjectHostSetupKind, ProjectHostSetupMethod, ProjectHostSetupRevisionConflict,
    ProjectHostSetupServiceCloneRequest, ProjectHostSetupServiceCreateRequest,
    ProjectHostSetupServiceDeleteRequest, ProjectHostSetupServiceListRequest,
    ProjectHostSetupServiceMutationResponse, ProjectHostSetupServiceSetupExistingFolderRequest,
    ProjectHostSetupServiceUpdateRequest, ProjectHostSetupState,
};
use yiru_protocol::transport::{decode, encode};

use crate::project_host_setups::{
    SetupClone, SetupCreate, SetupDelete, SetupExisting, SetupMethod, SetupState, SetupUpdate,
};
use crate::projects::ProjectKind;

use super::ProjectHostSetupRpc;
use super::protocol_values::{protocol_list_result, protocol_mutation};

pub(in crate::rpc) async fn list(
    rpc: &ProjectHostSetupRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    decode::<ProjectHostSetupServiceListRequest>(payload)?;
    let result = rpc.authority.list().await.map_err(setup_status)?;
    Ok(encode(&protocol_list_result(&result)))
}

pub(in crate::rpc) async fn create(
    rpc: &ProjectHostSetupRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<ProjectHostSetupServiceCreateRequest>(payload)?;
    let input = SetupCreate {
        display_name: optional(request.display_name),
        expected_revision: nonnegative_revision(request.expected_revision)?,
        git_username: optional(request.git_username),
        host_id: host_id(&request.host_id)?,
        kind: kind(request.kind)?,
        path: optional(request.path),
        project_id: required(&request.project_id, "Missing project ID")?,
        setup_id: optional(request.setup_id),
        setup_method: allowed_method(
            request.setup_method,
            &[
                SetupMethod::ImportedExistingFolder,
                SetupMethod::Cloned,
                SetupMethod::Provisioned,
            ],
        )?,
        setup_state: state(request.setup_state)?,
        worktree_base_path: optional(request.worktree_base_path),
    };
    let envelope = rpc.authority.create(input).await.map_err(setup_status)?;
    Ok(encode(&ProjectHostSetupServiceMutationResponse {
        result: Some(protocol_mutation(
            &envelope.result.project,
            None,
            &envelope.result.setup,
        )),
        revision: envelope.revision,
    }))
}

pub(in crate::rpc) async fn setup_existing_folder(
    rpc: &ProjectHostSetupRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<ProjectHostSetupServiceSetupExistingFolderRequest>(payload)?;
    let input = SetupExisting {
        expected_revision: nonnegative_revision(request.expected_revision)?,
        host_id: host_id(&request.host_id)?,
        kind: kind(request.kind)?,
        path: required(&request.path, "Missing project path")?,
        project_id: required(&request.project_id, "Missing project ID")?,
        setup_method: allowed_method(
            request.setup_method,
            &[SetupMethod::ImportedExistingFolder, SetupMethod::Cloned],
        )?,
    };
    let envelope = rpc
        .authority
        .setup_existing(input)
        .await
        .map_err(setup_status)?;
    Ok(encode(&ProjectHostSetupServiceMutationResponse {
        result: Some(protocol_mutation(
            &envelope.result.project,
            Some(&envelope.result.repo),
            &envelope.result.setup,
        )),
        revision: envelope.revision,
    }))
}

pub(in crate::rpc) async fn clone(
    rpc: &ProjectHostSetupRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<ProjectHostSetupServiceCloneRequest>(payload)?;
    let input = SetupClone {
        destination: required(&request.destination, "Missing clone destination")?,
        expected_revision: nonnegative_revision(request.expected_revision)?,
        host_id: host_id(&request.host_id)?,
        project_id: required(&request.project_id, "Missing project ID")?,
        url: required(&request.url, "Missing clone URL")?,
    };
    let envelope = rpc
        .authority
        .clone_repository(input)
        .await
        .map_err(setup_status)?;
    Ok(encode(&ProjectHostSetupServiceMutationResponse {
        result: Some(protocol_mutation(
            &envelope.result.project,
            Some(&envelope.result.repo),
            &envelope.result.setup,
        )),
        revision: envelope.revision,
    }))
}

pub(in crate::rpc) async fn update(
    rpc: &ProjectHostSetupRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<ProjectHostSetupServiceUpdateRequest>(payload)?;
    let updates = request
        .updates
        .as_ref()
        .ok_or_else(|| invalid_argument("Updates must be provided"))?;
    let input = SetupUpdate {
        display_name: optional(updates.display_name.clone()),
        expected_revision: nonnegative_revision(request.expected_revision)?,
        fallback: None,
        git_username: optional(updates.git_username.clone()),
        git_username_present: updates.git_username.is_some(),
        kind: kind(updates.kind)?,
        path: optional(updates.path.clone()),
        setup_id: required(&request.setup_id, "Missing setup ID")?,
        setup_method: allowed_method(
            updates.setup_method,
            &[
                SetupMethod::LegacyRepo,
                SetupMethod::ImportedExistingFolder,
                SetupMethod::Cloned,
                SetupMethod::Provisioned,
            ],
        )?,
        setup_state: state(updates.setup_state)?,
        worktree_base_path: optional(updates.worktree_base_path.clone()),
        worktree_base_path_present: updates.worktree_base_path.is_some(),
    };
    let envelope = rpc.authority.update(input).await.map_err(setup_status)?;
    Ok(encode(&ProjectHostSetupServiceMutationResponse {
        result: Some(protocol_mutation(
            &envelope.result.project,
            envelope.result.repo.as_ref(),
            &envelope.result.setup,
        )),
        revision: envelope.revision,
    }))
}

pub(in crate::rpc) async fn delete(
    rpc: &ProjectHostSetupRpc,
    payload: &[u8],
) -> Result<Vec<u8>, Status> {
    let request = decode::<ProjectHostSetupServiceDeleteRequest>(payload)?;
    let input = SetupDelete {
        expected_revision: nonnegative_revision(request.expected_revision)?,
        fallback: None,
        setup_id: required(&request.setup_id, "Missing setup ID")?,
    };
    let envelope = rpc.authority.delete(input).await.map_err(setup_status)?;
    Ok(encode(&ProjectHostSetupServiceMutationResponse {
        result: Some(protocol_mutation(
            &envelope.result.project,
            envelope.result.repo.as_ref(),
            &envelope.result.setup,
        )),
        revision: envelope.revision,
    }))
}

fn nonnegative_revision(expected_revision: i64) -> Result<i64, Status> {
    if expected_revision >= 0 {
        return Ok(expected_revision);
    }
    Err(invalid_argument("Expected revision must be non-negative"))
}

fn required(value: &str, message: &'static str) -> Result<String, Status> {
    if value.is_empty() {
        return Err(invalid_argument(message));
    }
    Ok(value.to_owned())
}

fn host_id(value: &str) -> Result<String, Status> {
    if value.is_empty() {
        return Err(invalid_argument("Missing host ID"));
    }
    let trimmed = value.trim();
    if valid_host(trimmed) {
        return Ok(trimmed.to_owned());
    }
    Err(invalid_argument("Host ID is invalid"))
}

// Why: shared with the legacy zod rule this replaces, so the proto request rule
// cannot disagree about what counts as a host id.
fn valid_host(value: &str) -> bool {
    if value == "local" {
        return true;
    }
    let Some(encoded) = ["runtime:", "ssh:", "wsl:"]
        .into_iter()
        .find_map(|prefix| value.strip_prefix(prefix))
    else {
        return false;
    };
    !encoded.is_empty() && valid_percent_encoding(encoded)
}

fn valid_percent_encoding(value: &str) -> bool {
    let bytes = value.as_bytes();
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            if index + 2 >= bytes.len()
                || !bytes[index + 1].is_ascii_hexdigit()
                || !bytes[index + 2].is_ascii_hexdigit()
            {
                return false;
            }
            index += 3;
        } else {
            index += 1;
        }
    }
    true
}

// Why: the legacy surface accepts only a subset of setup methods per verb —
// a create cannot claim legacy-repo provenance and an import cannot claim
// provisioned — so the protobuf surface rejects the same out-of-verb values.
fn allowed_method(
    value: Option<i32>,
    allowed: &[SetupMethod],
) -> Result<Option<SetupMethod>, Status> {
    let Some(value) = value else {
        return Ok(None);
    };
    let decoded = match ProjectHostSetupMethod::try_from(value) {
        Ok(ProjectHostSetupMethod::Cloned) => SetupMethod::Cloned,
        Ok(ProjectHostSetupMethod::ImportedExistingFolder) => SetupMethod::ImportedExistingFolder,
        Ok(ProjectHostSetupMethod::LegacyRepo) => SetupMethod::LegacyRepo,
        Ok(ProjectHostSetupMethod::Provisioned) => SetupMethod::Provisioned,
        _ => return Err(invalid_argument("Setup method is invalid")),
    };
    if !allowed.contains(&decoded) {
        return Err(invalid_argument("Setup method is not allowed here"));
    }
    Ok(Some(decoded))
}

fn kind(value: Option<i32>) -> Result<Option<ProjectKind>, Status> {
    match value.map(ProjectHostSetupKind::try_from) {
        None => Ok(None),
        Some(Ok(ProjectHostSetupKind::Folder)) => Ok(Some(ProjectKind::Folder)),
        Some(Ok(ProjectHostSetupKind::Git)) => Ok(Some(ProjectKind::Git)),
        Some(_) => Err(invalid_argument("Kind is invalid")),
    }
}

fn state(value: Option<i32>) -> Result<Option<SetupState>, Status> {
    match value.map(ProjectHostSetupState::try_from) {
        None => Ok(None),
        Some(Ok(ProjectHostSetupState::Ready)) => Ok(Some(SetupState::Ready)),
        Some(Ok(ProjectHostSetupState::NotSetUp)) => Ok(Some(SetupState::NotSetUp)),
        Some(Ok(ProjectHostSetupState::SettingUp)) => Ok(Some(SetupState::SettingUp)),
        Some(Ok(ProjectHostSetupState::Error)) => Ok(Some(SetupState::Error)),
        Some(Ok(ProjectHostSetupState::Unsupported)) => Ok(Some(SetupState::Unsupported)),
        Some(_) => Err(invalid_argument("Setup state is invalid")),
    }
}

// Why: the authority treats an empty optional string as unset the same way
// the legacy optional-string parser did, so empty and absent collapse here.
fn optional(value: Option<String>) -> Option<String> {
    value.filter(|value| !value.is_empty())
}

// Why: the legacy surface answers a stale revision with the
// workspaceRevisionConflict code plus actual/expected/scope data, so the
// protobuf surface carries the same trio as a typed status detail and every
// other authority failure as an internal error.
fn setup_status(error: crate::project_host_setups::ProjectHostSetupError) -> Status {
    if let Some((actual_revision, expected_revision, scope)) = super::revision_conflict(&error) {
        return Status {
            code: StatusCode::Aborted as i32,
            message: "workspaceRevisionConflict".to_owned(),
            details: vec![ErrorDetail {
                type_name: "yiru.runtime.v1.ProjectHostSetupRevisionConflict".to_owned(),
                value: encode(&ProjectHostSetupRevisionConflict {
                    expected_revision,
                    actual_revision,
                    scope,
                }),
            }],
        };
    }
    status(StatusCode::Internal, &error.to_string())
}

fn invalid_argument(message: &str) -> Status {
    status(StatusCode::InvalidArgument, message)
}

fn status(code: StatusCode, message: &str) -> Status {
    Status {
        code: code as i32,
        message: message.to_owned(),
        details: Vec::new(),
    }
}

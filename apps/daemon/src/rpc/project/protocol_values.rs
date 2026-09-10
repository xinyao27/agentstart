// Why: the project catalog answers its runtime projection as typed Rust
// records shared with the legacy JSON surface; this is the single place that
// renders those records into the typed protobuf wire messages.
use agentstart_protocol::protocol::v1::{Status, StatusCode};
use agentstart_protocol::runtime::v1::project_json_value::Kind as JsonKind;
use agentstart_protocol::runtime::v1::project_runtime_preference::Kind as PreferenceKind;
use agentstart_protocol::runtime::v1::{
    Project, ProjectJsonNull, ProjectJsonValue, ProjectJsonValueEntry, ProjectJsonValueList,
    ProjectJsonValueObject, ProjectKind, ProjectProviderIdentity, ProjectRuntimePreference,
    ProjectServiceListResponse, ProjectServiceUpdateResponse,
};
use serde_json::Value;

use crate::projects::wire::{LocalWindowsRuntimePreference, RuntimeProject, RuntimeProjectList};

pub(super) fn project_list(list: &RuntimeProjectList) -> ProjectServiceListResponse {
    ProjectServiceListResponse {
        projects: list.projects.iter().map(project).collect(),
        revision: list.revision,
    }
}

pub(super) fn project_result(
    result: &crate::projects::RuntimeProjectResult,
) -> ProjectServiceUpdateResponse {
    ProjectServiceUpdateResponse {
        project: Some(project(&result.project)),
        revision: result.revision,
    }
}

fn project(project: &RuntimeProject) -> Project {
    Project {
        id: project.id.clone(),
        display_name: project.display_name.clone(),
        badge_color: project.badge_color.clone(),
        kind: match project.kind {
            Some(crate::projects::ProjectKind::Folder) => ProjectKind::Folder,
            Some(crate::projects::ProjectKind::Git) => ProjectKind::Git,
            None => ProjectKind::Unspecified,
        } as i32,
        git_remote_identity: project.git_remote_identity.as_ref().map(|identity| {
            agentstart_protocol::runtime::v1::RepoGitRemoteIdentity {
                canonical_key: identity.canonical_key.clone(),
                remote_name: identity.remote_name.clone(),
                remote_url: identity.remote_url.clone(),
            }
        }),
        provider_identity: project.provider_identity.as_ref().map(|identity| {
            ProjectProviderIdentity {
                provider: identity.provider_name().to_owned(),
                owner: identity.github_coordinates().0,
                repo: identity.github_coordinates().1,
            }
        }),
        local_windows_runtime_preference: project
            .local_windows_runtime_preference
            .as_ref()
            .map(preference_value),
        repo_icon: project.repo_icon.as_ref().map(json_value),
        source_repo_ids: project.source_repo_ids.clone(),
        created_at: project.created_at,
        updated_at: project.updated_at,
    }
}

pub(super) fn preference_value(
    preference: &LocalWindowsRuntimePreference,
) -> ProjectRuntimePreference {
    let kind = match preference {
        LocalWindowsRuntimePreference::InheritGlobal => PreferenceKind::InheritGlobal(true),
        LocalWindowsRuntimePreference::WindowsHost => PreferenceKind::WindowsHost(true),
        LocalWindowsRuntimePreference::Wsl { distro } => PreferenceKind::WslDistro(distro.clone()),
    };
    ProjectRuntimePreference { kind: Some(kind) }
}

// Why: the icon field is open-ended JSON in the catalog row, so it keeps the
// same typed recursive JSON shape the other open payloads use.
fn json_value(value: &Value) -> ProjectJsonValue {
    let kind = match value {
        Value::Null => JsonKind::NullValue(ProjectJsonNull::Value as i32),
        Value::Bool(value) => JsonKind::BoolValue(*value),
        Value::Number(value) => JsonKind::NumberValue(value.as_f64().unwrap_or_default()),
        Value::String(value) => JsonKind::StringValue(value.clone()),
        Value::Array(values) => JsonKind::ListValue(ProjectJsonValueList {
            values: values.iter().map(json_value).collect(),
        }),
        Value::Object(object) => JsonKind::ObjectValue(ProjectJsonValueObject {
            entries: object
                .iter()
                .map(|(key, value)| ProjectJsonValueEntry {
                    key: key.clone(),
                    value: Some(json_value(value)),
                })
                .collect(),
        }),
    };
    ProjectJsonValue { kind: Some(kind) }
}

pub(super) fn internal_error(message: &str) -> Status {
    status(StatusCode::Internal, message)
}

fn status(code: StatusCode, message: &str) -> Status {
    Status {
        code: code as i32,
        message: message.to_owned(),
        details: Vec::new(),
    }
}

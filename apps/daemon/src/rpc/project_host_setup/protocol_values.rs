use serde_json::Value;
use yiru_protocol::runtime::v1::project_host_setup_json_value;
use yiru_protocol::runtime::v1::project_host_setup_windows_runtime_preference;
use yiru_protocol::runtime::v1::{
    ProjectHostSetupGitRemoteIdentity, ProjectHostSetupGithubIdentity, ProjectHostSetupJsonNull,
    ProjectHostSetupJsonValue, ProjectHostSetupJsonValueEntry, ProjectHostSetupJsonValueList,
    ProjectHostSetupJsonValueObject, ProjectHostSetupKind, ProjectHostSetupMethod,
    ProjectHostSetupMutationResult, ProjectHostSetupProject, ProjectHostSetupProviderIdentity,
    ProjectHostSetupRecord, ProjectHostSetupRepo, ProjectHostSetupServiceListResponse,
    ProjectHostSetupState, ProjectHostSetupWindowsRuntimePreference,
    ProjectHostSetupWorktreeVisibility,
};

use crate::project_host_setups::{
    ProjectHostSetup, SetupListResult, SetupMethod, SetupRepo, SetupState,
};
use crate::projects::wire::{LocalWindowsRuntimePreference, ProjectProviderIdentity};
use crate::projects::{GitRemoteIdentity, ProjectKind, ProjectWorktreeVisibility, RuntimeProject};

pub(in crate::rpc) fn protocol_list_result(
    result: &SetupListResult,
) -> ProjectHostSetupServiceListResponse {
    ProjectHostSetupServiceListResponse {
        revision: result.revision,
        setups: result.setups.iter().map(protocol_setup).collect(),
    }
}

pub(in crate::rpc) fn protocol_mutation(
    project: &RuntimeProject,
    repo: Option<&SetupRepo>,
    setup: &ProjectHostSetup,
) -> ProjectHostSetupMutationResult {
    ProjectHostSetupMutationResult {
        project: Some(protocol_project(project)),
        repo: repo.map(protocol_repo),
        setup: Some(protocol_setup(setup)),
    }
}

pub(in crate::rpc) fn protocol_setup(setup: &ProjectHostSetup) -> ProjectHostSetupRecord {
    ProjectHostSetupRecord {
        created_at: setup.created_at,
        display_name: setup.display_name.clone(),
        execution_host_id: setup.execution_host_id.clone(),
        git_username: setup.git_username.clone(),
        host_id: setup.host_id.clone(),
        id: setup.id.clone(),
        kind: setup.kind.map(kind_value),
        path: setup.path.clone(),
        project_id: setup.project_id.clone(),
        repo_id: setup.repo_id.clone(),
        setup_method: method_value(setup.setup_method),
        setup_state: state_value(setup.setup_state),
        updated_at: setup.updated_at,
        worktree_base_path: setup.worktree_base_path.clone(),
    }
}

pub(in crate::rpc) fn protocol_project(project: &RuntimeProject) -> ProjectHostSetupProject {
    ProjectHostSetupProject {
        badge_color: project.badge_color.clone(),
        created_at: project.created_at,
        display_name: project.display_name.clone(),
        git_remote_identity: project.git_remote_identity.as_ref().map(remote_identity),
        id: project.id.clone(),
        kind: project.kind.map(kind_value),
        local_windows_runtime_preference: project
            .local_windows_runtime_preference
            .as_ref()
            .map(windows_runtime_preference),
        provider_identity: project.provider_identity.as_ref().map(provider_identity),
        repo_icon: project.repo_icon.as_ref().map(json_value),
        source_repo_ids: project.source_repo_ids.clone(),
        updated_at: project.updated_at,
    }
}

pub(in crate::rpc) fn protocol_repo(repo: &SetupRepo) -> ProjectHostSetupRepo {
    ProjectHostSetupRepo {
        added_at: repo.added_at,
        badge_color: repo.badge_color.clone(),
        display_name: repo.display_name.clone(),
        execution_host_id: repo.execution_host_id.clone(),
        external_worktree_visibility: match repo.external_worktree_visibility {
            ProjectWorktreeVisibility::Hide => ProjectHostSetupWorktreeVisibility::Hide,
            ProjectWorktreeVisibility::Show => ProjectHostSetupWorktreeVisibility::Show,
        } as i32,
        git_remote_identity: repo.git_remote_identity.as_ref().map(remote_identity),
        id: repo.id.clone(),
        kind: kind_value(repo.kind),
        path: repo.path.clone(),
        project_host_setup_method: repo.project_host_setup_method.map(method_value),
        upstream: repo
            .upstream
            .as_ref()
            .map(|upstream| ProjectHostSetupGithubIdentity {
                owner: upstream.owner.clone(),
                repo: upstream.repo.clone(),
            }),
        worktree_base_path: repo.worktree_base_path.clone(),
    }
}

fn remote_identity(identity: &GitRemoteIdentity) -> ProjectHostSetupGitRemoteIdentity {
    ProjectHostSetupGitRemoteIdentity {
        canonical_key: identity.canonical_key.clone(),
        remote_name: identity.remote_name.clone(),
        remote_url: identity.remote_url.clone(),
    }
}

fn provider_identity(identity: &ProjectProviderIdentity) -> ProjectHostSetupProviderIdentity {
    let (owner, repo) = identity.github_coordinates();
    ProjectHostSetupProviderIdentity {
        provider: identity.provider_name().to_owned(),
        owner,
        repo,
    }
}

fn windows_runtime_preference(
    preference: &LocalWindowsRuntimePreference,
) -> ProjectHostSetupWindowsRuntimePreference {
    ProjectHostSetupWindowsRuntimePreference {
        preference: Some(match preference {
            LocalWindowsRuntimePreference::InheritGlobal => {
                project_host_setup_windows_runtime_preference::Preference::InheritGlobal(true)
            }
            LocalWindowsRuntimePreference::WindowsHost => {
                project_host_setup_windows_runtime_preference::Preference::WindowsHost(true)
            }
            LocalWindowsRuntimePreference::Wsl { distro } => {
                project_host_setup_windows_runtime_preference::Preference::WslDistro(distro.clone())
            }
        }),
    }
}

// Why: a recursive conversion mirrors the typed JSON value shape instead of
// collapsing the open-shaped repoIcon into a string, so no information is
// lost between the authority and the wire.
fn json_value(value: &Value) -> ProjectHostSetupJsonValue {
    let kind = match value {
        Value::Null => {
            project_host_setup_json_value::Kind::NullValue(ProjectHostSetupJsonNull::Value as i32)
        }
        Value::Bool(value) => project_host_setup_json_value::Kind::BoolValue(*value),
        Value::Number(value) => {
            project_host_setup_json_value::Kind::NumberValue(value.as_f64().unwrap_or_default())
        }
        Value::String(value) => project_host_setup_json_value::Kind::StringValue(value.clone()),
        Value::Array(values) => {
            project_host_setup_json_value::Kind::ListValue(ProjectHostSetupJsonValueList {
                values: values.iter().map(json_value).collect(),
            })
        }
        Value::Object(entries) => {
            project_host_setup_json_value::Kind::ObjectValue(ProjectHostSetupJsonValueObject {
                entries: entries
                    .iter()
                    .map(|(key, value)| ProjectHostSetupJsonValueEntry {
                        key: key.clone(),
                        value: Some(json_value(value)),
                    })
                    .collect(),
            })
        }
    };
    ProjectHostSetupJsonValue { kind: Some(kind) }
}

fn kind_value(kind: ProjectKind) -> i32 {
    (match kind {
        ProjectKind::Folder => ProjectHostSetupKind::Folder,
        ProjectKind::Git => ProjectHostSetupKind::Git,
    }) as i32
}

fn state_value(state: SetupState) -> i32 {
    (match state {
        SetupState::Ready => ProjectHostSetupState::Ready,
        SetupState::NotSetUp => ProjectHostSetupState::NotSetUp,
        SetupState::SettingUp => ProjectHostSetupState::SettingUp,
        SetupState::Error => ProjectHostSetupState::Error,
        SetupState::Unsupported => ProjectHostSetupState::Unsupported,
    }) as i32
}

fn method_value(method: SetupMethod) -> i32 {
    (match method {
        SetupMethod::Cloned => ProjectHostSetupMethod::Cloned,
        SetupMethod::ImportedExistingFolder => ProjectHostSetupMethod::ImportedExistingFolder,
        SetupMethod::LegacyRepo => ProjectHostSetupMethod::LegacyRepo,
        SetupMethod::Provisioned => ProjectHostSetupMethod::Provisioned,
    }) as i32
}

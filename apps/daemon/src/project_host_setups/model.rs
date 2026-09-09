use serde::Serialize;

use crate::projects::{ProjectKind, RuntimeProject};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum SetupState {
    Error,
    NotSetUp,
    Ready,
    SettingUp,
    Unsupported,
}

impl SetupState {
    pub(crate) const fn database_value(self) -> &'static str {
        match self {
            Self::Error => "error",
            Self::NotSetUp => "not-set-up",
            Self::Ready => "ready",
            Self::SettingUp => "setting-up",
            Self::Unsupported => "unsupported",
        }
    }

    pub(crate) fn parse(value: &str) -> Option<Self> {
        match value {
            "error" => Some(Self::Error),
            "not-set-up" => Some(Self::NotSetUp),
            "ready" => Some(Self::Ready),
            "setting-up" => Some(Self::SettingUp),
            "unsupported" => Some(Self::Unsupported),
            _ => None,
        }
    }
}

impl Serialize for SetupState {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(self.database_value())
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum SetupMethod {
    Cloned,
    ImportedExistingFolder,
    LegacyRepo,
    Provisioned,
}

impl SetupMethod {
    pub(crate) const fn database_value(self) -> &'static str {
        match self {
            Self::Cloned => "cloned",
            Self::ImportedExistingFolder => "imported-existing-folder",
            Self::LegacyRepo => "legacy-repo",
            Self::Provisioned => "provisioned",
        }
    }

    pub(crate) fn parse(value: &str) -> Option<Self> {
        match value {
            "cloned" => Some(Self::Cloned),
            "imported-existing-folder" => Some(Self::ImportedExistingFolder),
            "legacy-repo" => Some(Self::LegacyRepo),
            "provisioned" => Some(Self::Provisioned),
            _ => None,
        }
    }
}

impl Serialize for SetupMethod {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(self.database_value())
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProjectHostSetup {
    pub(crate) created_at: i64,
    pub(crate) display_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) execution_host_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) git_username: Option<String>,
    pub(crate) host_id: String,
    pub(crate) id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) kind: Option<ProjectKind>,
    pub(crate) path: String,
    pub(crate) project_id: String,
    pub(crate) repo_id: String,
    pub(crate) setup_method: SetupMethod,
    pub(crate) setup_state: SetupState,
    pub(crate) updated_at: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) worktree_base_path: Option<String>,
    #[serde(skip)]
    pub(crate) upstream: Option<GitHubIdentity>,
    #[serde(skip)]
    pub(crate) storage_id: String,
    #[serde(skip)]
    pub(crate) storage_repo_id: String,
}

#[derive(Clone, Debug, Serialize)]
pub(crate) struct GitHubIdentity {
    pub(crate) owner: String,
    pub(crate) repo: String,
}

pub(crate) struct SetupCreate {
    pub(crate) display_name: Option<String>,
    pub(crate) expected_revision: i64,
    pub(crate) git_username: Option<String>,
    pub(crate) host_id: String,
    pub(crate) kind: Option<ProjectKind>,
    pub(crate) path: Option<String>,
    pub(crate) project_id: String,
    pub(crate) setup_id: Option<String>,
    pub(crate) setup_method: Option<SetupMethod>,
    pub(crate) setup_state: Option<SetupState>,
    pub(crate) worktree_base_path: Option<String>,
}

pub(crate) struct SetupExisting {
    pub(crate) expected_revision: i64,
    pub(crate) host_id: String,
    pub(crate) kind: Option<ProjectKind>,
    pub(crate) path: String,
    pub(crate) project_id: String,
    pub(crate) setup_method: Option<SetupMethod>,
}

pub(crate) struct SetupClone {
    pub(crate) destination: String,
    pub(crate) expected_revision: i64,
    pub(crate) host_id: String,
    pub(crate) project_id: String,
    pub(crate) url: String,
}

pub(crate) struct SetupUpdate {
    pub(crate) display_name: Option<String>,
    pub(crate) expected_revision: i64,
    pub(crate) fallback: Option<Box<ProjectHostSetup>>,
    pub(crate) git_username: Option<String>,
    pub(crate) git_username_present: bool,
    pub(crate) kind: Option<ProjectKind>,
    pub(crate) path: Option<String>,
    pub(crate) setup_id: String,
    pub(crate) setup_method: Option<SetupMethod>,
    pub(crate) setup_state: Option<SetupState>,
    pub(crate) worktree_base_path: Option<String>,
    pub(crate) worktree_base_path_present: bool,
}

pub(crate) struct SetupDelete {
    pub(crate) expected_revision: i64,
    pub(crate) fallback: Option<Box<ProjectHostSetup>>,
    pub(crate) setup_id: String,
}

pub(crate) struct PreparedRepository {
    pub(super) display_name: String,
    pub(super) host_id: String,
    pub(super) kind: ProjectKind,
    pub(super) path: String,
    pub(super) project_id: String,
    pub(super) remotes: Vec<crate::projects::GitRemoteIdentity>,
    pub(super) setup_method: SetupMethod,
    pub(super) selected_github: Option<GitHubIdentity>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SetupListResult {
    pub(crate) revision: i64,
    pub(crate) setups: Vec<ProjectHostSetup>,
}

pub(crate) struct SetupListSnapshot {
    pub(crate) projects: Vec<crate::projects::Project>,
    pub(crate) revision: i64,
    pub(crate) runtime_projects: Vec<RuntimeProject>,
    pub(crate) setups: Vec<ProjectHostSetup>,
}

#[derive(Serialize)]
pub(crate) struct SetupCreateEnvelope {
    pub(crate) result: SetupCreateResult,
    pub(crate) revision: i64,
}

#[derive(Serialize)]
pub(crate) struct SetupCreateResult {
    pub(crate) project: RuntimeProject,
    pub(crate) setup: ProjectHostSetup,
}

#[derive(Serialize)]
pub(crate) struct SetupRepositoryResult {
    pub(crate) project: RuntimeProject,
    pub(crate) repo: SetupRepo,
    pub(crate) setup: ProjectHostSetup,
}

#[derive(Serialize)]
pub(crate) struct SetupRepositoryEnvelope {
    pub(crate) result: SetupRepositoryResult,
    pub(crate) revision: i64,
}

#[derive(Serialize)]
pub(crate) struct SetupUpdateResult {
    pub(crate) project: RuntimeProject,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) repo: Option<SetupRepo>,
    pub(crate) setup: ProjectHostSetup,
}

#[derive(Serialize)]
pub(crate) struct SetupUpdateEnvelope {
    pub(crate) result: SetupUpdateResult,
    pub(crate) revision: i64,
}

pub(crate) struct StoredMutation {
    pub(super) cleanup: Option<CleanupTombstone>,
    pub(super) repo: Option<SetupRepo>,
    pub(super) revision: i64,
    pub(super) setup: ProjectHostSetup,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SetupRepo {
    pub(crate) added_at: i64,
    pub(crate) badge_color: String,
    pub(crate) display_name: String,
    pub(crate) execution_host_id: String,
    pub(crate) external_worktree_visibility: crate::projects::ProjectWorktreeVisibility,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) git_remote_identity: Option<crate::projects::GitRemoteIdentity>,
    pub(crate) id: String,
    pub(crate) kind: ProjectKind,
    pub(crate) path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) project_host_setup_method: Option<SetupMethod>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) upstream: Option<GitHubIdentity>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) worktree_base_path: Option<String>,
}

#[derive(Clone)]
pub(crate) struct CleanupTombstone {
    pub(crate) drop_sparse_presets: bool,
    pub(crate) host_id: String,
    pub(crate) prune_all_hosts: bool,
    pub(crate) repo_id: String,
    pub(crate) storage_id: String,
}

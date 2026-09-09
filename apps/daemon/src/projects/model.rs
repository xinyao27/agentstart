use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitRemoteIdentity {
    pub canonical_key: String,
    pub remote_name: String,
    pub remote_url: String,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ProjectKind {
    Folder,
    Git,
}

impl ProjectKind {
    pub(crate) const fn database_value(self) -> &'static str {
        match self {
            Self::Folder => "folder",
            Self::Git => "git",
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProjectLocation {
    pub host_id: String,
    pub path: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub added_at: i64,
    pub badge_color: String,
    pub display_name: String,
    pub execution_host_id: String,
    pub external_worktree_visibility: ProjectWorktreeVisibility,
    pub external_worktree_visibility_legacy: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub git_remote_identity: Option<GitRemoteIdentity>,
    pub id: String,
    pub kind: ProjectKind,
    pub path: String,
    #[serde(skip)]
    pub(crate) storage_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub worktree_base_path: Option<String>,
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ProjectWorktreeVisibility {
    Hide,
    Show,
}

impl ProjectWorktreeVisibility {
    pub(crate) fn parse(value: &str) -> Option<Self> {
        match value {
            "hide" => Some(Self::Hide),
            "show" => Some(Self::Show),
            _ => None,
        }
    }
}

pub struct ProjectRegistration {
    pub display_name: String,
    pub kind: ProjectKind,
    pub location: ProjectLocation,
    pub remotes: Vec<GitRemoteIdentity>,
}

pub struct WorkbenchProject {
    pub added_at: i64,
    pub badge_color: String,
    pub display_name: String,
    pub git_remote_identity: Option<GitRemoteIdentity>,
    pub host_id: Option<String>,
    pub id: String,
    pub kind: Option<ProjectKind>,
    pub path: String,
    pub worktree_base_path: Option<String>,
}

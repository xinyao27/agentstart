use serde::Serialize;

use crate::projects::{GitRemoteIdentity, ProjectKind, ProjectWorktreeVisibility};

#[derive(Clone, Copy, Debug)]
pub(crate) enum ProjectGroupCreatedFrom {
    FolderScan,
    Manual,
    Migration,
}

impl ProjectGroupCreatedFrom {
    pub(crate) const fn database_value(self) -> &'static str {
        match self {
            Self::FolderScan => "folder-scan",
            Self::Manual => "manual",
            Self::Migration => "migration",
        }
    }

    pub(super) fn parse(value: &str) -> Option<Self> {
        match value {
            "folder-scan" => Some(Self::FolderScan),
            "manual" => Some(Self::Manual),
            "migration" => Some(Self::Migration),
            _ => None,
        }
    }
}

impl Serialize for ProjectGroupCreatedFrom {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(self.database_value())
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProjectGroup {
    pub(crate) color: Option<String>,
    pub(crate) connection_id: Option<String>,
    pub(crate) created_at: i64,
    pub(crate) created_from: ProjectGroupCreatedFrom,
    pub(crate) id: String,
    pub(crate) is_collapsed: bool,
    pub(crate) name: String,
    pub(crate) parent_group_id: Option<String>,
    pub(crate) parent_path: Option<String>,
    pub(crate) tab_order: f64,
    pub(crate) updated_at: i64,
}

#[derive(Debug)]
pub(crate) struct ProjectGroupCreate {
    pub(crate) connection_id: Option<String>,
    pub(crate) created_from: ProjectGroupCreatedFrom,
    pub(crate) expected_revision: i64,
    pub(crate) name: String,
    pub(crate) parent_group_id: Option<String>,
    pub(crate) parent_path: Option<String>,
}

#[derive(Debug)]
pub(crate) struct ProjectGroupUpdate {
    pub(crate) color: Option<Option<String>>,
    pub(crate) expected_revision: i64,
    pub(crate) group_id: String,
    pub(crate) is_collapsed: Option<bool>,
    pub(crate) name: Option<String>,
    pub(crate) tab_order: Option<f64>,
}

#[derive(Debug)]
pub(crate) struct ProjectGroupDelete {
    pub(crate) expected_revision: i64,
    pub(crate) group_id: String,
}

#[derive(Debug)]
pub(crate) struct ProjectGroupMoveProject {
    pub(crate) expected_revision: i64,
    pub(crate) group_id: Option<String>,
    pub(crate) order: Option<f64>,
    pub(crate) project_selector: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProjectGroupListResult {
    pub(crate) groups: Vec<ProjectGroup>,
    pub(crate) revision: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProjectGroupResult {
    pub(crate) group: ProjectGroup,
    pub(crate) revision: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NullableProjectGroupResult {
    pub(crate) group: Option<ProjectGroup>,
    pub(crate) revision: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProjectGroupDeleteResult {
    pub(crate) deleted: bool,
    pub(crate) revision: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProjectGroupMoveProjectResult {
    pub(crate) repo: RuntimeRepo,
    pub(crate) revision: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RuntimeRepo {
    pub(crate) added_at: i64,
    pub(crate) badge_color: String,
    pub(crate) display_name: String,
    pub(crate) execution_host_id: String,
    pub(crate) external_worktree_visibility: ProjectWorktreeVisibility,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) git_remote_identity: Option<GitRemoteIdentity>,
    pub(crate) id: String,
    pub(crate) kind: ProjectKind,
    pub(crate) path: String,
    pub(crate) project_group_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) project_group_order: Option<f64>,
    #[serde(skip)]
    pub(crate) storage_id: String,
}

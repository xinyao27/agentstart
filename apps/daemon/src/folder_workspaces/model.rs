use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LinkedReview {
    pub(crate) number: f64,
    pub(crate) provider: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) repo_id: Option<String>,
    pub(crate) title: String,
    #[serde(rename = "type")]
    pub(crate) review_type: String,
    pub(crate) url: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FolderWorkspace {
    pub(crate) comment: String,
    pub(crate) connection_id: Option<String>,
    pub(crate) created_at: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) created_with_agent: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) first_agent_message_rename_error: Option<Option<String>>,
    pub(crate) folder_path: String,
    pub(crate) id: String,
    pub(crate) is_archived: bool,
    pub(crate) is_pinned: bool,
    pub(crate) is_unread: bool,
    pub(crate) last_activity_at: f64,
    pub(crate) linked_review: Option<LinkedReview>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) manual_order: Option<f64>,
    pub(crate) name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) pending_first_agent_message_rename: Option<bool>,
    pub(crate) project_group_id: String,
    pub(crate) sort_order: f64,
    pub(crate) updated_at: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) workspace_status: Option<String>,
}

pub(crate) struct FolderWorkspaceCreate {
    pub(crate) connection_id: Option<String>,
    pub(crate) created_with_agent: Option<String>,
    pub(crate) expected_revision: i64,
    pub(crate) folder_path: Option<String>,
    pub(crate) linked_review: Option<LinkedReview>,
    pub(crate) name: Option<String>,
    pub(crate) pending_first_agent_message_rename: Option<bool>,
    pub(crate) project_group_id: String,
}

pub(crate) struct FolderWorkspaceUpdate {
    pub(crate) comment: Option<String>,
    pub(crate) created_with_agent: Option<String>,
    pub(crate) expected_revision: i64,
    pub(crate) first_agent_message_rename_error: Option<Option<String>>,
    pub(crate) folder_path: Option<String>,
    pub(crate) folder_workspace_id: String,
    pub(crate) is_archived: Option<bool>,
    pub(crate) is_pinned: Option<bool>,
    pub(crate) is_unread: Option<bool>,
    pub(crate) last_activity_at: Option<f64>,
    pub(crate) linked_review: Option<Option<LinkedReview>>,
    pub(crate) manual_order: Option<f64>,
    pub(crate) name: Option<String>,
    pub(crate) pending_first_agent_message_rename: Option<bool>,
    pub(crate) sort_order: Option<f64>,
    pub(crate) workspace_status: Option<String>,
}

pub(crate) struct FolderWorkspaceDelete {
    pub(crate) expected_revision: i64,
    pub(crate) folder_workspace_id: String,
}

pub(crate) enum PathStatusScope {
    FolderWorkspace(String),
    Path(String),
    ProjectGroup(String),
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FolderWorkspaceListResult {
    pub(crate) folder_workspaces: Vec<FolderWorkspace>,
    pub(crate) revision: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FolderWorkspaceResult {
    pub(crate) folder_workspace: FolderWorkspace,
    pub(crate) revision: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NullableFolderWorkspaceResult {
    pub(crate) folder_workspace: Option<FolderWorkspace>,
    pub(crate) revision: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FolderWorkspaceDeleteResult {
    pub(crate) deleted: bool,
    pub(crate) revision: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FolderWorkspacePathStatus {
    pub(crate) exists: bool,
    pub(crate) path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) reason: Option<&'static str>,
}

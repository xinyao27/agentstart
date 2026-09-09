use serde::Serialize;

#[derive(Clone)]
pub(crate) struct RemoveForHostInput {
    pub(crate) expected_revision: i64,
    pub(crate) host_id: String,
    pub(crate) repo_id: String,
}

#[derive(Clone)]
pub(crate) struct ReorderForHostInput {
    pub(crate) expected_revision: i64,
    pub(crate) host_id: String,
    pub(crate) ordered_ids: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RemoveForHostResult {
    pub(crate) removed: bool,
    pub(crate) revision: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ReorderForHostResult {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) revision: Option<i64>,
    pub(crate) status: ReorderStatus,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum ReorderStatus {
    Applied,
    Rejected,
}

pub(crate) struct RemoveMutation {
    pub(crate) cleanup: Option<crate::project_host_setups::CleanupTombstone>,
    pub(crate) result: RemoveForHostResult,
}

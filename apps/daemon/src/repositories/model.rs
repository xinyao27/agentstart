use serde::Serialize;
use serde_json::{Map, Value};

use crate::project_host_setups::CleanupTombstone;
use crate::projects::{GitRemoteIdentity, ProjectKind};

pub(crate) struct AddInput {
    pub(crate) detected: Map<String, Value>,
    pub(crate) expected_revision: i64,
    pub(crate) host_id: String,
    pub(crate) path: String,
    pub(crate) display_name: String,
    pub(crate) kind: ProjectKind,
    pub(crate) remotes: Vec<GitRemoteIdentity>,
}

pub(crate) struct AddMutation {
    pub(crate) added: bool,
    pub(crate) result: RepositoryResult,
}

pub(crate) struct UpdateInput {
    pub(crate) expected_revision: i64,
    pub(crate) host_id: String,
    pub(crate) selector: String,
    pub(crate) updates: Map<String, Value>,
}

pub(crate) struct RemoveInput {
    pub(crate) expected_revision: i64,
    pub(crate) host_id: String,
    pub(crate) selector: String,
}

pub(crate) struct ReorderInput {
    pub(crate) expected_revision: i64,
    pub(crate) ordered_ids: Vec<String>,
}

pub(crate) struct SparsePresetSaveInput {
    pub(crate) directories: Vec<String>,
    pub(crate) id: Option<String>,
    pub(crate) name: String,
    pub(crate) host_id: String,
    pub(crate) selector: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RepositoryList {
    pub(crate) repos: Vec<Value>,
    pub(crate) revision: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RepositoryResult {
    pub(crate) repo: Value,
    pub(crate) revision: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RemoveResult {
    pub(crate) removed: bool,
    pub(crate) revision: i64,
}

pub(crate) struct RemoveMutation {
    pub(crate) cleanups: Vec<CleanupTombstone>,
    pub(crate) result: RemoveResult,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ReorderResult {
    pub(crate) revision: i64,
    pub(crate) status: ReorderStatus,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum ReorderStatus {
    Applied,
    Rejected,
}

use serde::Serialize;

use crate::projects::GitRemoteIdentity;

use super::model::ProjectGroup;

#[derive(Clone, Copy, Debug)]
pub(crate) enum ProjectGroupImportMode {
    Group,
    Separate,
}

impl ProjectGroupImportMode {
    pub(super) const fn database_value(self) -> &'static str {
        match self {
            Self::Group => "group",
            Self::Separate => "separate",
        }
    }
}

#[derive(Debug)]
pub(crate) struct ProjectGroupImportInput {
    pub(crate) expected_revision: i64,
    pub(crate) group_name: String,
    pub(crate) mode: ProjectGroupImportMode,
    pub(crate) parent_path: String,
    pub(crate) project_paths: Vec<String>,
    pub(crate) scan_id: Option<String>,
}

#[derive(Debug)]
pub(crate) struct PreparedImport {
    pub(super) expected_revision: i64,
    pub(super) group_name: String,
    pub(super) mode: ProjectGroupImportMode,
    pub(super) parent_path: String,
    pub(super) projects: Vec<PreparedImportProject>,
    pub(super) scope_paths: Vec<String>,
}

#[derive(Debug)]
pub(super) struct PreparedImportProject {
    pub(super) import_path: Option<String>,
    pub(super) order: f64,
    pub(super) path: String,
    pub(super) remotes: Vec<GitRemoteIdentity>,
    pub(super) rejection: Option<&'static str>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProjectGroupImportResult {
    pub(crate) already_known_count: usize,
    pub(crate) failed_count: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) group: Option<ProjectGroup>,
    pub(crate) imported_count: usize,
    pub(crate) projects: Vec<ProjectGroupImportProjectResult>,
    pub(crate) revision: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProjectGroupImportProjectResult {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) error: Option<&'static str>,
    pub(crate) path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) project_id: Option<String>,
    pub(crate) status: ProjectGroupImportStatus,
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum ProjectGroupImportStatus {
    AlreadyKnown,
    Failed,
    Imported,
}

impl ProjectGroupImportProjectResult {
    pub(super) fn failed(path: String, error: &'static str) -> Self {
        Self {
            error: Some(error),
            path,
            project_id: None,
            status: ProjectGroupImportStatus::Failed,
        }
    }
}

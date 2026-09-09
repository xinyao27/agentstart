use serde::Serialize;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NestedRepoCandidate {
    pub(crate) depth: usize,
    pub(crate) display_name: String,
    pub(crate) path: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NestedRepoScan {
    pub(crate) duration_ms: i64,
    pub(crate) max_depth: usize,
    pub(crate) max_repos: usize,
    pub(crate) repos: Vec<NestedRepoCandidate>,
    pub(crate) selected_path: String,
    pub(crate) selected_path_kind: &'static str,
    pub(crate) stopped: bool,
    pub(crate) timed_out: bool,
    pub(crate) timeout_ms: Option<u64>,
    pub(crate) truncated: bool,
}

#[derive(Clone, Copy, Debug)]
pub(crate) struct NestedRepoScanOptions {
    pub(crate) max_depth: usize,
    pub(crate) max_repos: usize,
    pub(crate) timeout_ms: Option<u64>,
}

impl Default for NestedRepoScanOptions {
    fn default() -> Self {
        Self {
            max_depth: 3,
            max_repos: 100,
            timeout_ms: None,
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub(crate) enum NestedRepoScanEvent {
    #[serde(rename = "nestedRepoScanProgress")]
    Progress {
        scan: NestedRepoScan,
        #[serde(rename = "scanId")]
        scan_id: String,
    },
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CancelNestedRepoScanResult {
    pub(crate) cancelled: bool,
}

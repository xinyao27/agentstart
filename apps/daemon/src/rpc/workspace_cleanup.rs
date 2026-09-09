pub(in crate::rpc) mod protocol;
pub(in crate::rpc) mod protocol_values;

use serde_json::{Map, Value, json};

use crate::workspace_cleanup::WorkspaceCleanupAuthority;

use super::zod_input::{InputIssues, PathSegment, invalid_type_issue, value_type};

#[derive(Clone)]
pub(super) struct WorkspaceCleanupRpc {
    authority: WorkspaceCleanupAuthority,
}

pub(super) struct ScanInput {
    pub(super) scan_id: Option<String>,
    pub(super) skip_git_worktree_ids: Vec<String>,
    pub(super) worktree_id: Option<String>,
}

impl WorkspaceCleanupRpc {
    pub(super) fn new(authority: WorkspaceCleanupAuthority) -> Self {
        Self { authority }
    }
}

// Why: the protobuf handler renders the typed scan request into a JSON object
// and reuses this parser, so scan-id and worktree-id normalization cannot
// drift between transports.
pub(super) fn parse_scan(body: Option<&Value>) -> Result<ScanInput, Value> {
    let object = require_object(body)?;
    let skip_git_worktree_ids = match object.get("skipGitWorktreeIds") {
        None => Vec::new(),
        Some(Value::Array(values)) => {
            let mut issues = Vec::new();
            let mut parsed = Vec::with_capacity(values.len());
            for (index, value) in values.iter().enumerate() {
                if let Some(value) = value.as_str() {
                    parsed.push(value.to_owned());
                } else {
                    issues.push(json!({
                        "expected": "string",
                        "code": "invalid_type",
                        "path": ["skipGitWorktreeIds", index],
                        "message": format!("Invalid input: expected string, received {}", value_type(Some(value))),
                    }));
                }
            }
            if !issues.is_empty() {
                return Err(json!({ "issues": issues }));
            }
            parsed
        }
        Some(value) => {
            return Err(json!({ "issues": [invalid_type_issue(
                &[PathSegment::field("skipGitWorktreeIds")],
                "array",
                value_type(Some(value)),
            )] }));
        }
    };
    Ok(ScanInput {
        scan_id: optional_string(object, "scanId"),
        skip_git_worktree_ids,
        worktree_id: optional_string(object, "worktreeId"),
    })
}

fn require_object(body: Option<&Value>) -> Result<&Map<String, Value>, Value> {
    body.and_then(Value::as_object)
        .ok_or_else(|| object_issue(body))
}

fn optional_string(object: &Map<String, Value>, field: &str) -> Option<String> {
    object
        .get(field)
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

fn object_issue(body: Option<&Value>) -> Value {
    InputIssues::one(invalid_type_issue(&[], "object", value_type(body))).into_data()
}

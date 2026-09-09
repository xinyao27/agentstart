use serde_json::{Map, Value, json};

use crate::rpc::zod_input::{
    InputIssues, PathSegment, invalid_type_issue, parse_integer, path_json, require_object,
    value_type,
};

pub(super) struct WorktreePsInput {
    pub(super) limit: Option<f64>,
}

pub(super) struct WorktreeListInput {
    pub(super) limit: Option<f64>,
    pub(super) repo: Option<String>,
}

pub(super) struct WorktreeSelectorInput {
    pub(super) worktree: String,
}

pub(super) struct WorktreeActivateInput {
    pub(super) notify_clients: bool,
    pub(super) worktree: String,
}

pub(super) struct WorktreePrefetchCreateBaseInput {
    pub(super) base_branch: Option<String>,
    pub(super) repo: String,
}

pub(super) struct WorktreeResolvePrBaseInput {
    pub(super) base_ref_name: Option<String>,
    pub(super) head_ref_name: Option<String>,
    pub(super) is_cross_repository: bool,
    pub(super) pr_number: i64,
    pub(super) repo: String,
}

pub(super) struct WorktreeRemoveInput {
    pub(super) expected_revision: i64,
    pub(super) force: bool,
    pub(super) run_hooks: bool,
    pub(super) worktree: String,
}

pub(super) struct WorktreeForceDeleteBranchInput {
    pub(super) branch_name: String,
    pub(super) expected_head: String,
    pub(super) worktree: String,
}

pub(super) struct WorktreeSetInput {
    pub(super) expected_revision: i64,
    pub(super) patch: Map<String, Value>,
    pub(super) worktree: String,
}

pub(super) struct WorktreeArchiveInput {
    pub(super) delete_branch: bool,
    pub(super) expected_revision: i64,
    pub(super) worktree: String,
}

pub(super) struct WorktreeArchiveListInput {
    pub(super) repo: Option<String>,
}

pub(super) struct WorktreeArchiveRestoreInput {
    pub(super) archive_id: String,
    pub(super) expected_revision: i64,
}

pub(super) struct WorktreeInputFailure {
    pub(super) data: Value,
}

pub(super) fn parse_ps(body: Option<&Value>) -> Result<WorktreePsInput, WorktreeInputFailure> {
    let object = require_object(body).map_err(WorktreeInputFailure::from)?;
    let limit = object.get("limit").and_then(Value::as_f64);
    Ok(WorktreePsInput { limit })
}

pub(super) fn parse_list(body: Option<&Value>) -> Result<WorktreeListInput, WorktreeInputFailure> {
    let object = require_object(body).map_err(WorktreeInputFailure::from)?;
    Ok(WorktreeListInput {
        limit: optional_finite(object.get("limit")),
        repo: optional_string(object.get("repo")),
    })
}

pub(super) fn parse_selector(
    body: Option<&Value>,
) -> Result<WorktreeSelectorInput, WorktreeInputFailure> {
    let object = require_object(body).map_err(WorktreeInputFailure::from)?;
    let mut issues = InputIssues::new();
    let worktree = required_string(
        object.get("worktree"),
        "worktree",
        "Missing worktree selector",
        &mut issues,
    );
    finish(issues)?;
    Ok(WorktreeSelectorInput {
        worktree: worktree.unwrap_or_default(),
    })
}

pub(super) fn parse_activate(
    body: Option<&Value>,
) -> Result<WorktreeActivateInput, WorktreeInputFailure> {
    let object = require_object(body).map_err(WorktreeInputFailure::from)?;
    let mut issues = InputIssues::new();
    let worktree = required_string(
        object.get("worktree"),
        "worktree",
        "Missing worktree selector",
        &mut issues,
    );
    let notify_clients = optional_boolean(object, "notifyClients", &mut issues).unwrap_or(true);
    finish(issues)?;
    Ok(WorktreeActivateInput {
        notify_clients,
        worktree: worktree.unwrap_or_default(),
    })
}

pub(super) fn parse_create(body: Option<&Value>) -> Result<Value, WorktreeInputFailure> {
    let object = require_object(body).map_err(WorktreeInputFailure::from)?;
    let mut issues = InputIssues::new();
    required_string(
        object.get("repo"),
        "repo",
        "Missing repo selector",
        &mut issues,
    );
    let expected_revision = parse_revision(object, &mut issues);
    if let Some(value) = expected_revision
        && value < 0
    {
        issues.push(json!({
            "origin": "number",
            "code": "too_small",
            "minimum": 0,
            "inclusive": true,
            "path": ["expectedRevision"],
            "message": "Too small: expected number to be >=0"
        }));
    }
    for field in [
        "runHooks",
        "activate",
        "noParent",
        "pendingFirstAgentMessageRename",
    ] {
        let _ = optional_boolean(object, field, &mut issues);
    }
    match object.get("setupDecision") {
        None | Some(Value::Null) => {}
        Some(Value::String(value)) if matches!(value.as_str(), "run" | "skip" | "inherit") => {}
        Some(Value::String(_)) => issues.push(json!({
            "code": "invalid_value",
            "values": ["run", "skip", "inherit"],
            "path": ["setupDecision"],
            "message": "Invalid setup decision"
        })),
        Some(value) => issues.push(invalid_type_issue(
            &[PathSegment::field("setupDecision")],
            "string",
            value_type(Some(value)),
        )),
    }
    let parent_workspace = optional_string(object.get("parentWorkspace"));
    let parent_worktree = optional_string(object.get("parentWorktree"));
    let no_parent = object
        .get("noParent")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    if no_parent && (parent_workspace.is_some() || parent_worktree.is_some()) {
        issues.push(json!({
            "code": "custom",
            "path": [],
            "message": "Choose either one parent selector or --no-parent."
        }));
    }
    if parent_workspace.is_some() && parent_worktree.is_some() {
        issues.push(json!({
            "code": "custom",
            "path": [],
            "message": "Choose either one parent selector or --no-parent."
        }));
    }
    let startup_agent = optional_string(object.get("startupAgent"));
    if object.get("startupPrompt").is_some()
        && optional_string(object.get("startupPrompt")).is_some()
        && startup_agent.is_none()
    {
        issues.push(json!({
            "code": "custom",
            "path": [],
            "message": "startupPrompt requires startupAgent"
        }));
    }
    finish(issues)?;
    Ok(Value::Object(object.clone()))
}

pub(super) fn parse_prefetch_create_base(
    body: Option<&Value>,
) -> Result<WorktreePrefetchCreateBaseInput, WorktreeInputFailure> {
    let object = require_object(body).map_err(WorktreeInputFailure::from)?;
    let mut issues = InputIssues::new();
    let repo = required_string(
        object.get("repo"),
        "repo",
        "Missing repo selector",
        &mut issues,
    );
    let base_branch = optional_string(object.get("baseBranch"));
    finish(issues)?;
    Ok(WorktreePrefetchCreateBaseInput {
        base_branch,
        repo: repo.unwrap_or_default(),
    })
}

pub(super) fn parse_resolve_pr_base(
    body: Option<&Value>,
) -> Result<WorktreeResolvePrBaseInput, WorktreeInputFailure> {
    let object = require_object(body).map_err(WorktreeInputFailure::from)?;
    let mut issues = InputIssues::new();
    let repo = required_string(
        object.get("repo"),
        "repo",
        "Missing repo selector",
        &mut issues,
    );
    let pr_number = parse_integer(
        object.get("prNumber"),
        &[PathSegment::field("prNumber")],
        false,
        Some(9_007_199_254_740_991),
        &mut issues,
    );
    if pr_number.is_some_and(|number| number <= 0) {
        issues.push(json!({
            "origin": "number",
            "code": "too_small",
            "minimum": 1,
            "inclusive": true,
            "path": ["prNumber"],
            "message": "Missing PR number"
        }));
    }
    finish(issues)?;
    Ok(WorktreeResolvePrBaseInput {
        base_ref_name: optional_string(object.get("baseRefName")),
        head_ref_name: optional_string(object.get("headRefName")),
        is_cross_repository: object
            .get("isCrossRepository")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        pr_number: pr_number.unwrap_or_default(),
        repo: repo.unwrap_or_default(),
    })
}

pub(super) fn parse_remove(
    body: Option<&Value>,
) -> Result<WorktreeRemoveInput, WorktreeInputFailure> {
    let object = require_object(body).map_err(WorktreeInputFailure::from)?;
    let mut issues = InputIssues::new();
    let worktree = required_string(
        object.get("worktree"),
        "worktree",
        "Missing worktree selector",
        &mut issues,
    );
    let expected_revision = parse_revision(object, &mut issues);
    let force = optional_boolean(object, "force", &mut issues).unwrap_or(false);
    let run_hooks = optional_boolean(object, "runHooks", &mut issues).unwrap_or(false);
    finish(issues)?;
    Ok(WorktreeRemoveInput {
        expected_revision: expected_revision.unwrap_or_default(),
        force,
        run_hooks,
        worktree: worktree.unwrap_or_default(),
    })
}

pub(super) fn parse_force_delete_branch(
    body: Option<&Value>,
) -> Result<WorktreeForceDeleteBranchInput, WorktreeInputFailure> {
    let object = require_object(body).map_err(WorktreeInputFailure::from)?;
    let mut issues = InputIssues::new();
    let worktree = required_string(
        object.get("worktree"),
        "worktree",
        "Missing worktree selector",
        &mut issues,
    );
    let branch_name = required_string(
        object.get("branchName"),
        "branchName",
        "Missing branch name",
        &mut issues,
    );
    let expected_head = required_string(
        object.get("expectedHead"),
        "expectedHead",
        "Missing expected branch head",
        &mut issues,
    );
    finish(issues)?;
    Ok(WorktreeForceDeleteBranchInput {
        branch_name: branch_name.unwrap_or_default(),
        expected_head: expected_head.unwrap_or_default(),
        worktree: worktree.unwrap_or_default(),
    })
}

pub(super) fn parse_repo_selector(body: Option<&Value>) -> Result<String, WorktreeInputFailure> {
    let object = require_object(body).map_err(WorktreeInputFailure::from)?;
    let mut issues = InputIssues::new();
    let repo = required_string(
        object.get("repo"),
        "repo",
        "Missing repo selector",
        &mut issues,
    );
    finish(issues)?;
    Ok(repo.unwrap_or_default())
}

pub(super) fn parse_order(body: Option<&Value>) -> Result<Vec<String>, WorktreeInputFailure> {
    let object = require_object(body).map_err(WorktreeInputFailure::from)?;
    let mut issues = InputIssues::new();
    let path = [PathSegment::field("orderedIds")];
    let ordered_ids = match object.get("orderedIds").and_then(Value::as_array) {
        Some(values) => values
            .iter()
            .enumerate()
            .filter_map(|(index, value)| match value.as_str() {
                Some(value) => Some(value.to_owned()),
                None => {
                    let item_path = [PathSegment::field("orderedIds"), PathSegment::index(index)];
                    issues.push(invalid_type_issue(
                        &item_path,
                        "string",
                        value_type(Some(value)),
                    ));
                    None
                }
            })
            .collect(),
        None => {
            issues.push(invalid_type_issue(
                &path,
                "array",
                value_type(object.get("orderedIds")),
            ));
            Vec::new()
        }
    };
    finish(issues)?;
    Ok(ordered_ids)
}

pub(super) fn parse_set(body: Option<&Value>) -> Result<WorktreeSetInput, WorktreeInputFailure> {
    let object = require_object(body).map_err(WorktreeInputFailure::from)?;
    let mut issues = InputIssues::new();
    let worktree = required_string(
        object.get("worktree"),
        "worktree",
        "Missing worktree selector",
        &mut issues,
    );
    let revision_path = [PathSegment::field("expectedRevision")];
    let expected_revision = parse_integer(
        object.get("expectedRevision"),
        &revision_path,
        false,
        Some(9_007_199_254_740_991),
        &mut issues,
    );
    if expected_revision.is_some_and(|revision| revision < 0) {
        issues.push(json!({
            "origin": "number",
            "code": "too_small",
            "minimum": 0,
            "inclusive": true,
            "path": path_json(&revision_path),
            "message": "Too small: expected number to be >=0"
        }));
    }
    let mut patch = Map::new();
    for field in [
        "displayName",
        "sparseBaseRef",
        "sparsePresetId",
        "baseRef",
        "workspaceStatus",
    ] {
        if let Some(value) = optional_string(object.get(field)) {
            patch.insert(field.to_owned(), Value::String(value));
        }
    }
    if let Some(value) = object.get("comment").and_then(Value::as_str) {
        patch.insert("comment".to_owned(), Value::String(value.to_owned()));
    }
    for field in [
        "isArchived",
        "isUnread",
        "isPinned",
        "pendingFirstAgentMessageRename",
    ] {
        if let Some(value) = object.get(field).and_then(Value::as_bool) {
            patch.insert(field.to_owned(), Value::Bool(value));
        }
    }
    for field in ["sortOrder", "manualOrder", "lastActivityAt", "createdAt"] {
        if let Some(value) = optional_finite(object.get(field)) {
            patch.insert(field.to_owned(), Value::from(value));
        }
    }
    for field in [
        "linkedPR",
        "sparseDirectories",
        "pushTarget",
        "diffComments",
        "mobileDiffReview",
    ] {
        if let Some(value) = object.get(field) {
            patch.insert(field.to_owned(), value.clone());
        }
    }
    finish(issues)?;
    Ok(WorktreeSetInput {
        expected_revision: expected_revision.unwrap_or_default(),
        patch,
        worktree: worktree.unwrap_or_default(),
    })
}

pub(super) fn parse_archive(
    body: Option<&Value>,
) -> Result<WorktreeArchiveInput, WorktreeInputFailure> {
    let object = require_object(body).map_err(WorktreeInputFailure::from)?;
    let mut issues = InputIssues::new();
    let worktree = required_string(
        object.get("worktree"),
        "worktree",
        "Missing worktree selector",
        &mut issues,
    );
    let expected_revision = parse_revision(object, &mut issues);
    let delete_branch = optional_boolean(object, "deleteBranch", &mut issues).unwrap_or(false);
    finish(issues)?;
    Ok(WorktreeArchiveInput {
        delete_branch,
        expected_revision: expected_revision.unwrap_or_default(),
        worktree: worktree.unwrap_or_default(),
    })
}

pub(super) fn parse_archive_list(
    body: Option<&Value>,
) -> Result<WorktreeArchiveListInput, WorktreeInputFailure> {
    let object = require_object(body).map_err(WorktreeInputFailure::from)?;
    Ok(WorktreeArchiveListInput {
        repo: optional_string(object.get("repo")),
    })
}

pub(super) fn parse_archive_restore(
    body: Option<&Value>,
) -> Result<WorktreeArchiveRestoreInput, WorktreeInputFailure> {
    let object = require_object(body).map_err(WorktreeInputFailure::from)?;
    let mut issues = InputIssues::new();
    let archive_id = required_string(
        object.get("archiveId"),
        "archiveId",
        "Missing archive selector",
        &mut issues,
    );
    let expected_revision = parse_revision(object, &mut issues);
    finish(issues)?;
    Ok(WorktreeArchiveRestoreInput {
        archive_id: archive_id.unwrap_or_default(),
        expected_revision: expected_revision.unwrap_or_default(),
    })
}

fn parse_revision(object: &Map<String, Value>, issues: &mut InputIssues) -> Option<i64> {
    let path = [PathSegment::field("expectedRevision")];
    let revision = parse_integer(
        object.get("expectedRevision"),
        &path,
        false,
        Some(9_007_199_254_740_991),
        issues,
    );
    if revision.is_some_and(|revision| revision < 0) {
        issues.push(json!({
            "origin": "number",
            "code": "too_small",
            "minimum": 0,
            "inclusive": true,
            "path": path_json(&path),
            "message": "Too small: expected number to be >=0"
        }));
    }
    revision
}

fn optional_boolean(
    object: &Map<String, Value>,
    field: &'static str,
    issues: &mut InputIssues,
) -> Option<bool> {
    let raw = object.get(field)?;
    match raw.as_bool() {
        Some(value) => Some(value),
        None => {
            let path = [PathSegment::field(field)];
            issues.push(invalid_type_issue(&path, "boolean", value_type(Some(raw))));
            None
        }
    }
}

fn required_string(
    value: Option<&Value>,
    field: &'static str,
    message: &'static str,
    issues: &mut InputIssues,
) -> Option<String> {
    let value = value.and_then(Value::as_str).unwrap_or_default();
    if !value.is_empty() {
        return Some(value.to_owned());
    }
    let path = [PathSegment::field(field)];
    issues.push(json!({
        "origin": "string",
        "code": "too_small",
        "minimum": 1,
        "inclusive": true,
        "path": path_json(&path),
        "message": message,
    }));
    None
}

fn optional_string(value: Option<&Value>) -> Option<String> {
    value
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

fn optional_finite(value: Option<&Value>) -> Option<f64> {
    value
        .and_then(Value::as_f64)
        .filter(|value| value.is_finite())
}

fn finish(issues: InputIssues) -> Result<(), WorktreeInputFailure> {
    if issues.is_empty() {
        Ok(())
    } else {
        Err(issues.into())
    }
}

impl From<InputIssues> for WorktreeInputFailure {
    fn from(issues: InputIssues) -> Self {
        Self {
            data: issues.into_data(),
        }
    }
}

impl std::fmt::Debug for WorktreeInputFailure {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("WorktreeInputFailure")
    }
}

impl std::fmt::Display for WorktreeInputFailure {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("worktree input validation failed")
    }
}

impl std::error::Error for WorktreeInputFailure {}

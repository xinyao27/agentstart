use serde_json::Value;

use crate::folder_workspaces::FolderWorkspaceUpdate;
use crate::rpc::zod_input::{InputIssues, PathSegment, invalid_type_issue, value_type};

use super::{
    FolderWorkspaceInputFailure, optional_boolean, optional_string, require, required, review,
    revision,
};

pub(super) fn parse_update(
    body: Option<&Value>,
) -> Result<FolderWorkspaceUpdate, FolderWorkspaceInputFailure> {
    let object = require(body)?;
    let mut issues = InputIssues::new();
    let expected_revision = revision(object, &mut issues);
    let id = required(
        object,
        "folderWorkspaceId",
        "Missing folder workspace id",
        &mut issues,
    );
    let updates_path = [PathSegment::field("updates")];
    let Some(updates) = object.get("updates").and_then(Value::as_object) else {
        issues.push(invalid_type_issue(
            &updates_path,
            "object",
            value_type(object.get("updates")),
        ));
        return Err(FolderWorkspaceInputFailure::new(issues));
    };
    let linked_review = match updates.get("linkedReview") {
        None => None,
        Some(Value::Null) => Some(None),
        Some(value) => review::parse(
            value,
            &[
                PathSegment::field("updates"),
                PathSegment::field("linkedReview"),
            ],
            &mut issues,
        )
        .map(Some),
    };
    let first_error = match updates.get("firstAgentMessageRenameError") {
        None => None,
        Some(Value::Null) => Some(None),
        Some(Value::String(value)) => Some(Some(value.clone())),
        Some(value) => {
            let path = [
                PathSegment::field("updates"),
                PathSegment::field("firstAgentMessageRenameError"),
            ];
            issues.push(invalid_type_issue(&path, "string", value_type(Some(value))));
            None
        }
    };
    let input = FolderWorkspaceUpdate {
        comment: optional_plain_string(
            updates.get("comment"),
            &[PathSegment::field("updates"), PathSegment::field("comment")],
            &mut issues,
        ),
        created_with_agent: review::agent(
            updates.get("createdWithAgent"),
            &[
                PathSegment::field("updates"),
                PathSegment::field("createdWithAgent"),
            ],
            &mut issues,
        ),
        expected_revision: expected_revision.unwrap_or_default(),
        first_agent_message_rename_error: first_error,
        folder_path: optional_string(updates.get("folderPath")),
        folder_workspace_id: id.clone().unwrap_or_default(),
        is_archived: optional_boolean(
            updates.get("isArchived"),
            &[
                PathSegment::field("updates"),
                PathSegment::field("isArchived"),
            ],
            &mut issues,
        ),
        is_pinned: optional_boolean(
            updates.get("isPinned"),
            &[
                PathSegment::field("updates"),
                PathSegment::field("isPinned"),
            ],
            &mut issues,
        ),
        is_unread: optional_boolean(
            updates.get("isUnread"),
            &[
                PathSegment::field("updates"),
                PathSegment::field("isUnread"),
            ],
            &mut issues,
        ),
        last_activity_at: optional_finite(updates.get("lastActivityAt")),
        linked_review,
        manual_order: optional_finite(updates.get("manualOrder")),
        name: optional_string(updates.get("name")),
        pending_first_agent_message_rename: optional_boolean(
            updates.get("pendingFirstAgentMessageRename"),
            &[
                PathSegment::field("updates"),
                PathSegment::field("pendingFirstAgentMessageRename"),
            ],
            &mut issues,
        ),
        sort_order: optional_finite(updates.get("sortOrder")),
        workspace_status: optional_string(updates.get("workspaceStatus")),
    };
    if expected_revision.is_some() && id.is_some() && issues.is_empty() {
        Ok(input)
    } else {
        Err(FolderWorkspaceInputFailure::new(issues))
    }
}

fn optional_plain_string(
    value: Option<&Value>,
    path: &[PathSegment],
    issues: &mut InputIssues,
) -> Option<String> {
    match value {
        None => None,
        Some(Value::String(value)) => Some(value.clone()),
        Some(value) => {
            issues.push(invalid_type_issue(path, "string", value_type(Some(value))));
            None
        }
    }
}

fn optional_finite(value: Option<&Value>) -> Option<f64> {
    value
        .and_then(Value::as_f64)
        .filter(|value| value.is_finite())
}

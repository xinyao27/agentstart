// Why: the authority answers with typed catalog rows; this is the single place
// that renders those rows into the protobuf wire messages shared by every
// folder-workspace verb.
use agentstart_protocol::runtime::v1::folder_workspace_nullable_text::Value as NullableTextValue;
use agentstart_protocol::runtime::v1::{
    FolderWorkspace as ProtocolFolderWorkspace, FolderWorkspaceLinkedReview,
    FolderWorkspaceNullableText, FolderWorkspaceReviewKind, FolderWorkspaceReviewProvider,
};

use crate::folder_workspaces::{FolderWorkspace, LinkedReview};

pub(super) fn folder_workspace(workspace: &FolderWorkspace) -> ProtocolFolderWorkspace {
    ProtocolFolderWorkspace {
        id: workspace.id.clone(),
        name: workspace.name.clone(),
        comment: workspace.comment.clone(),
        folder_path: workspace.folder_path.clone(),
        project_group_id: workspace.project_group_id.clone(),
        connection_id: workspace.connection_id.clone(),
        created_with_agent: workspace.created_with_agent.clone(),
        workspace_status: workspace.workspace_status.clone(),
        manual_order: workspace.manual_order,
        is_archived: workspace.is_archived,
        is_pinned: workspace.is_pinned,
        is_unread: workspace.is_unread,
        sort_order: workspace.sort_order,
        last_activity_at: workspace.last_activity_at,
        created_at: workspace.created_at,
        updated_at: workspace.updated_at,
        pending_first_agent_message_rename: workspace.pending_first_agent_message_rename,
        linked_review: workspace.linked_review.as_ref().map(linked_review),
        first_agent_message_rename_error: nullable_text(
            workspace.first_agent_message_rename_error.clone(),
        ),
    }
}

pub(super) fn nullable_folder_workspace(workspace: &FolderWorkspace) -> ProtocolFolderWorkspace {
    folder_workspace(workspace)
}

fn linked_review(review: &LinkedReview) -> FolderWorkspaceLinkedReview {
    FolderWorkspaceLinkedReview {
        provider: protocol_provider(&review.provider) as i32,
        kind: protocol_kind(&review.review_type) as i32,
        number: review.number,
        title: review.title.clone(),
        url: review.url.clone(),
        repo_id: review.repo_id.clone(),
    }
}

fn protocol_provider(provider: &str) -> FolderWorkspaceReviewProvider {
    match provider {
        "github" => FolderWorkspaceReviewProvider::Github,
        // Why: the authority only persists provider strings the legacy parser
        // admitted, so an unknown value means an older row, not a caller error.
        _ => FolderWorkspaceReviewProvider::Unspecified,
    }
}

fn protocol_kind(review_type: &str) -> FolderWorkspaceReviewKind {
    match review_type {
        "pr" => FolderWorkspaceReviewKind::PullRequest,
        _ => FolderWorkspaceReviewKind::Unspecified,
    }
}

fn nullable_text(value: Option<Option<String>>) -> Option<FolderWorkspaceNullableText> {
    value.map(|value| FolderWorkspaceNullableText {
        value: Some(match value {
            Some(text) => NullableTextValue::Text(text),
            None => NullableTextValue::Null(true),
        }),
    })
}

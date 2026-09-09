// Why: the workspace-space authority returns typed scan records shared with
// the legacy JSON surface; this is the single place that renders those
// records into the typed protobuf wire messages.
use yiru_protocol::protocol::v1::{Status, StatusCode};
use yiru_protocol::runtime::v1::workspace_space_service_analyze_response::Result as AnalyzeResult;
use yiru_protocol::runtime::v1::{
    WorkspaceSpaceAnalysis, WorkspaceSpaceItem, WorkspaceSpaceItemKind, WorkspaceSpaceRepoSummary,
    WorkspaceSpaceServiceAnalyzeResponse, WorkspaceSpaceWorktree,
};

use crate::workspace_space::{
    WorkspaceSpaceAnalysis as DomainAnalysis, WorkspaceSpaceAnalyzeResult,
};

pub(super) fn analyze_response(
    result: WorkspaceSpaceAnalyzeResult,
) -> WorkspaceSpaceServiceAnalyzeResponse {
    let result = match result {
        WorkspaceSpaceAnalyzeResult::Complete { analysis, .. } => {
            AnalyzeResult::Analysis(analysis_message(analysis))
        }
        WorkspaceSpaceAnalyzeResult::Cancelled { .. } => AnalyzeResult::Cancelled(true),
    };
    WorkspaceSpaceServiceAnalyzeResponse {
        result: Some(result),
    }
}

fn analysis_message(analysis: DomainAnalysis) -> WorkspaceSpaceAnalysis {
    WorkspaceSpaceAnalysis {
        scanned_at: analysis.scanned_at,
        total_size_bytes: analysis.total_size_bytes,
        reclaimable_bytes: analysis.reclaimable_bytes,
        worktree_count: count(analysis.worktree_count),
        scanned_worktree_count: count(analysis.scanned_worktree_count),
        unavailable_worktree_count: count(analysis.unavailable_worktree_count),
        repos: analysis.repos.iter().map(repo_summary).collect(),
        worktrees: analysis.worktrees.iter().map(worktree).collect(),
    }
}

fn repo_summary(
    summary: &crate::workspace_space::WorkspaceSpaceRepoSummary,
) -> WorkspaceSpaceRepoSummary {
    WorkspaceSpaceRepoSummary {
        repo_id: summary.repo_id.clone(),
        display_name: summary.display_name.clone(),
        path: summary.path.clone(),
        is_remote: summary.is_remote,
        worktree_count: count(summary.worktree_count),
        scanned_worktree_count: count(summary.scanned_worktree_count),
        unavailable_worktree_count: count(summary.unavailable_worktree_count),
        total_size_bytes: summary.total_size_bytes,
        reclaimable_bytes: summary.reclaimable_bytes,
        error: summary.error.clone(),
    }
}

fn worktree(worktree: &crate::workspace_space::WorkspaceSpaceWorktree) -> WorkspaceSpaceWorktree {
    WorkspaceSpaceWorktree {
        worktree_id: worktree.worktree_id.clone(),
        repo_id: worktree.repo_id.clone(),
        repo_display_name: worktree.repo_display_name.clone(),
        repo_path: worktree.repo_path.clone(),
        display_name: worktree.display_name.clone(),
        path: worktree.path.clone(),
        branch: worktree.branch.clone(),
        is_main_worktree: worktree.is_main_worktree,
        is_remote: worktree.is_remote,
        is_sparse: worktree.is_sparse,
        can_delete: worktree.can_delete,
        last_activity_at: worktree.last_activity_at,
        status: worktree.status.clone(),
        error: worktree.error.clone(),
        scanned_at: worktree.scanned_at,
        size_bytes: worktree.size_bytes,
        reclaimable_bytes: worktree.reclaimable_bytes,
        skipped_entry_count: count(worktree.skipped_entry_count),
        top_level_items: worktree.top_level_items.iter().map(item).collect(),
        omitted_top_level_item_count: count(worktree.omitted_top_level_item_count),
        omitted_top_level_size_bytes: worktree.omitted_top_level_size_bytes,
    }
}

fn item(item: &crate::workspace_space::WorkspaceSpaceItem) -> WorkspaceSpaceItem {
    WorkspaceSpaceItem {
        name: item.name.clone(),
        path: item.path.clone(),
        kind: (match item.kind {
            crate::workspace_space::WorkspaceSpaceItemKind::Directory => {
                WorkspaceSpaceItemKind::Directory
            }
            crate::workspace_space::WorkspaceSpaceItemKind::File => WorkspaceSpaceItemKind::File,
            crate::workspace_space::WorkspaceSpaceItemKind::Symlink => {
                WorkspaceSpaceItemKind::Symlink
            }
            crate::workspace_space::WorkspaceSpaceItemKind::Other => WorkspaceSpaceItemKind::Other,
        }) as i32,
        size_bytes: item.size_bytes,
    }
}

fn count(value: usize) -> u32 {
    u32::try_from(value).unwrap_or(u32::MAX)
}

pub(super) fn internal_status(error: &crate::workspace_space::WorkspaceSpaceError) -> Status {
    status(StatusCode::Internal, &error.to_string())
}

fn status(code: StatusCode, message: &str) -> Status {
    Status {
        code: code as i32,
        message: message.to_owned(),
        details: Vec::new(),
    }
}

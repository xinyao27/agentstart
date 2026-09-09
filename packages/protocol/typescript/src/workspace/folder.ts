import type {
  FolderWorkspaceValue,
  FolderWorkspaceLinkedReviewValue
} from '../folder-workspace-values.js'
import type { Worktree } from '../worktree/model.js'
import { folderWorkspaceKey } from './identity.js'
export type FolderWorkspace = FolderWorkspaceValue
export type FolderWorkspaceLinkedReview = FolderWorkspaceLinkedReviewValue

export function folderWorkspaceToWorktree(folderWorkspace: FolderWorkspace): Worktree {
  const linkedReview = folderWorkspace.linkedReview
  return {
    id: folderWorkspaceKey(folderWorkspace.id),
    repoId: `folder-workspace:${folderWorkspace.projectGroupId}`,
    displayName: folderWorkspace.name,
    comment: folderWorkspace.comment,
    linkedPR: linkedReview?.number ?? null,
    isArchived: folderWorkspace.isArchived,
    isUnread: folderWorkspace.isUnread,
    isPinned: folderWorkspace.isPinned,
    sortOrder: folderWorkspace.sortOrder,
    manualOrder: folderWorkspace.manualOrder,
    lastActivityAt: folderWorkspace.lastActivityAt,
    createdAt: folderWorkspace.createdAt,
    createdWithAgent: folderWorkspace.createdWithAgent,
    pendingFirstAgentMessageRename: folderWorkspace.pendingFirstAgentMessageRename,
    firstAgentMessageRenameError: folderWorkspace.firstAgentMessageRenameError,
    workspaceStatus: folderWorkspace.workspaceStatus,
    path: folderWorkspace.folderPath,
    head: '',
    branch: '',
    isBare: false,
    isSparse: false,
    isMainWorktree: false
  }
}

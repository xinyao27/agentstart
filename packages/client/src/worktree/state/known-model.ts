import type { FolderWorkspace } from '@agentstart/protocol/workspace/folder'
import { folderWorkspaceToWorktree } from '@agentstart/protocol/workspace/folder'
import { parseWorkspaceKey } from '@agentstart/protocol/workspace/identity'
import type {
  DetectedWorktreeListResult,
  Worktree,
  WorktreeMeta
} from '@agentstart/protocol/worktree/model'

import type { AppState } from '../../store/types'
import { folderWorkspaceWorktreeCache } from './refresh-model'
import { findWorktreeById } from './types'

export function findKnownWorktreeById(
  state: Pick<AppState, 'worktreesByRepo' | 'detectedWorktreesByRepo' | 'folderWorkspaces'>,
  worktreeId: string
): Worktree | DetectedWorktreeListResult['worktrees'][number] | undefined {
  const workspaceScope = parseWorkspaceKey(worktreeId)
  if (workspaceScope?.type === 'folder') {
    const folderWorkspace = state.folderWorkspaces.find(
      (workspace) => workspace.id === workspaceScope.folderWorkspaceId
    )
    if (!folderWorkspace) {
      return undefined
    }
    const cached = folderWorkspaceWorktreeCache.get(folderWorkspace)
    if (cached) {
      return cached
    }
    const worktree = folderWorkspaceToWorktree(folderWorkspace)
    folderWorkspaceWorktreeCache.set(folderWorkspace, worktree)
    return worktree
  }
  const visible = findWorktreeById(state.worktreesByRepo, worktreeId)
  if (visible) {
    return visible
  }
  for (const result of Object.values(state.detectedWorktreesByRepo)) {
    const detected = result.worktrees.find((worktree) => worktree.id === worktreeId)
    if (detected) {
      return detected
    }
  }
  return undefined
}

export function getFolderWorkspaceMetaUpdates(
  updates: Partial<WorktreeMeta>
): Partial<
  Pick<
    FolderWorkspace,
    | 'name'
    | 'comment'
    | 'isArchived'
    | 'isUnread'
    | 'isPinned'
    | 'sortOrder'
    | 'manualOrder'
    | 'lastActivityAt'
    | 'workspaceStatus'
    | 'createdWithAgent'
    | 'pendingFirstAgentMessageRename'
    | 'firstAgentMessageRenameError'
  >
> {
  const next: Partial<
    Pick<
      FolderWorkspace,
      | 'name'
      | 'comment'
      | 'isArchived'
      | 'isUnread'
      | 'isPinned'
      | 'sortOrder'
      | 'manualOrder'
      | 'lastActivityAt'
      | 'workspaceStatus'
      | 'createdWithAgent'
      | 'pendingFirstAgentMessageRename'
      | 'firstAgentMessageRenameError'
    >
  > = {}
  if (updates.displayName !== undefined) {
    next.name = updates.displayName
    next.pendingFirstAgentMessageRename = false
    next.firstAgentMessageRenameError = null
  }
  if (updates.comment !== undefined) {
    next.comment = updates.comment
    next.lastActivityAt = Date.now()
  }
  if (updates.isArchived !== undefined) {
    next.isArchived = updates.isArchived
  }
  if (updates.isUnread !== undefined) {
    next.isUnread = updates.isUnread
  }
  if (updates.isPinned !== undefined) {
    next.isPinned = updates.isPinned
  }
  if (updates.sortOrder !== undefined) {
    next.sortOrder = updates.sortOrder
  }
  if (updates.manualOrder !== undefined) {
    next.manualOrder = updates.manualOrder
  }
  if (updates.lastActivityAt !== undefined) {
    next.lastActivityAt = updates.lastActivityAt
  }
  if (updates.workspaceStatus !== undefined) {
    next.workspaceStatus = updates.workspaceStatus
  }
  if (updates.createdWithAgent !== undefined) {
    next.createdWithAgent = updates.createdWithAgent
  }
  if (updates.pendingFirstAgentMessageRename !== undefined) {
    next.pendingFirstAgentMessageRename = updates.pendingFirstAgentMessageRename
  }
  if (updates.firstAgentMessageRenameError !== undefined) {
    next.firstAgentMessageRenameError = updates.firstAgentMessageRenameError
  }
  return next
}

export function isRuntimeSelectorNotFoundError(error: unknown): boolean {
  if (
    error &&
    typeof error === 'object' &&
    'cause' in error &&
    isRuntimeSelectorNotFoundError((error as { cause?: unknown }).cause)
  ) {
    return true
  }
  const code =
    error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string'
      ? (error as { code: string }).code
      : null
  const responseCode =
    error &&
    typeof error === 'object' &&
    'response' in error &&
    typeof (error as { response?: { error?: { code?: unknown } } }).response?.error?.code ===
      'string'
      ? (error as { response: { error: { code: string } } }).response.error.code
      : null
  const responseMessage =
    error &&
    typeof error === 'object' &&
    'response' in error &&
    typeof (error as { response?: { error?: { message?: unknown } } }).response?.error?.message ===
      'string'
      ? (error as { response: { error: { message: string } } }).response.error.message
      : null
  const message = error instanceof Error ? error.message : String(error)
  return (
    message === 'selector_not_found' ||
    message.includes('selector_not_found') ||
    code === 'selector_not_found' ||
    responseCode === 'selector_not_found' ||
    responseMessage === 'selector_not_found' ||
    String(error).includes('selector_not_found')
  )
}

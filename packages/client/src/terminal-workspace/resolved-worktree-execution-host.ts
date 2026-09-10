import {
  LOCAL_EXECUTION_HOST_ID,
  parseExecutionHostId,
  type ExecutionHostId
} from '@agentstart/protocol/host/identity'
import { folderWorkspaceKey, parseWorkspaceKey } from '@agentstart/protocol/workspace/identity'
import type { WorktreeRuntimeOwnerState } from '~renderer/worktree/runtime-owner'
import {
  findIndexedFolderWorkspaceOwner,
  findIndexedProjectGroupOwner,
  findIndexedRepoOwner,
  findIndexedWorktreeOwner
} from '~renderer/worktree/runtime-owner-index'

function getResolvedFolderHost(
  state: WorktreeRuntimeOwnerState,
  folderWorkspaceId: string
): ExecutionHostId | null {
  const folder = findIndexedFolderWorkspaceOwner(state.folderWorkspaces, folderWorkspaceId)
  const group = folder
    ? findIndexedProjectGroupOwner(state.projectGroups, folder.projectGroupId)
    : null
  const explicitHost = parseExecutionHostId(group?.executionHostId)
  if (explicitHost) {
    return explicitHost.id
  }
  if (folder?.connectionId?.trim() || group?.connectionId?.trim()) {
    return LOCAL_EXECUTION_HOST_ID
  }
  const restoredHost = parseExecutionHostId(
    state.restoredRuntimeHostIdByWorkspaceSessionKey?.[folderWorkspaceKey(folderWorkspaceId)]
  )
  if (restoredHost?.kind === 'runtime') {
    return restoredHost.id
  }
  return folder && group ? LOCAL_EXECUTION_HOST_ID : null
}

/**
 * Resolves a host only when hydrated ownership proves it.
 */
export function getResolvedExecutionHostIdForWorktree(
  state: WorktreeRuntimeOwnerState,
  worktreeId: string | null | undefined
): ExecutionHostId | null {
  if (!worktreeId) {
    return null
  }
  const scope = parseWorkspaceKey(worktreeId)
  if (scope?.type === 'folder') {
    return getResolvedFolderHost(state, scope.folderWorkspaceId)
  }
  const worktree = findIndexedWorktreeOwner(state.worktreesByRepo, worktreeId)
  const worktreeHost = parseExecutionHostId(worktree?.hostId)
  if (worktreeHost) {
    return worktreeHost.id
  }
  if (!worktree) {
    return null
  }
  const repo = findIndexedRepoOwner(state.repos, worktree.repoId)
  if (!repo) {
    return null
  }
  const explicitRepoHost = parseExecutionHostId(repo.executionHostId)
  if (explicitRepoHost) {
    return explicitRepoHost.id
  }
  return LOCAL_EXECUTION_HOST_ID
}

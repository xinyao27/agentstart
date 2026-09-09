import {
  getRepoExecutionHostId,
  LOCAL_EXECUTION_HOST_ID,
  normalizeExecutionHostId,
  parseExecutionHostId,
  type ExecutionHostId
} from '@yiru/protocol/host/identity'
import type { Repo } from '@yiru/protocol/project/repository'
import { parseWorkspaceKey } from '@yiru/protocol/workspace/identity'
import { getRepoIdFromWorktreeId } from '@yiru/protocol/worktree/identity'
import type { AppState } from '~renderer/store/types'
import { getIndexedWorktreeMap } from '~renderer/worktree/repo-index'

import { getFolderWorkspaceCandidateRepos } from '../../editor/folder-workspace-connection'

export type AiVaultResumeTargetStatus = 'local' | 'runtime' | 'unknown'

type AiVaultResumeRepoOwner = Pick<Repo, 'connectionId' | 'executionHostId'>

export function getAiVaultResumeRepoTargetStatus(
  repo: AiVaultResumeRepoOwner | null | undefined
): AiVaultResumeTargetStatus {
  if (!repo) {
    return 'unknown'
  }
  // Why: runtime-owned repos intentionally keep connectionId null, so check
  // the execution host.
  return getAiVaultResumeExecutionHostTargetStatus(getRepoExecutionHostId(repo))
}

export function isSupportedAiVaultResumeTargetStatus(status: AiVaultResumeTargetStatus): boolean {
  return status === 'local' || status === 'runtime'
}

export function canResumeAiVaultSessionOnTarget(args: {
  sessionExecutionHostId?: ExecutionHostId | null
  targetStatus: AiVaultResumeTargetStatus
  targetExecutionHostId?: ExecutionHostId | null
}): boolean {
  const sessionExecutionHostId = normalizeExecutionHostId(args.sessionExecutionHostId)
  const targetExecutionHostId = normalizeExecutionHostId(args.targetExecutionHostId)
  if (args.targetStatus === 'runtime') {
    // Runtime session stores live on one paired server; only queue resumes back
    // onto that exact server host.
    return Boolean(
      sessionExecutionHostId &&
      targetExecutionHostId &&
      sessionExecutionHostId === targetExecutionHostId
    )
  }
  if (!isSupportedAiVaultResumeTargetStatus(args.targetStatus)) {
    return false
  }
  if (sessionExecutionHostId) {
    if (targetExecutionHostId) {
      if (sessionExecutionHostId === targetExecutionHostId) {
        return true
      }
      return false
    }
    if (sessionExecutionHostId !== LOCAL_EXECUTION_HOST_ID) {
      return false
    }
  }
  return true
}

export function getAiVaultResumeWorkspaceExecutionHostId(
  state: Pick<AppState, 'folderWorkspaces' | 'projectGroups' | 'repos' | 'worktreesByRepo'>,
  workspaceId: string | null
): ExecutionHostId | null {
  if (!workspaceId) {
    return null
  }

  const workspaceKey = parseWorkspaceKey(workspaceId)
  if (workspaceKey?.type === 'folder') {
    return getAiVaultResumeFolderExecutionHostId(state, workspaceKey.folderWorkspaceId)
  }

  const worktreeId = workspaceKey?.type === 'worktree' ? workspaceKey.worktreeId : workspaceId
  const worktree = getIndexedWorktreeMap(state.worktreesByRepo ?? {}).get(worktreeId)
  const worktreeHostId = normalizeExecutionHostId(worktree?.hostId)
  if (worktreeHostId) {
    return worktreeHostId
  }
  const repoId = worktree?.repoId ?? getRepoIdFromWorktreeId(worktreeId)
  const repo = state.repos.find((candidate) => candidate.id === repoId)
  return repo ? getRepoExecutionHostId(repo) : null
}

export function getAiVaultResumeWorkspaceTargetStatus(
  state: Pick<AppState, 'folderWorkspaces' | 'projectGroups' | 'repos' | 'worktreesByRepo'>,
  workspaceId: string | null
): AiVaultResumeTargetStatus {
  if (!workspaceId) {
    return 'unknown'
  }

  const workspaceKey = parseWorkspaceKey(workspaceId)
  if (workspaceKey?.type === 'folder') {
    return getAiVaultResumeFolderTargetStatus(state, workspaceKey.folderWorkspaceId)
  }

  const worktreeId = workspaceKey?.type === 'worktree' ? workspaceKey.worktreeId : workspaceId
  const worktree = getIndexedWorktreeMap(state.worktreesByRepo ?? {}).get(worktreeId)
  const worktreeHost = getAiVaultResumeExecutionHostTargetStatus(worktree?.hostId)
  if (worktreeHost !== 'unknown') {
    return worktreeHost
  }
  const repoId = worktree?.repoId ?? getRepoIdFromWorktreeId(worktreeId)
  return getAiVaultResumeRepoTargetStatus(state.repos.find((repo) => repo.id === repoId))
}

function getAiVaultResumeFolderTargetStatus(
  state: Pick<AppState, 'folderWorkspaces' | 'projectGroups' | 'repos'>,
  folderWorkspaceId: string
): AiVaultResumeTargetStatus {
  const workspace = state.folderWorkspaces.find((entry) => entry.id === folderWorkspaceId)
  if (!workspace) {
    return 'unknown'
  }

  const group = state.projectGroups.find((entry) => entry.id === workspace.projectGroupId)
  const groupHostId = normalizeExecutionHostId(group?.executionHostId)
  if (groupHostId) {
    return getAiVaultResumeExecutionHostTargetStatus(groupHostId)
  }
  const explicitConnectionId = (workspace.connectionId ?? group?.connectionId ?? '').trim()
  if (explicitConnectionId) {
    return 'local'
  }

  return mergeAiVaultResumeExecutionHostTargetStatuses(
    getFolderWorkspaceCandidateRepos(state, folderWorkspaceId).map(getRepoExecutionHostId)
  )
}

function getAiVaultResumeFolderExecutionHostId(
  state: Pick<AppState, 'folderWorkspaces' | 'projectGroups' | 'repos'>,
  folderWorkspaceId: string
): ExecutionHostId | null {
  const workspace = state.folderWorkspaces.find((entry) => entry.id === folderWorkspaceId)
  if (!workspace) {
    return null
  }

  const group = state.projectGroups.find((entry) => entry.id === workspace.projectGroupId)
  const groupHostId = normalizeExecutionHostId(group?.executionHostId)
  if (groupHostId) {
    return groupHostId
  }
  const explicitConnectionId = (workspace.connectionId ?? group?.connectionId ?? '').trim()
  if (explicitConnectionId) {
    return LOCAL_EXECUTION_HOST_ID
  }
  return mergeAiVaultResumeExecutionHostIds(
    getFolderWorkspaceCandidateRepos(state, folderWorkspaceId).map(getRepoExecutionHostId)
  )
}

function getAiVaultResumeExecutionHostTargetStatus(
  hostId: ExecutionHostId | null | undefined
): AiVaultResumeTargetStatus {
  const parsed = parseExecutionHostId(hostId)
  if (!parsed) {
    return 'unknown'
  }
  if (parsed.kind === 'local') {
    return 'local'
  }
  switch (parsed.kind) {
    case 'runtime':
      return 'runtime'
    case 'ssh':
    case 'wsl':
      // Why: these hosts execute behind the current daemon rather than a separately paired runtime.
      return 'local'
  }
}

function mergeAiVaultResumeExecutionHostTargetStatuses(
  hostIds: readonly ExecutionHostId[]
): AiVaultResumeTargetStatus {
  if (hostIds.length === 0) {
    return 'local'
  }
  const statuses = hostIds.map(getAiVaultResumeExecutionHostTargetStatus)
  const uniqueStatuses = new Set(statuses)
  if (uniqueStatuses.has('runtime')) {
    return 'runtime'
  }
  return new Set(hostIds).size === 1 ? (statuses[0] ?? 'unknown') : 'unknown'
}

function mergeAiVaultResumeExecutionHostIds(
  hostIds: readonly ExecutionHostId[]
): ExecutionHostId | null {
  if (hostIds.length === 0) {
    return LOCAL_EXECUTION_HOST_ID
  }
  const uniqueHostIds = new Set(hostIds)
  return uniqueHostIds.size === 1 ? (hostIds[0] ?? null) : null
}

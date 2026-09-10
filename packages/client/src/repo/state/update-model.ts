import {
  LOCAL_EXECUTION_HOST_ID,
  toRuntimeExecutionHostId
} from '@agentstart/protocol/host/identity'
import { normalizeRepoBadgeColor } from '@agentstart/protocol/project/appearance'
import type { NestedRepoScanResult } from '@agentstart/protocol/project/group-model'
import { sanitizeRepoIcon } from '@agentstart/protocol/project/icon'
import type { ProjectUpdateArgs } from '@agentstart/protocol/project/model'
import type { Repo } from '@agentstart/protocol/project/repository'
import type { FolderWorkspacePathStatus } from '@agentstart/protocol/workspace/folder-path'
import type { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'

import type { AppState } from '../../store/types'

export type RepoUpdate = Partial<
  Pick<
    Repo,
    | 'displayName'
    | 'badgeColor'
    | 'repoIcon'
    | 'upstream'
    | 'hookSettings'
    | 'worktreeBaseRef'
    | 'worktreeBasePath'
    | 'kind'
    | 'symlinkPaths'
    | 'forgeRemotePreference'
    | 'forkSyncMode'
    | 'externalWorktreeVisibility'
    | 'externalWorktreeVisibilityPromptDismissedAt'
    | 'externalWorktreeInboxBaselinePaths'
    | 'importedExternalWorktreePaths'
    | 'projectGroupId'
    | 'projectGroupOrder'
  >
> & {
  sourceControlAi?: Repo['sourceControlAi'] | null
  externalWorktreeDiscoverySuppressedAt?: Repo['externalWorktreeDiscoverySuppressedAt'] | null
}

export type ProjectUpdate = ProjectUpdateArgs['updates']

export type NestedRepoScanControls = {
  scanId?: string
  onProgress?: (scan: NestedRepoScanResult) => void
}

export type FolderWorkspacePathStatusCacheEntry = {
  status: FolderWorkspacePathStatus
  checkedAt: number
  requestSnapshot: string
}

export type DeleteProjectGroupWithContainedProjectsOptions = {
  removeContainedProjects: boolean
}

export type ProjectRemovalFailure = {
  projectId: string
  reason: string
}

export type DeleteProjectGroupWithContainedProjectsResult =
  | {
      status: 'deleted-group'
      groupId: string
      requestedProjectIds: string[]
      removedProjectIds: string[]
      failedProjectRemovals: ProjectRemovalFailure[]
    }
  | {
      status: 'missing-group' | 'group-delete-failed'
      groupId: string
      requestedProjectIds: string[]
      removedProjectIds: []
      failedProjectRemovals: []
    }

export function normalizeNestedRepoScanResult(scan: NestedRepoScanResult): NestedRepoScanResult {
  return {
    ...scan,
    stopped: scan.stopped ?? false,
    maxDepth: scan.maxDepth ?? 3,
    maxRepos: scan.maxRepos ?? 100,
    timeoutMs: scan.timeoutMs ?? null
  }
}

export function sanitizeRepoUpdate(updates: RepoUpdate): RepoUpdate {
  const sanitized = { ...updates }
  if ('badgeColor' in sanitized) {
    const badgeColor = normalizeRepoBadgeColor(sanitized.badgeColor)
    if (!badgeColor) {
      delete sanitized.badgeColor
    } else {
      sanitized.badgeColor = badgeColor
    }
  }
  if ('repoIcon' in sanitized) {
    const repoIcon = sanitizeRepoIcon(sanitized.repoIcon)
    if (repoIcon === undefined) {
      delete sanitized.repoIcon
    } else {
      sanitized.repoIcon = repoIcon
    }
  }
  if ('worktreeBasePath' in sanitized && sanitized.worktreeBasePath !== undefined) {
    sanitized.worktreeBasePath = sanitized.worktreeBasePath.trim() || undefined
  }
  if (
    'forkSyncMode' in sanitized &&
    sanitized.forkSyncMode !== undefined &&
    sanitized.forkSyncMode !== 'ask' &&
    sanitized.forkSyncMode !== 'safe-auto' &&
    sanitized.forkSyncMode !== 'off'
  ) {
    delete sanitized.forkSyncMode
  }
  return sanitized
}

const updateRepoChainsByStore = new WeakMap<() => AppState, Map<string, Promise<boolean>>>()

export function getRepoUpdateChains(get: () => AppState): Map<string, Promise<boolean>> {
  let chains = updateRepoChainsByStore.get(get)
  if (!chains) {
    chains = new Map<string, Promise<boolean>>()
    updateRepoChainsByStore.set(get, chains)
  }
  return chains
}

function worktreeBelongsToHost(worktree: { hostId?: string }, hostId: string): boolean {
  return (worktree.hostId ?? LOCAL_EXECUTION_HOST_ID) === hostId
}

export function getKnownRepoWorktreeIds(
  state: Pick<AppState, 'detectedWorktreesByRepo' | 'worktreesByRepo'>,
  projectId: string,
  hostId?: string
): string[] {
  const ids = new Set<string>()
  for (const worktree of state.worktreesByRepo[projectId] ?? []) {
    if (!hostId || worktreeBelongsToHost(worktree, hostId)) {
      ids.add(worktree.id)
    }
  }
  for (const worktree of state.detectedWorktreesByRepo[projectId]?.worktrees ?? []) {
    if (!hostId || worktreeBelongsToHost(worktree, hostId)) {
      ids.add(worktree.id)
    }
  }
  return [...ids]
}

export function getRuntimeTargetHostId(
  target: ReturnType<typeof getActiveRuntimeTarget>
): ReturnType<typeof toRuntimeExecutionHostId> | typeof LOCAL_EXECUTION_HOST_ID {
  return target.kind === 'environment'
    ? toRuntimeExecutionHostId(target.environmentId)
    : LOCAL_EXECUTION_HOST_ID
}

// Why: the web client owns no local host — the configured browser runtime routes
// its `local` calls to the paired runtime — so a local-target catalog answers
// with that same host's projects and stamps them `local`. Every project then
// exists twice under two hosts, and workspace ownership resolves to
// "unresolved", which is what made the file explorer refuse to list any
// workspace. On web the paired environment IS the first-paint host.

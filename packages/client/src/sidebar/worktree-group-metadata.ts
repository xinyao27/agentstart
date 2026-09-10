import type { Repo } from '@agentstart/protocol/project/repository'
import type { WorktreeLineage } from '@agentstart/protocol/worktree/lineage'
import type { Worktree } from '@agentstart/protocol/worktree/model'
import type React from 'react'
import { getGitHubPRCacheKey, getLegacyGitHubPRCacheKey } from '~renderer/github/cache-key'
import { translate } from '~renderer/i18n/i18n'
import {
  XCircle as CircleX,
  Folders as FolderTree,
  List,
  PushPin as Pin
} from '~renderer/icons/hugeicons'
import { UNGROUPED_PROJECT_GROUP_KEY } from '~renderer/project-catalog/group-order'
import { branchName } from '~renderer/source-control/branch-name'
import type { AppState } from '~renderer/store/types'

import {
  ConductorDoneIcon,
  ConductorProgressIcon,
  ConductorReviewIcon
} from './workspace-status-icons'

export type PRGroupKey = 'done' | 'in-review' | 'in-progress' | 'closed'

export const PR_GROUP_ORDER: PRGroupKey[] = ['done', 'in-review', 'in-progress', 'closed']

export const PR_GROUP_META: Record<
  PRGroupKey,
  { label: string; icon: React.ComponentType<{ className?: string }>; tone: string }
> = {
  done: {
    get label() {
      return translate('auto.components.sidebar.worktree.list.groups.5076efc3d2', 'Done')
    },
    icon: ConductorDoneIcon,
    tone: 'text-[#c7a594]'
  },
  'in-review': {
    get label() {
      return translate('auto.components.sidebar.worktree.list.groups.6798dc7c94', 'In review')
    },
    icon: ConductorReviewIcon,
    tone: 'text-[#16a34a]'
  },
  'in-progress': {
    get label() {
      return translate('auto.components.sidebar.worktree.list.groups.7c2f009786', 'In progress')
    },
    icon: ConductorProgressIcon,
    tone: 'text-[#d4a300]'
  },
  closed: {
    get label() {
      return translate('auto.components.sidebar.worktree.list.groups.682ed5d551', 'Closed')
    },
    icon: CircleX,
    tone: 'text-zinc-600 dark:text-zinc-300'
  }
}

export const PROJECT_GROUP_META = { tone: 'text-foreground', icon: FolderTree } as const

export function getProjectGroupHeaderKey(groupId: string | null): string {
  return groupId ? `project-group:${groupId}` : UNGROUPED_PROJECT_GROUP_KEY
}

export const PINNED_GROUP_KEY = 'pinned'
export const PINNED_GROUP_META = {
  get label() {
    return translate('auto.components.sidebar.worktree.list.groups.4aeefc5996', 'Pinned')
  },
  tone: 'text-foreground',
  icon: Pin
} as const

export const ALL_GROUP_KEY = 'all'
export const ALL_GROUP_META = {
  get label() {
    return translate('auto.components.sidebar.worktree.list.groups.0ed04075b8', 'All')
  },
  tone: 'text-foreground',
  icon: List
} as const

const LINEAGE_GROUP_PREFIX = 'lineage:'

export function getLineageGroupKey(worktreeId: string): string {
  return `${LINEAGE_GROUP_PREFIX}${worktreeId}`
}

export type LineageRenderInfo =
  | { state: 'none' }
  | { state: 'valid'; lineage: WorktreeLineage; parent: Worktree }
  | { state: 'missing'; lineage: WorktreeLineage }

export function getLineageRenderInfo(
  worktree: Worktree,
  lineageById: Record<string, WorktreeLineage>,
  worktreeMap: Map<string, Worktree>
): LineageRenderInfo {
  const lineage = lineageById[worktree.id]
  if (!lineage) {
    return { state: 'none' }
  }
  const parent = worktreeMap.get(lineage.parentWorktreeId)
  if (
    !parent ||
    worktree.instanceId !== lineage.worktreeInstanceId ||
    parent.instanceId !== lineage.parentWorktreeInstanceId
  ) {
    return { state: 'missing', lineage }
  }
  return { state: 'valid', lineage, parent }
}

function readPullRequestState(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || !('data' in value)) {
    return undefined
  }
  const data = value.data
  if (typeof data !== 'object' || data === null || !('state' in data)) {
    return undefined
  }
  return typeof data.state === 'string' ? data.state : undefined
}

function readCachedPullRequestState(
  cache: Record<string, unknown>,
  key: string
): string | undefined {
  return key ? readPullRequestState(cache[key]) : undefined
}

export function getPRGroupKey(
  worktree: Worktree,
  repoMap: Map<string, Repo>,
  prCache: Record<string, unknown> | null,
  settings?: AppState['settings']
): PRGroupKey {
  const repo = repoMap.get(worktree.repoId)
  const branch = branchName(worktree.branch)
  const scopedKey =
    repo && branch
      ? getGitHubPRCacheKey(repo.path, repo.id, branch, settings, repo.executionHostId, true)
      : ''
  const canUseLegacyCache = repo !== undefined && !repo.executionHostId
  const legacyRepoKey =
    canUseLegacyCache && branch ? getLegacyGitHubPRCacheKey(repo.path, repo.id, branch) : ''
  const legacyPathKey =
    canUseLegacyCache && branch ? getLegacyGitHubPRCacheKey(repo.path, undefined, branch) : ''
  const state = prCache
    ? (readCachedPullRequestState(prCache, scopedKey) ??
      readCachedPullRequestState(prCache, legacyRepoKey) ??
      readCachedPullRequestState(prCache, legacyPathKey))
    : undefined

  if (!state || state === 'draft') {
    return 'in-progress'
  }
  if (state === 'merged') {
    return 'done'
  }
  if (state === 'closed') {
    return 'closed'
  }
  return 'in-review'
}

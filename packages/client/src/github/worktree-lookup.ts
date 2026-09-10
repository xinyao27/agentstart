import {
  LOCAL_EXECUTION_HOST_ID,
  getRepoExecutionHostId,
  normalizeExecutionHostId
} from '@agentstart/protocol/host/identity'
import type { Worktree } from '@agentstart/protocol/worktree/model'
import type { AppState } from '~renderer/store/types'

type WorktreeLookupEntry = {
  first: Worktree
  unique: Worktree | null
  all: Worktree[]
}

export type WorktreeLookupIndex = {
  byId: Map<string, WorktreeLookupEntry>
  repoHostIdsByRepoId: Map<string, Set<string>>
}

export function findWorktreeById(state: AppState, worktreeId: string): Worktree | null {
  for (const worktrees of Object.values(state.worktreesByRepo)) {
    const worktree = worktrees.find((candidate) => candidate.id === worktreeId)
    if (worktree) {
      return worktree
    }
  }
  return null
}

export function buildWorktreeLookupIndex(state: AppState): WorktreeLookupIndex {
  const byId = new Map<string, WorktreeLookupEntry>()
  for (const worktrees of Object.values(state.worktreesByRepo)) {
    for (const worktree of worktrees) {
      const existing = byId.get(worktree.id)
      if (existing) {
        existing.unique = null
        existing.all.push(worktree)
      } else {
        byId.set(worktree.id, { first: worktree, unique: worktree, all: [worktree] })
      }
    }
  }
  const repoHostIdsByRepoId = new Map<string, Set<string>>()
  for (const repo of state.repos ?? []) {
    const hostIds = repoHostIdsByRepoId.get(repo.id) ?? new Set<string>()
    hostIds.add(getRepoExecutionHostId(repo))
    repoHostIdsByRepoId.set(repo.id, hostIds)
  }
  return { byId, repoHostIdsByRepoId }
}

export function findUniqueWorktreeById(
  state: AppState,
  worktreeId: string,
  executionHostId?: string,
  lookupIndex = buildWorktreeLookupIndex(state)
): Worktree | null {
  const entry = lookupIndex.byId.get(worktreeId)
  if (!entry || executionHostId === undefined) {
    return entry?.unique ?? null
  }
  const expectedHostId = normalizeExecutionHostId(executionHostId) ?? LOCAL_EXECUTION_HOST_ID
  const explicitMatches = entry.all.filter(
    (worktree) => normalizeExecutionHostId(worktree.hostId) === expectedHostId
  )
  if (explicitMatches.length > 0) {
    return explicitMatches.length === 1 ? explicitMatches[0] : null
  }
  if (entry.all.length !== 1) {
    return null
  }
  const match = entry.all[0]
  const repoHostIds = lookupIndex.repoHostIdsByRepoId.get(match.repoId)
  return repoHostIds?.size === 1 && repoHostIds.has(expectedHostId) ? match : null
}

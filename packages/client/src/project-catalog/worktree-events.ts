import type { QueryClient } from '@tanstack/react-query'
import { targetKey } from '~renderer/runtime/query-target'
import type { RuntimeClientTarget } from '~renderer/runtime/runtime-target'
import { useAppStore } from '~renderer/store/state'

import { readProjectCatalogSnapshot } from './catalog-snapshot'
import { projectCatalogRepoKey, projectCatalogTargetForRepo } from './query'
import {
  refreshProjectCatalogLineage,
  refreshProjectCatalogTargetRepos,
  refreshProjectCatalogWorktrees
} from './refresh'

const WORKTREE_RENAME_PURGE_GRACE_MS = 20_000
const recentlyRenamedWorktreeIdExpiry = new Map<string, number>()

type WorktreeChange = {
  renamed?: { oldWorktreeId: string; newWorktreeId: string }
  repoId: string
  target: RuntimeClientTarget
}

export function createProjectCatalogWorktreeEvents(queryClient: QueryClient): {
  dispose: () => void
  enqueue: (event: WorktreeChange) => void
} {
  const queuedByRepo = new Map<string, WorktreeChange[]>()
  const runningRepoKeys = new Set<string>()
  let isDisposed = false

  const drain = async (key: string): Promise<void> => {
    runningRepoKeys.add(key)
    try {
      while (!isDisposed) {
        const event = queuedByRepo.get(key)?.shift()
        if (!event) {
          return
        }
        try {
          await refreshChangedWorktrees(queryClient, event)
        } catch (error) {
          console.error('Failed to refresh changed worktrees:', error)
        }
      }
    } finally {
      runningRepoKeys.delete(key)
      if (queuedByRepo.get(key)?.length === 0) {
        queuedByRepo.delete(key)
      }
    }
  }

  return {
    dispose: () => {
      isDisposed = true
      queuedByRepo.clear()
    },
    enqueue: (event) => {
      if (isDisposed) {
        return
      }
      const key = `${targetKey(event.target)}:${event.repoId}`
      const queue = queuedByRepo.get(key) ?? []
      if (event.renamed || queue.at(-1)?.renamed) {
        queue.push(event)
      } else if (queue.length === 0) {
        queue.push(event)
      }
      queuedByRepo.set(key, queue)
      if (!runningRepoKeys.has(key)) {
        void drain(key)
      }
    }
  }
}

async function refreshChangedWorktrees(
  queryClient: QueryClient,
  event: WorktreeChange
): Promise<void> {
  const catalog = readProjectCatalogSnapshot()
  const repo =
    findTargetRepo(catalog.repos, event.target, event.repoId) ??
    findTargetRepo(
      await refreshProjectCatalogTargetRepos(queryClient, event.target),
      event.target,
      event.repoId
    )
  if (!repo) {
    return
  }
  const repoKey = projectCatalogRepoKey(repo)
  const previousDetected = catalog.detectedWorktreesByRepo[repoKey]
  const before = new Set(
    (previousDetected?.authoritative
      ? previousDetected.worktrees
      : (catalog.worktreesByRepo[repoKey] ?? [])
    ).map((worktree) => worktree.id)
  )
  const renamedWasActive =
    event.renamed !== undefined &&
    useAppStore.getState().activeWorktreeId === event.renamed.oldWorktreeId
  if (event.renamed) {
    const expiry = Date.now() + WORKTREE_RENAME_PURGE_GRACE_MS
    recentlyRenamedWorktreeIdExpiry.set(event.renamed.oldWorktreeId, expiry)
    recentlyRenamedWorktreeIdExpiry.set(event.renamed.newWorktreeId, expiry)
    useAppStore
      .getState()
      .migrateWorktreeIdentity(event.renamed.oldWorktreeId, event.renamed.newWorktreeId)
  }

  const [refreshed] = await Promise.all([
    refreshProjectCatalogWorktrees(queryClient, repo),
    refreshProjectCatalogLineage(queryClient, event.target)
  ])
  if (renamedWasActive && event.renamed) {
    useAppStore.getState().setActiveWorktree(event.renamed.newWorktreeId)
  }
  if (!refreshed.detected?.authoritative) {
    return
  }
  const after = new Set(refreshed.detected.worktrees.map((worktree) => worktree.id))
  const now = Date.now()
  const removed = [...before].filter((id) => {
    if (after.has(id)) {
      return false
    }
    const graceExpiry = recentlyRenamedWorktreeIdExpiry.get(id)
    return graceExpiry === undefined || graceExpiry <= now
  })
  for (const [id, expiry] of recentlyRenamedWorktreeIdExpiry) {
    if (expiry <= now) {
      recentlyRenamedWorktreeIdExpiry.delete(id)
    }
  }
  if (removed.length > 0) {
    const state = useAppStore.getState()
    state.purgeWorktreeTerminalState(removed)
    state.removeWorkspaceSpaceWorktrees(removed)
  }
}

function findTargetRepo(
  repos: ReturnType<typeof readProjectCatalogSnapshot>['repos'],
  target: RuntimeClientTarget,
  repoId: string
) {
  const expectedTargetKey = targetKey(target)
  return repos.find(
    (repo) =>
      repo.id === repoId && targetKey(projectCatalogTargetForRepo(repo)) === expectedTargetKey
  )
}

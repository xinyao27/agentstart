import { getRepoIdFromWorktreeId } from '@agentstart/protocol/worktree/identity'

type HydratedWorktree = { id: string }

type DetectedWorktreeHydration = {
  authoritative: boolean
  worktrees: readonly HydratedWorktree[]
}

export type HydratedWorktreeReferencePatch = {
  lastVisitedAtByWorktreeId?: Record<string, number>
  activeWorktreeId?: null
}

export function reconcileHydratedWorktreeReferences(args: {
  worktreesByRepo: Readonly<Record<string, readonly HydratedWorktree[]>>
  detectedWorktreesByRepo: Readonly<Record<string, DetectedWorktreeHydration>>
  lastVisitedAtByWorktreeId: Readonly<Record<string, number>>
  activeWorktreeId: string | null
}): HydratedWorktreeReferencePatch {
  const validIdsByRepo = new Map<string, Set<string>>()
  for (const [repoId, worktrees] of Object.entries(args.worktreesByRepo)) {
    if (args.detectedWorktreesByRepo[repoId]) {
      continue
    }
    validIdsByRepo.set(repoId, new Set(worktrees.map((worktree) => worktree.id)))
  }
  for (const [repoId, result] of Object.entries(args.detectedWorktreesByRepo)) {
    if (result.authoritative) {
      validIdsByRepo.set(repoId, new Set(result.worktrees.map((worktree) => worktree.id)))
    }
  }

  let timestampsChanged = false
  const nextLastVisited: Record<string, number> = {}
  for (const [worktreeId, visitedAt] of Object.entries(args.lastVisitedAtByWorktreeId)) {
    const hydratedIds = validIdsByRepo.get(getRepoIdFromWorktreeId(worktreeId))
    if (!hydratedIds || hydratedIds.has(worktreeId)) {
      nextLastVisited[worktreeId] = visitedAt
    } else {
      timestampsChanged = true
    }
  }

  const patch: HydratedWorktreeReferencePatch = {}
  if (timestampsChanged) {
    patch.lastVisitedAtByWorktreeId = nextLastVisited
  }
  if (args.activeWorktreeId) {
    const hydratedIds = validIdsByRepo.get(getRepoIdFromWorktreeId(args.activeWorktreeId))
    if (hydratedIds && !hydratedIds.has(args.activeWorktreeId)) {
      // Why: only an authoritative hydrated repo may invalidate persisted
      // selection; missing/in-flight SSH results must defer reconciliation.
      patch.activeWorktreeId = null
    }
  }
  return patch
}

import { isRuntimePathAbsolute, normalizeRuntimePathForComparison } from '@yiru/protocol/host/path'
import type { ProjectHostSetupProjection } from '@yiru/protocol/project/setup-projection'
import { splitWorktreeIdForFilesystem } from '@yiru/protocol/worktree/identity'
import type { Worktree } from '@yiru/protocol/worktree/model'

export function deriveAiVaultWorkspaceScopePaths(
  activeWorktree: Pick<Worktree, 'id' | 'path' | 'priorWorktreeIds' | 'repoId'> | null,
  liveWorktrees: readonly Pick<Worktree, 'id' | 'path' | 'repoId'>[] = []
): string[] {
  if (!activeWorktree) {
    return []
  }

  return collectWorkspaceScopePaths(activeWorktree, liveWorktrees).paths
}

type ScopePathAccumulator = {
  paths: string[]
  comparisonKeys: Set<string>
}

function collectWorkspaceScopePaths(
  activeWorktree: Pick<Worktree, 'id' | 'path' | 'priorWorktreeIds' | 'repoId'>,
  liveWorktrees: readonly Pick<Worktree, 'id' | 'path' | 'repoId'>[]
): ScopePathAccumulator {
  const accumulator: ScopePathAccumulator = { paths: [], comparisonKeys: new Set() }
  addAiVaultWorkspaceScopePath(accumulator, activeWorktree.path)
  const priorWorktreeIds = activeWorktree.priorWorktreeIds ?? []
  const claimedComparisonPaths =
    priorWorktreeIds.length > 0 ? buildClaimedComparisonPaths(liveWorktrees, activeWorktree) : null

  for (const priorWorktreeId of priorWorktreeIds) {
    const parsed = splitWorktreeIdForFilesystem(priorWorktreeId)
    if (!parsed || parsed.repoId !== activeWorktree.repoId) {
      continue
    }
    if (isAiVaultWorkspaceScopePathClaimed(parsed.worktreePath, claimedComparisonPaths)) {
      continue
    }
    addAiVaultWorkspaceScopePath(accumulator, parsed.worktreePath)
  }

  return accumulator
}

/**
 * Paths sent to the scanner so a scoped panel view surfaces its own sessions
 * even when they are older than the global recency cap. Covers the active
 * workspace plus the active project's other worktrees (same repo), so both the
 * Workspace and Project scopes stay complete.
 */
export function deriveAiVaultScopeSessionPaths(
  activeWorktree: Pick<
    Worktree,
    'id' | 'path' | 'priorWorktreeIds' | 'projectId' | 'repoId'
  > | null,
  liveWorktrees: readonly Pick<Worktree, 'id' | 'path' | 'projectId' | 'repoId'>[] = [],
  options: {
    activeProjectKey?: string | null
    projectHostSetupProjection?: ProjectHostSetupProjection
  } = {}
): string[] {
  if (!activeWorktree) {
    return []
  }
  const accumulator = collectWorkspaceScopePaths(activeWorktree, liveWorktrees)
  const setupsByRepoId = buildProjectSetupsByRepoId(options.projectHostSetupProjection)
  for (const worktree of liveWorktrees) {
    if (
      worktree.repoId === activeWorktree.repoId ||
      worktreeProjectKey(worktree) === options.activeProjectKey ||
      (setupsByRepoId.get(worktree.repoId) ?? []).some(
        (setup) => worktreeProjectKey(setup, setup) === options.activeProjectKey
      )
    ) {
      addAiVaultWorkspaceScopePath(accumulator, worktree.path)
    }
  }
  for (const setup of options.projectHostSetupProjection?.setups ?? []) {
    if (worktreeProjectKey(setup, setup) === options.activeProjectKey) {
      addAiVaultWorkspaceScopePath(accumulator, setup.path)
    }
  }
  return accumulator.paths
}

function buildProjectSetupsByRepoId(
  projection?: ProjectHostSetupProjection
): Map<string, ProjectHostSetupProjection['setups']> {
  const setupsByRepoId = new Map<string, ProjectHostSetupProjection['setups']>()
  for (const setup of projection?.setups ?? []) {
    const setups = setupsByRepoId.get(setup.repoId) ?? []
    setups.push(setup)
    setupsByRepoId.set(setup.repoId, setups)
  }
  return setupsByRepoId
}

function worktreeProjectKey(
  entry: Pick<Worktree, 'projectId' | 'repoId'> | { projectId?: string | null; repoId?: string },
  setup?: { projectId?: string | null; repoId?: string }
): string | null {
  const projectId = entry.projectId ?? setup?.projectId ?? null
  if (projectId) {
    return projectId.startsWith('repo:') ? projectId : `project:${projectId}`
  }
  return entry.repoId ? `repo:${entry.repoId}` : null
}

function addAiVaultWorkspaceScopePath(accumulator: ScopePathAccumulator, pathValue: string): void {
  const trimmedPath = pathValue.trim()
  if (!trimmedPath || !isRuntimePathAbsolute(trimmedPath)) {
    return
  }
  const comparisonPath = normalizeRuntimePathForComparison(trimmedPath)
  if (accumulator.comparisonKeys.has(comparisonPath)) {
    return
  }
  accumulator.comparisonKeys.add(comparisonPath)
  accumulator.paths.push(trimmedPath)
}

function buildClaimedComparisonPaths(
  liveWorktrees: readonly Pick<Worktree, 'id' | 'path'>[],
  activeWorktree: Pick<Worktree, 'id'>
): Set<string> {
  const claimedPaths = new Set<string>()
  for (const worktree of liveWorktrees) {
    if (worktree.id === activeWorktree.id) {
      continue
    }
    const trimmedPath = worktree.path.trim()
    if (!trimmedPath || !isRuntimePathAbsolute(trimmedPath)) {
      continue
    }
    claimedPaths.add(normalizeRuntimePathForComparison(trimmedPath))
  }
  return claimedPaths
}

function isAiVaultWorkspaceScopePathClaimed(
  pathValue: string,
  claimedComparisonPaths: Set<string> | null
): boolean {
  const trimmedPath = pathValue.trim()
  if (!trimmedPath || !isRuntimePathAbsolute(trimmedPath) || !claimedComparisonPaths) {
    return false
  }
  return claimedComparisonPaths.has(normalizeRuntimePathForComparison(trimmedPath))
}

// Why: the daemon rejects more than 64 scope paths; keep the caller-prioritized
// prefix while leaving the full scope available for local filtering.
export function limitAiVaultScopePaths(paths: readonly string[] | undefined): string[] | undefined {
  return paths?.slice(0, 64)
}

import type { Repo } from '@yiru/protocol/project/repository'
import type { Worktree } from '@yiru/protocol/worktree/model'
import { useProjectCatalog } from '~renderer/project-catalog/provider'
import { projectCatalogRepoKey } from '~renderer/project-catalog/query'

import {
  getIndexedAllWorktrees as getCachedAllWorktrees,
  getIndexedRepoMap as getCachedRepoMap,
  getIndexedWorktreeMap as getCachedWorktreeMap
} from '../worktree/repo-index'
import { useAppStore } from './state'
import type { AppState } from './types'

export { getProjectHostSetupProjectionFromState } from '../project-catalog/host-setup-selector'

const EMPTY_WORKTREES: Worktree[] = []
const hasAnyWorktreesCache = new WeakMap<AppState['worktreesByRepo'], boolean>()
const catalogWorktreeMapCache = new WeakMap<Worktree[], Map<string, Worktree>>()

function getCachedHasAnyWorktrees(worktreesByRepo: AppState['worktreesByRepo']): boolean {
  const cached = hasAnyWorktreesCache.get(worktreesByRepo)
  if (cached !== undefined) {
    return cached
  }

  // Why: this selector sits in an always-mounted scanner. Cache by slice
  // identity so unrelated store writes do not rescan every repo bucket.
  const hasWorktrees = Object.values(worktreesByRepo).some((worktrees) => worktrees.length > 0)
  hasAnyWorktreesCache.set(worktreesByRepo, hasWorktrees)
  return hasWorktrees
}

function getCachedCatalogWorktreeMap(allWorktrees: Worktree[]): Map<string, Worktree> {
  const cached = catalogWorktreeMapCache.get(allWorktrees)
  if (cached) {
    return cached
  }
  const worktreeMap = new Map(allWorktrees.map((worktree) => [worktree.id, worktree]))
  catalogWorktreeMapCache.set(allWorktrees, worktreeMap)
  return worktreeMap
}

export function getAllWorktreesFromState(state: Pick<AppState, 'worktreesByRepo'>): Worktree[] {
  return getCachedAllWorktrees(state.worktreesByRepo)
}

export function getWorktreeMapFromState(
  state: Pick<AppState, 'worktreesByRepo'>
): Map<string, Worktree> {
  return getCachedWorktreeMap(state.worktreesByRepo)
}

export function getHasAnyWorktreesFromState(state: Pick<AppState, 'worktreesByRepo'>): boolean {
  return getCachedHasAnyWorktrees(state.worktreesByRepo)
}

export function getRepoMapFromState(state: Pick<AppState, 'repos'>): Map<string, Repo> {
  return getCachedRepoMap(state.repos)
}

// ─── Repos ──────────────────────────────────────────────────────────
export const useRepos = (): Repo[] => useProjectCatalog().repos
export const useActiveRepo = (): Repo | null => {
  const activeRepoId = useAppStore((state) => state.activeRepoId)
  return useProjectCatalog().repos.find((repo) => repo.id === activeRepoId) ?? null
}
export const useRepoMap = (): Map<string, Repo> => getCachedRepoMap(useProjectCatalog().repos)
export const useRepoById = (repoId: string | null): Repo | null => {
  const repoMap = useRepoMap()
  return repoId ? (repoMap.get(repoId) ?? null) : null
}
export const useProjectHostSetupProjection = () => {
  const { projects, projectHostSetups: setups } = useProjectCatalog()
  return { projects, setups }
}

// ─── Worktrees ──────────────────────────────────────────────────────
export const useActiveWorktreeId = () => useAppStore((s) => s.activeWorktreeId)
export const useWorktreesForRepo = (repoId: string | null): Worktree[] => {
  const catalog = useProjectCatalog()
  if (!repoId) {
    return EMPTY_WORKTREES
  }
  return catalog.repos
    .filter((repo) => repo.id === repoId)
    .flatMap((repo) => catalog.worktreesByRepo[projectCatalogRepoKey(repo)] ?? EMPTY_WORKTREES)
}
export const useAllWorktrees = (): Worktree[] => useProjectCatalog().allWorktrees
export const useWorktreeMap = (): Map<string, Worktree> =>
  getCachedCatalogWorktreeMap(useProjectCatalog().allWorktrees)
export const useWorktreeById = (worktreeId: string | null): Worktree | null => {
  const worktreeMap = useWorktreeMap()
  return worktreeId ? (worktreeMap.get(worktreeId) ?? null) : null
}
export const useActiveWorktree = (): Worktree | null => {
  const activeWorktreeId = useActiveWorktreeId()
  const worktreeMap = useWorktreeMap()
  return activeWorktreeId ? (worktreeMap.get(activeWorktreeId) ?? null) : null
}

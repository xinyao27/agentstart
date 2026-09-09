import {
  isRuntimePathAbsolute,
  isWindowsAbsolutePathLike,
  normalizeRuntimePathForComparison,
  normalizeRuntimePathSeparators,
  relativePathInsideRoot,
  resolveRuntimePath
} from '../../host/path.js'
import { parseWslUncPath } from '../../host/wsl-paths.js'
import type { ExternalWorktreeVisibility } from '../../project/model.js'
import type { Repo } from '../../project/repository.js'
import type { YiruWorkspaceLayout } from '../../workspace/layout.js'
import type { WorkspaceLayoutSettings } from '../../workspace/layout.js'
import type { DetectedWorktree, Worktree, WorktreeMeta, WorktreeOwnership } from '../model.js'
import { isExplicitlyImportedExternalWorktreePath } from './paths.js'

export const EXTERNAL_WORKTREE_VISIBILITY_ROLLOUT_AT = Date.UTC(2026, 4, 23)

export function isLegacyRepoForExternalWorktreeVisibility(repo: Repo): boolean {
  if (typeof repo.externalWorktreeVisibilityLegacy === 'boolean') {
    return repo.externalWorktreeVisibilityLegacy
  }
  if (repo.externalWorktreeVisibility === undefined) {
    return true
  }
  if (!Number.isFinite(repo.addedAt)) {
    return true
  }
  return repo.addedAt < EXTERNAL_WORKTREE_VISIBILITY_ROLLOUT_AT
}

export function effectiveExternalWorktreeVisibility(
  repo: Pick<Repo, 'externalWorktreeVisibility'>,
  isLegacyRepoForVisibility: boolean
): ExternalWorktreeVisibility {
  if (repo.externalWorktreeVisibility) {
    return repo.externalWorktreeVisibility
  }
  return isLegacyRepoForVisibility ? 'show' : 'hide'
}

export function buildKnownYiruWorkspaceLayouts(
  settings: Pick<
    WorkspaceLayoutSettings,
    'workspaceDir' | 'nestWorkspaces' | 'workspaceDirHistory'
  >,
  repo?: Pick<Repo, 'path' | 'connectionId' | 'worktreeBasePath'>
): YiruWorkspaceLayout[] {
  const layouts: YiruWorkspaceLayout[] = []
  const repoBasePath = getRepoWorktreeBasePath(repo)
  if (repo && repoBasePath) {
    layouts.push({
      path: resolveWorkspaceLayoutPath(repo.path, repoBasePath),
      nestWorkspaces: settings.nestWorkspaces
    })
  }
  if (settings.workspaceDir && shouldIncludeWorkspaceLayout(repo, settings.workspaceDir)) {
    layouts.push({
      path: repo
        ? resolveWorkspaceLayoutPath(repo.path, settings.workspaceDir)
        : settings.workspaceDir,
      nestWorkspaces: settings.nestWorkspaces
    })
    appendWorkspaceLayouts(
      layouts,
      (settings.workspaceDirHistory ?? [])
        .filter((layout) => shouldIncludeWorkspaceLayout(repo, layout.path))
        .map((layout) => ({
          ...layout,
          path: repo ? resolveWorkspaceLayoutPath(repo.path, layout.path) : layout.path
        }))
    )
  }

  const wslLayouts = repo ? buildWslWorkspaceLayouts(repo.path, settings) : []
  appendWorkspaceLayouts(layouts, wslLayouts)

  const seen = new Set<string>()
  return layouts.filter((layout) => {
    const key = `${normalizeRuntimePathForComparison(layout.path)}:${layout.nestWorkspaces}`
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return Boolean(layout.path)
  })
}

function appendWorkspaceLayouts(
  target: YiruWorkspaceLayout[],
  source: readonly YiruWorkspaceLayout[]
): void {
  // Why: workspace history is persisted user data and can grow large enough
  // for `push(...source)` to exceed the JavaScript call argument limit.
  for (const layout of source) {
    target.push(layout)
  }
}

function getRepoWorktreeBasePath(
  repo: Pick<Repo, 'worktreeBasePath'> | undefined
): string | undefined {
  const trimmed = repo?.worktreeBasePath?.trim()
  return trimmed || undefined
}

function resolveWorkspaceLayoutPath(repoPath: string, layoutPath: string): string {
  return isRuntimePathAbsoluteForRepo(repoPath, layoutPath)
    ? normalizeRuntimePathSeparators(layoutPath)
    : resolveRuntimePath(repoPath, layoutPath)
}

function isRuntimePathAbsoluteForRepo(repoPath: string, layoutPath: string): boolean {
  const pathFlavor =
    isWindowsAbsolutePathLike(repoPath) || isWindowsAbsolutePathLike(layoutPath)
      ? 'windows'
      : 'posix'
  return isRuntimePathAbsolute(layoutPath, pathFlavor)
}

function shouldIncludeWorkspaceLayout(
  repo: Pick<Repo, 'path' | 'connectionId'> | undefined,
  layoutPath: string
): boolean {
  return !repo?.connectionId || !isRuntimePathAbsoluteForRepo(repo.path, layoutPath)
}

function buildWslWorkspaceLayouts(
  repoPath: string,
  settings: Pick<WorkspaceLayoutSettings, 'nestWorkspaces' | 'workspaceDirHistory'>
): YiruWorkspaceLayout[] {
  const parsed = parseWslUncPath(repoPath)
  if (!parsed) {
    return []
  }
  const homeMatch = parsed.linuxPath.match(/^\/home\/[^/]+(?:\/|$)/)
  const linuxHome = homeMatch?.[0].replace(/\/$/, '')
  if (!linuxHome) {
    return []
  }
  const root = `//wsl.localhost/${parsed.distro}${linuxHome}/yiru/workspaces`
  const historicalModes = (settings.workspaceDirHistory ?? []).map(
    (layout) => layout.nestWorkspaces
  )
  const modes = [settings.nestWorkspaces, ...historicalModes]
  return [...new Set(modes)].map((nestWorkspaces) => ({ path: root, nestWorkspaces }))
}

export function classifyWorktreeOwnership(args: {
  repo: Repo
  worktree: Pick<Worktree, 'path' | 'isMainWorktree'>
  meta?: WorktreeMeta
  settings: Pick<WorkspaceLayoutSettings, 'workspaceDir' | 'nestWorkspaces' | 'workspaceDirHistory'>
  knownYiruLayouts: YiruWorkspaceLayout[]
}): WorktreeOwnership {
  if (hasStrongYiruMetadata(args.meta)) {
    return 'yiru-managed'
  }

  if (isUnderFlatOrUntrustedYiruRoot(args.worktree.path, args.knownYiruLayouts)) {
    return 'unknown-legacy'
  }

  if (canClassifyAsExternal(args.worktree.path, args.knownYiruLayouts)) {
    // Why: a plain `git worktree add` can target Yiru's nested workspace
    // folder. Only metadata proves Yiru created it.
    return 'external'
  }

  return 'unknown-legacy'
}

export function toDetectedWorktree(args: {
  repo: Repo
  worktree: Worktree
  meta?: WorktreeMeta
  settings: Pick<WorkspaceLayoutSettings, 'workspaceDir' | 'nestWorkspaces' | 'workspaceDirHistory'>
  knownYiruLayouts: YiruWorkspaceLayout[]
  isLegacyRepoForVisibility?: boolean
}): DetectedWorktree {
  const ownership = classifyWorktreeOwnership(args)
  const selectedCheckout = areRuntimePathsEqual(args.worktree.path, args.repo.path)
  const isLegacyRepoForVisibility =
    args.isLegacyRepoForVisibility ?? isLegacyRepoForExternalWorktreeVisibility(args.repo)
  const visible = shouldShowWorktree({
    worktree: args.worktree,
    ownership,
    repo: args.repo,
    isLegacyRepoForVisibility,
    isSelectedCheckout: selectedCheckout,
    importedExternalWorktreePaths: args.repo.importedExternalWorktreePaths
  })

  return {
    ...args.worktree,
    ownership,
    selectedCheckout,
    visible
  }
}

export function shouldShowWorktree(args: {
  worktree: Pick<Worktree, 'path'>
  ownership: WorktreeOwnership
  repo: Repo
  isLegacyRepoForVisibility: boolean
  isSelectedCheckout: boolean
  importedExternalWorktreePaths?: readonly string[] | undefined
}): boolean {
  if (args.isSelectedCheckout) {
    return true
  }
  if (args.ownership === 'yiru-managed') {
    return true
  }
  if (
    isExplicitlyImportedExternalWorktreePath(args.worktree.path, {
      importedExternalWorktreePaths: args.importedExternalWorktreePaths
    })
  ) {
    return true
  }
  if (args.ownership === 'unknown-legacy' && args.isLegacyRepoForVisibility) {
    return true
  }
  return effectiveExternalWorktreeVisibility(args.repo, args.isLegacyRepoForVisibility) === 'show'
}

export function areRuntimePathsEqual(leftPath: string, rightPath: string): boolean {
  return (
    normalizeRuntimePathForComparison(leftPath) === normalizeRuntimePathForComparison(rightPath)
  )
}

function hasStrongYiruMetadata(meta: WorktreeMeta | undefined): boolean {
  return Boolean(
    meta?.yiruCreatedAt ||
    meta?.yiruCreationWorkspaceLayout ||
    meta?.createdAt ||
    meta?.createdWithAgent ||
    meta?.pushTarget ||
    meta?.sparseBaseRef ||
    meta?.sparsePresetId ||
    meta?.preserveBranchOnDelete
  )
}

function isUnderFlatOrUntrustedYiruRoot(
  worktreePath: string,
  knownYiruLayouts: YiruWorkspaceLayout[]
): boolean {
  for (const layout of knownYiruLayouts) {
    const relative = relativePathInsideRoot(layout.path, worktreePath)
    if (relative === null) {
      continue
    }
    if (!layout.nestWorkspaces) {
      return true
    }
  }
  return false
}

function canClassifyAsExternal(
  worktreePath: string,
  knownYiruLayouts: YiruWorkspaceLayout[]
): boolean {
  if (knownYiruLayouts.length === 0) {
    return false
  }
  for (const layout of knownYiruLayouts) {
    const relative = relativePathInsideRoot(layout.path, worktreePath)
    if (relative === null) {
      continue
    }
    return layout.nestWorkspaces
  }
  return true
}

import { useAppStore } from '~renderer/store/state'

import { buildIgnoredSet, isPathIgnored } from '../status-display'
import { isDotfileRelativePath } from './entries'
import {
  createNameFilteredFileExplorerProjection,
  getFileExplorerNameFilterExpandedPaths,
  getFileExplorerNameFilterIgnoredQueryRelativePaths,
  type FileExplorerNameFilterProjectionSource
} from './name-filter-projection'
import {
  createFileExplorerRowProjectionFromParts,
  type FileExplorerRowProjection
} from './row-projection'
import type { DirCache, TreeNode } from './types'
import { useFileExplorerIgnoredPaths } from './use-ignored-paths'

const EMPTY_RELATIVE_PATHS: string[] = []

type VisibleFileExplorerRowProjectionOptions = {
  ignoredSet: Set<string>
  nameFilter?: FileExplorerNameFilterProjectionSource | null
  nameFilterCollapsedPaths?: ReadonlySet<string> | null
  showDotfiles: boolean
  showGitIgnoredFiles: boolean
}

type VisibleFileExplorerRowProjectionInput = {
  dirCache: Record<string, DirCache>
  expanded: Set<string>
  worktreePath: string | null
}

function getFileExplorerIgnoredQueryRelativePaths(
  input: VisibleFileExplorerRowProjectionInput,
  showDotfiles: boolean
): string[] {
  const { dirCache, expanded, worktreePath } = input
  if (!worktreePath) {
    return []
  }

  const relativePaths: string[] = []
  const visitChildren = (parentPath: string): void => {
    const cached = dirCache[parentPath]
    if (!cached?.children) {
      return
    }
    for (const row of cached.children) {
      if (!showDotfiles && isDotfileRelativePath(row.relativePath)) {
        continue
      }
      relativePaths.push(row.relativePath)
      if (row.isDirectory && expanded.has(row.path)) {
        visitChildren(row.path)
      }
    }
  }
  visitChildren(worktreePath)
  return relativePaths
}

function createVisibleFileExplorerRowProjection(
  input: VisibleFileExplorerRowProjectionInput,
  options: VisibleFileExplorerRowProjectionOptions
): FileExplorerRowProjection {
  const { dirCache, expanded, worktreePath } = input
  const visibleFlatRows: TreeNode[] = []
  const rowsByPath = new Map<string, TreeNode>()
  if (!worktreePath) {
    return createFileExplorerRowProjectionFromParts(visibleFlatRows, rowsByPath)
  }
  if (options.nameFilter) {
    return createNameFilteredFileExplorerProjection({
      collapsedPaths: options.nameFilterCollapsedPaths ?? undefined,
      ignoredSet: options.ignoredSet,
      nameFilter: options.nameFilter,
      showDotfiles: options.showDotfiles,
      showGitIgnoredFiles: options.showGitIgnoredFiles,
      worktreePath
    })
  }

  const shouldHideRow = (row: TreeNode): boolean => {
    if (!options.showDotfiles && isDotfileRelativePath(row.relativePath)) {
      return true
    }
    return !options.showGitIgnoredFiles && isPathIgnored(options.ignoredSet, row.relativePath)
  }

  const visitChildren = (parentPath: string): void => {
    const cached = dirCache[parentPath]
    if (!cached?.children) {
      return
    }
    for (const row of cached.children) {
      if (shouldHideRow(row)) {
        continue
      }
      visibleFlatRows.push(row)
      rowsByPath.set(row.path, row)
      if (row.isDirectory && expanded.has(row.path)) {
        visitChildren(row.path)
      }
    }
  }
  visitChildren(worktreePath)

  return createFileExplorerRowProjectionFromParts(visibleFlatRows, rowsByPath)
}

export function useFileExplorerVisibleRowProjection(
  activeWorktreeId: string | null,
  worktreePath: string | null,
  dirCache: Record<string, DirCache>,
  expanded: Set<string>,
  activeRepoSupportsGit: boolean,
  showDotfiles: boolean,
  nameFilter: FileExplorerNameFilterProjectionSource | null,
  nameFilterCollapsedPaths: ReadonlySet<string> | null = null
): {
  rowProjection: FileExplorerRowProjection
  ignoredByRelativePath: Set<string>
  showGitIgnoredFiles: boolean
  nameFilterExpandedPaths: Set<string>
  toggleGitIgnoredFiles: () => void
} {
  const settings = useAppStore((s) => s.settings)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const showGitIgnoredFiles = settings?.showGitIgnoredFiles ?? true
  const relativePaths = (() =>
    activeRepoSupportsGit
      ? nameFilter
        ? getFileExplorerNameFilterIgnoredQueryRelativePaths(nameFilter, showDotfiles)
        : getFileExplorerIgnoredQueryRelativePaths(
            { dirCache, expanded, worktreePath },
            showDotfiles
          )
      : EMPTY_RELATIVE_PATHS)()
  const canLoadIgnoredPaths =
    activeRepoSupportsGit &&
    Boolean(activeWorktreeId) &&
    Boolean(worktreePath) &&
    relativePaths.length > 0
  const shouldDebounceIgnoredQuery = nameFilter !== null
  const effectiveIgnoredPaths = useFileExplorerIgnoredPaths({
    activeWorktreeId,
    canLoadIgnoredPaths,
    relativePaths,
    shouldDebounceIgnoredQuery,
    worktreePath
  })
  const ignoredSet = (() => buildIgnoredSet(effectiveIgnoredPaths))()
  const rowProjection = (() =>
    createVisibleFileExplorerRowProjection(
      { dirCache, expanded, worktreePath },
      {
        ignoredSet,
        nameFilter,
        nameFilterCollapsedPaths,
        showDotfiles,
        showGitIgnoredFiles
      }
    ))()
  const nameFilterExpandedPaths = (() =>
    getFileExplorerNameFilterExpandedPaths(rowProjection, nameFilter?.query ?? ''))()
  const ignoredByRelativePath = (() => (showGitIgnoredFiles ? ignoredSet : new Set<string>()))()
  const toggleGitIgnoredFiles = () => {
    void updateSettings({ showGitIgnoredFiles: !showGitIgnoredFiles })
  }

  return {
    rowProjection,
    ignoredByRelativePath,
    showGitIgnoredFiles,
    nameFilterExpandedPaths,
    toggleGitIgnoredFiles
  }
}

import { isGitRepoKind } from '@agentstart/protocol/project/repository'
import type { RightSidebarExplorerView } from '@agentstart/protocol/settings/ui-state'
import { useState } from 'react'
import { basename } from '~renderer/path'
import { useRuntimeFileListForWorktree } from '~renderer/quick-open/file-list'
import { useActiveWorktree, useRepoById } from '~renderer/store/selectors'
import { useAppStore } from '~renderer/store/state'
import { getRuntimeEnvironmentIdForWorktree } from '~renderer/worktree/runtime-owner'

import { buildFolderStatusMap, buildStatusMap } from '../status-display'
import {
  getNameFilterCollapsedPathsAfterExpand,
  getNextNameFilterCollapsedPaths,
  isFileExplorerNameFilterQueryTooLarge
} from './name-filter-projection'
import { getVisibleFileExplorerWorktreePath } from './reset'
import { useFileSearchPanel } from './use-file-search-panel'
import { useFileExplorerManualRefresh } from './use-manual-refresh'
import { useFileExplorerTree } from './use-tree'
import { useFileExplorerVisibleRowProjection } from './use-visible-row-projection'

export function useFileExplorerModel({
  isVisible,
  workspacePanelTabId
}: {
  isVisible: boolean
  workspacePanelTabId?: string
}) {
  const explorerView = useAppStore((state) => state.rightSidebarExplorerView)
  const showRightSidebarFiles = useAppStore((state) => state.showRightSidebarFiles)
  const showRightSidebarSearch = useAppStore((state) => state.showRightSidebarSearch)
  const [nameFilterQuery, setNameFilterQuery] = useState('')
  const [nameFilterCollapsedPaths, setNameFilterCollapsedPaths] = useState<Set<string>>(
    () => new Set()
  )
  const searchPanel = useFileSearchPanel(explorerView, workspacePanelTabId)
  const handleSelectExplorerView = (view: RightSidebarExplorerView) => {
    if (view === 'files') {
      showRightSidebarFiles()
      return
    }
    const trimmedQuery = nameFilterQuery.trim()
    showRightSidebarSearch(trimmedQuery ? { query: trimmedQuery } : undefined)
  }
  const handleClearNameFilter = () => setNameFilterQuery('')

  const activeWorktreeId = useAppStore((state) => state.activeWorktreeId)
  const activeWorktree = useActiveWorktree()
  const activeRepo = useRepoById(activeWorktree?.repoId ?? null)
  const activeRuntimeEnvironmentId = useAppStore((state) =>
    getRuntimeEnvironmentIdForWorktree(state, activeWorktreeId)
  )
  const expandedDirs = useAppStore((state) => state.expandedDirs)
  const showDotfiles = useAppStore((state) =>
    activeWorktreeId ? (state.showDotfilesByWorktree[activeWorktreeId] ?? true) : true
  )
  const worktreePath = activeWorktree?.path ?? null
  // Why: Repo.connectionId is dead — nothing sets it since remote hosts were
  // removed (#63) — a direct repo/worktree owner is never SSH.
  const runtimeDownloadContext = (() =>
    activeRuntimeEnvironmentId && activeWorktreeId && worktreePath
      ? {
          settings: { activeRuntimeEnvironmentId },
          worktreeId: activeWorktreeId,
          worktreePath,
          connectionId: undefined
        }
      : null)()
  const isFilesViewActive = explorerView === 'files'
  const visibleFilesWorktreePath = getVisibleFileExplorerWorktreePath({
    explorerView,
    rightSidebarOpen: isVisible,
    worktreePath
  })
  const repoName = activeRepo?.displayName ?? (worktreePath ? basename(worktreePath) : '')
  const activeRepoSupportsGit = activeRepo ? isGitRepoKind(activeRepo) : false
  const expanded = (() =>
    activeWorktreeId ? (expandedDirs[activeWorktreeId] ?? new Set<string>()) : new Set<string>())()

  const treeState = useFileExplorerTree(worktreePath, expanded, activeWorktreeId)
  const hasNameFilterQuery = nameFilterQuery.trim().length > 0
  const nameFilterQueryTooLarge = (() => isFileExplorerNameFilterQueryTooLarge(nameFilterQuery))()
  const hasNameFilter = isFilesViewActive && hasNameFilterQuery
  const nameFilterFiles = useRuntimeFileListForWorktree({
    enabled: hasNameFilter && !nameFilterQueryTooLarge,
    worktreeId: activeWorktreeId
  })
  const nameFilterSource = (() =>
    hasNameFilter
      ? {
          query: nameFilterQuery,
          operationOwner: nameFilterFiles.operationOwner,
          relativePaths: nameFilterQueryTooLarge
            ? []
            : nameFilterFiles.loading && nameFilterFiles.files.length === 0
              ? null
              : nameFilterFiles.files
        }
      : null)()
  const projection = useFileExplorerVisibleRowProjection(
    activeWorktreeId,
    visibleFilesWorktreePath,
    treeState.dirCache,
    expanded,
    activeRepoSupportsGit && isFilesViewActive,
    showDotfiles,
    nameFilterSource,
    hasNameFilter ? nameFilterCollapsedPaths : null
  )
  const rowExpandedPaths = (() =>
    hasNameFilter
      ? projection.nameFilterExpandedPaths
      : projection.nameFilterExpandedPaths.size > 0
        ? new Set([...expanded, ...projection.nameFilterExpandedPaths])
        : expanded)()
  const manualRefresh = useFileExplorerManualRefresh(treeState.refreshTree)
  const gitStatusByWorktree = useAppStore((state) => state.gitStatusByWorktree)
  const entries = (() => (activeWorktreeId ? (gitStatusByWorktree[activeWorktreeId] ?? []) : []))()
  const statusByRelativePath = (() => buildStatusMap(entries))()
  const folderStatusByRelativePath = (() => buildFolderStatusMap(entries))()
  const handleToggleNameFilterDir = (_worktreeId: string, dirPath: string) => {
    setNameFilterCollapsedPaths((current) =>
      getNextNameFilterCollapsedPaths(current, dirPath, rowExpandedPaths.has(dirPath))
    )
  }
  const handleExpandNameFilterDir = (dirPath: string) => {
    setNameFilterCollapsedPaths((current) =>
      getNameFilterCollapsedPathsAfterExpand(current, dirPath)
    )
  }

  // Why: rebuild the file-list contract from the fields this feature owns so
  // the view does not depend on an unrelated hook's wrapper shape.
  const nameFilterFilesStable = (() => ({
    files: nameFilterFiles.files,
    loading: nameFilterFiles.loading,
    loadError: nameFilterFiles.loadError,
    operationOwner: nameFilterFiles.operationOwner
  }))()
  const view = (() => ({
    explorerView,
    isFilesViewActive,
    searchPanel,
    nameFilterQuery,
    setNameFilterQuery,
    handleClearNameFilter,
    handleSelectExplorerView,
    hasNameFilter,
    nameFilterFiles: nameFilterFilesStable,
    nameFilterSource
  }))()
  const owner = (() => ({
    activeWorktreeId,
    activeRepo,
    activeRuntimeEnvironmentId,
    worktreePath,
    visibleFilesWorktreePath,
    runtimeDownloadContext
  }))()
  // Why: expose only the tree capabilities consumed by the view.
  const tree = (() => ({
    dirCache: treeState.dirCache,
    setDirCache: treeState.setDirCache,
    rootCache: treeState.rootCache,
    rootError: treeState.rootError,
    loadDir: treeState.loadDir,
    statPath: treeState.statPath,
    markPathAsDirectory: treeState.markPathAsDirectory,
    refreshTree: treeState.refreshTree,
    refreshDir: treeState.refreshDir,
    resetAndLoad: treeState.resetAndLoad,
    expanded,
    rowExpandedPaths,
    rowProjection: projection.rowProjection,
    visibleRowCount: projection.rowProjection.getVisibleCount(),
    ignoredByRelativePath: projection.ignoredByRelativePath
  }))()
  // Why: same reasoning as `tree` above — useFileExplorerManualRefresh
  // returns a fresh wrapper each render around stable leaf values, so depend
  // on those leaves rather than on `manualRefresh` itself.
  const display = (() => ({
    repoName,
    activeRepoSupportsGit,
    showDotfiles,
    showGitIgnoredFiles: projection.showGitIgnoredFiles,
    manualRefresh: {
      isRefreshing: manualRefresh.isRefreshing,
      showRefreshSpinner: manualRefresh.showRefreshSpinner,
      handleRefresh: manualRefresh.handleRefresh
    },
    statusByRelativePath,
    folderStatusByRelativePath
  }))()
  const actions = (() => ({
    toggleGitIgnoredFiles: projection.toggleGitIgnoredFiles,
    handleToggleNameFilterDir,
    handleExpandNameFilterDir
  }))()

  // Why: the tree surface consumes one model contract rather than coupling to
  // the feature's individual state producers.
  return (() => ({ view, owner, tree, display, actions }))()
}

export type FileExplorerModel = ReturnType<typeof useFileExplorerModel>

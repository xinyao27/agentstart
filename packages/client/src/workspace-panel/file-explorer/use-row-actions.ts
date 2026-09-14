import type { BaseUIEvent } from '@base-ui/react/types'
import type React from 'react'
import { renameFileOnDisk } from '~renderer/editor/rename-file'
import { useAppStore } from '~renderer/store/state'
import { CLOSE_ALL_CONTEXT_MENUS_EVENT } from '~renderer/tab-bar/sortable-tab'
import { createNewTerminalTab } from '~renderer/terminal/tab-create'

import { useFileDuplicate } from '../use-file-duplicate'
import { buildAddProjectFromFolderModalData, canShowAddAsProjectAction } from './add-project-action'
import { folderRelativePathToIncludeGlob } from './file-search-include-pattern'
import type { FileExplorerModel } from './model'
import type { InlineInput } from './row'
import type { TreeNode } from './types'

type UseFileExplorerRowActionsParams = {
  activeWorktreeId: string | null
  activeRepo: FileExplorerModel['owner']['activeRepo']
  worktreePath: string | null
  explorerView: FileExplorerModel['view']['explorerView']
  hasNameFilter: boolean
  refreshDir: (dirPath: string) => Promise<void>
  selectedPaths: Set<string>
  selectedNodes: TreeNode[]
  requestDelete: (node: TreeNode) => void
  requestDeleteAll: (nodes: TreeNode[]) => void
  inlineInput: InlineInput | null
  startNew: (type: 'file' | 'folder', parentPath: string, depth: number) => void
}

export type FileExplorerRowActions = {
  handleContextMenuDelete: (node: TreeNode) => void
  handleDuplicate: (node: TreeNode) => void
  handleCollapseFolderSubtree: (node: TreeNode) => void
  handleFindInFolder: (node: TreeNode) => void
  handleAddFolderAsProject: (node: TreeNode) => void
  handleOpenInTerminal: (node: TreeNode) => void
  handlePierreRenameNode: (node: TreeNode, newName: string) => void
  handleCollapseAll: () => void
  handleToggleDotfiles: () => void
  handleBackgroundContextMenu: (event: BaseUIEvent<React.MouseEvent<HTMLDivElement>>) => void
  handleBackgroundDoubleClick: (event: React.MouseEvent<HTMLDivElement>) => void
}

// Why: split out of useFileExplorerInteractions to stay under the .tsx line
// budget — this is the self-contained "row/background context actions"
// concern (delete, duplicate, collapse, rename, open-in-terminal, background
// menu), distinct from tree state and selection that stay in the caller.
export function useFileExplorerRowActions({
  activeWorktreeId,
  activeRepo,
  worktreePath,
  explorerView,
  hasNameFilter,
  refreshDir,
  selectedPaths,
  selectedNodes,
  requestDelete,
  requestDeleteAll,
  inlineInput,
  startNew
}: UseFileExplorerRowActionsParams): FileExplorerRowActions {
  const collapseAllDirs = useAppStore((state) => state.collapseAllDirs)
  const collapseDirSubtree = useAppStore((state) => state.collapseDirSubtree)
  const openModal = useAppStore((state) => state.openModal)
  const showWorkspacePanelSearch = useAppStore((state) => state.showWorkspacePanelSearch)
  const toggleShowDotfilesForWorktree = useAppStore((state) => state.toggleShowDotfilesForWorktree)

  const handleContextMenuDelete = (node: TreeNode) => {
    if (selectedPaths.has(node.path) && selectedNodes.length > 1) {
      requestDeleteAll(selectedNodes)
    } else {
      requestDelete(node)
    }
  }
  const handleDuplicate = useFileDuplicate({ activeWorktreeId, worktreePath, refreshDir })
  const handleCollapseFolderSubtree = (node: TreeNode) => {
    if (activeWorktreeId && node.isDirectory) {
      collapseDirSubtree(activeWorktreeId, node.path)
    }
  }
  const handleFindInFolder = (node: TreeNode) => {
    if (activeWorktreeId && node.isDirectory) {
      showWorkspacePanelSearch({
        includePattern: folderRelativePathToIncludeGlob(node.relativePath)
      })
    }
  }
  const handleAddFolderAsProject = (node: TreeNode) => {
    if (activeRepo && canShowAddAsProjectAction(node, activeRepo)) {
      openModal('confirm-add-project-from-folder', buildAddProjectFromFolderModalData(node))
    }
  }
  const handleOpenInTerminal = (node: TreeNode) => {
    if (activeWorktreeId && node.isDirectory) {
      createNewTerminalTab(activeWorktreeId, undefined, { startupCwd: node.path })
    }
  }
  const handlePierreRenameNode = (node: TreeNode, newName: string) => {
    if (activeWorktreeId && worktreePath) {
      void renameFileOnDisk({
        oldPath: node.path,
        newName,
        worktreeId: activeWorktreeId,
        worktreePath,
        refreshDir
      })
    }
  }
  const handleCollapseAll = () => {
    if (activeWorktreeId && explorerView === 'files' && !hasNameFilter) {
      collapseAllDirs(activeWorktreeId)
    }
  }
  const handleToggleDotfiles = () => {
    if (activeWorktreeId) {
      toggleShowDotfilesForWorktree(activeWorktreeId)
    }
  }
  const handleBackgroundContextMenu = (event: BaseUIEvent<React.MouseEvent<HTMLDivElement>>) => {
    const isTreeRow = event.nativeEvent
      .composedPath()
      .some((entry) => entry instanceof HTMLElement && entry.dataset.type === 'item')
    // Why: rows own their own context menu. Let Base UI's trigger handler run
    // only for clicks on the empty tree background.
    if (
      isTreeRow ||
      (event.target as HTMLElement).closest('[data-slot="context-menu-trigger"]') !==
        event.currentTarget
    ) {
      event.preventBaseUIHandler()
      return
    }
    window.dispatchEvent(new Event(CLOSE_ALL_CONTEXT_MENUS_EVENT))
  }
  const handleBackgroundDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!worktreePath || inlineInput) {
      return
    }
    const isTreeRow = event.nativeEvent
      .composedPath()
      .some((entry) => entry instanceof HTMLElement && entry.dataset.type === 'item')
    if (
      !(isTreeRow || (event.target as HTMLElement).closest('[data-slot="context-menu-trigger"]'))
    ) {
      startNew('file', worktreePath, 0)
    }
  }

  return (() => ({
    handleContextMenuDelete,
    handleDuplicate,
    handleCollapseFolderSubtree,
    handleFindInFolder,
    handleAddFolderAsProject,
    handleOpenInTerminal,
    handlePierreRenameNode,
    handleCollapseAll,
    handleToggleDotfiles,
    handleBackgroundContextMenu,
    handleBackgroundDoubleClick
  }))()
}

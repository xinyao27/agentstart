import { useState } from 'react'
import { useAppStore } from '~renderer/store/state'

import { useFileDeletion } from '../use-file-deletion'
import type { FileExplorerModel } from './model'
import type { PierreFileExplorerTreeHandle } from './pierre-file-explorer-tree'
import type { TreeNode } from './types'
import { useFileExplorerAutoReveal } from './use-auto-reveal'
import { useFileExplorerDragDrop } from './use-drag-drop'
import { useFileExplorerHandlers } from './use-handlers'
import { useFileExplorerInlineInput } from './use-inline-input'
import { useFileExplorerKeys } from './use-keys'
import { useFileExplorerOwnerRefresh } from './use-owner-refresh'
import { useFileExplorerReveal } from './use-reveal'
import { useFileExplorerRowActions } from './use-row-actions'
import { useFileExplorerSelection } from './use-selection'
import { useVisibleWorktreeReset } from './use-visible-worktree-reset'
import { useFileExplorerWatch } from './use-watch'

export function useFileExplorerInteractions(
  model: FileExplorerModel,
  elements: {
    explorerShellElement: HTMLDivElement | null
    pierreTree: PierreFileExplorerTreeHandle | null
    scrollElement: HTMLDivElement | null
  }
) {
  const { view, owner, tree, actions } = model
  const toggleDir = useAppStore((state) => state.toggleDir)
  const pendingExplorerReveal = useAppStore((state) => state.pendingExplorerReveal)
  const clearPendingExplorerReveal = useAppStore((state) => state.clearPendingExplorerReveal)
  const openFile = useAppStore((state) => state.openFile)
  const makePreviewFilePermanent = useAppStore((state) => state.makePreviewFilePermanent)
  const activeFileId = useAppStore((state) => state.activeFileId)
  const openFiles = useAppStore((state) => state.openFiles)
  const closeFile = useAppStore((state) => state.closeFile)

  const [flashingPath, setFlashingPath] = useState<string | null>(null)
  const [bgMenuOpen, setBgMenuOpen] = useState(false)
  const { explorerShellElement, pierreTree, scrollElement } = elements
  const isMac = (() => navigator.userAgent.includes('Mac'))()
  const isWindows = (() => navigator.userAgent.includes('Windows'))()
  const selection = useFileExplorerSelection(tree.rowProjection, isMac)
  const selectedNode = selection.selectedPath
    ? tree.rowProjection.getRowByPath(selection.selectedPath)
    : null
  const selectedNodes = (() => tree.rowProjection.getRowsByPaths(selection.selectedPaths))()
  const deletion = useFileDeletion({
    activeWorktreeId: owner.activeWorktreeId,
    openFiles,
    closeFile,
    refreshDir: tree.refreshDir,
    setSelectedPaths: selection.setSelectedPaths,
    isWindows
  })
  const dragDrop = useFileExplorerDragDrop({
    worktreePath: owner.worktreePath,
    activeWorktreeId: owner.activeWorktreeId,
    expanded: tree.expanded,
    toggleDir,
    refreshDir: tree.refreshDir,
    scrollElement
  })

  useVisibleWorktreeReset({
    visibleWorktreePath: owner.visibleFilesWorktreePath,
    resetSelection: selection.resetSelection,
    clearNameFilter: () => view.setNameFilterQuery(''),
    resetAndLoad: tree.resetAndLoad
  })
  useFileExplorerOwnerRefresh(model)

  const inline = useFileExplorerInlineInput({
    activeWorktreeId: owner.activeWorktreeId,
    worktreePath: owner.visibleFilesWorktreePath,
    expanded: tree.expanded,
    rowProjection: tree.rowProjection,
    scrollElement,
    refreshDir: tree.refreshDir
  })
  useFileExplorerWatch({
    worktreePath: owner.visibleFilesWorktreePath,
    activeWorktreeId: owner.activeWorktreeId,
    dirCache: tree.dirCache,
    setDirCache: tree.setDirCache,
    expanded: tree.expanded,
    setSelectedPath: selection.setSingleSelectedPath,
    refreshDir: tree.refreshDir,
    refreshTree: tree.refreshTree,
    inlineInput: inline.inlineInput,
    dragSourcePath: dragDrop.dragSourcePath
  })
  const explorerScrollController = (() => ({
    scrollToIndex: (index: number, options: { align: 'center' | 'auto' }) => {
      const node = tree.rowProjection.getRowAtIndex(index)
      if (node) {
        pierreTree?.scrollToAbsolutePath(
          node.path,
          options.align === 'center' ? 'center' : 'nearest'
        )
      }
    }
  }))()
  useFileExplorerReveal({
    isExplorerAttached: explorerShellElement !== null,
    activeWorktreeId: owner.activeWorktreeId,
    worktreePath: owner.visibleFilesWorktreePath,
    pendingExplorerReveal,
    clearPendingExplorerReveal,
    expanded: tree.expanded,
    dirCache: tree.dirCache,
    rootCache: tree.rootCache,
    rowProjection: tree.rowProjection,
    loadDir: tree.loadDir,
    setSelectedPath: selection.setSingleSelectedPath,
    setFlashingPath,
    virtualizer: explorerScrollController
  })
  useFileExplorerAutoReveal({
    activeFileId,
    activeWorktreeId: owner.activeWorktreeId,
    worktreePath: owner.visibleFilesWorktreePath,
    pendingExplorerReveal,
    openFiles,
    rowProjection: tree.rowProjection,
    setSelectedPath: selection.setSingleSelectedPath,
    virtualizer: explorerScrollController
  })

  const handlers = useFileExplorerHandlers({
    activeWorktreeId: owner.activeWorktreeId,
    runtimeEnvironmentId: owner.activeRuntimeEnvironmentId,
    openFile,
    makePreviewFilePermanent,
    toggleDir: view.hasNameFilter ? actions.handleToggleNameFilterDir : toggleDir,
    loadDir: tree.loadDir,
    statPath: tree.statPath,
    markPathAsDirectory: tree.markPathAsDirectory,
    setSelectedPath: selection.setSingleSelectedPath,
    scrollElement
  })
  const { handleClick } = handlers
  const activateNode = (node: TreeNode) => void handleClick(node)
  const scrollToIndex = (index: number) =>
    explorerScrollController.scrollToIndex(index, { align: 'auto' })
  useFileExplorerKeys({
    containerElement: explorerShellElement,
    rowProjection: tree.rowProjection,
    expandedPaths: tree.rowExpandedPaths,
    canToggleDirectories: true,
    inlineInput: inline.inlineInput,
    selectedPaths: selection.selectedPaths,
    selectedNode,
    activateNode,
    moveSelection: selection.moveSelection,
    toggleDir: view.hasNameFilter ? actions.handleToggleNameFilterDir : toggleDir,
    startRename: inline.startRename,
    requestDeleteAll: deletion.requestDeleteAll,
    refreshDir: tree.refreshDir,
    scrollToIndex,
    setSelectedPaths: selection.setSelectedPaths,
    activeWorktreeId: owner.activeWorktreeId,
    worktreePath: owner.visibleFilesWorktreePath,
    nativeTreeNavigation: true
  })

  // Why: delete/duplicate/collapse/rename/open-in-terminal/background-menu
  // actions live in a sibling hook (use-file-explorer-row-actions.ts) so this
  // file stays under the .tsx line budget; actionsGroup adds only `toggleDir`.
  const rowActions = useFileExplorerRowActions({
    activeWorktreeId: owner.activeWorktreeId,
    activeRepo: owner.activeRepo,
    worktreePath: owner.worktreePath,
    explorerView: view.explorerView,
    hasNameFilter: view.hasNameFilter,
    refreshDir: tree.refreshDir,
    selectedPaths: selection.selectedPaths,
    selectedNodes,
    requestDelete: deletion.requestDelete,
    requestDeleteAll: deletion.requestDeleteAll,
    inlineInput: inline.inlineInput,
    startNew: inline.startNew
  })

  // Why: expose only the selection capabilities the tree consumes instead of
  // leaking the selection hook's entire internal model.
  const selectionGroup = (() => ({
    selectedPath: selection.selectedPath,
    selectedPaths: selection.selectedPaths,
    setSingleSelectedPath: selection.setSingleSelectedPath,
    setSelectedPaths: selection.setSelectedPaths,
    resetSelection: selection.resetSelection,
    selectRowWithModifiers: selection.selectRowWithModifiers,
    moveSelection: selection.moveSelection,
    preserveSelectionForContextMenu: selection.preserveSelectionForContextMenu,
    copyPathsForNode: selection.copyPathsForNode,
    selectedNode
  }))()
  const menuGroup = (() => ({ bgMenuOpen, setBgMenuOpen }))()
  const displayGroup = (() => ({ flashingPath, activeFileId }))()
  const actionsGroup = (() => ({ ...rowActions, toggleDir }))()

  // Why: this is the component boundary contract; grouping the feature state
  // keeps the tree surface independent from the hooks that produce it.
  return (() => ({
    selection: selectionGroup,
    deletion,
    dragDrop,
    inline,
    handlers,
    menu: menuGroup,
    display: displayGroup,
    actions: actionsGroup
  }))()
}

export type FileExplorerInteractions = ReturnType<typeof useFileExplorerInteractions>

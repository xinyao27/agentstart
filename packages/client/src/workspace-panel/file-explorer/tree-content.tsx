import React from 'react'
import { translate } from '~renderer/i18n/i18n'
import { dirname, normalizeRelativePath } from '~renderer/path'
import { cn } from '~renderer/ui/class-names'
import { ContextMenuTrigger } from '~renderer/ui/context-menu'

import { SearchResultsPane } from '../search-results-pane'
import { shouldShowIgnoredDecoration, STATUS_COLORS } from '../status-display'
import { canShowAddAsProjectAction } from './add-project-action'
import type { FileExplorerInteractions } from './interactions'
import type { FileExplorerModel } from './model'
import {
  PierreFileExplorerTree,
  type PierreFileExplorerTreeHandle
} from './pierre-file-explorer-tree'
import { FileExplorerRow } from './row'
import { FileExplorerTreeStatus } from './tree-status'

type FileExplorerTreeContentProps = {
  model: FileExplorerModel
  interactions: FileExplorerInteractions
  setPierreTree: (tree: PierreFileExplorerTreeHandle | null) => void
  setScrollElement: (element: HTMLDivElement | null) => void
}

function FileExplorerTreeContent({
  model,
  interactions,
  setPierreTree,
  setScrollElement
}: FileExplorerTreeContentProps): React.JSX.Element {
  const { view, owner, tree, display, actions } = model
  const { selection, deletion, dragDrop, inline, handlers } = interactions
  const isEmptyState = tree.visibleRowCount === 0 && !inline.inlineInput
  const isNameFilterLoading = view.nameFilterSource?.relativePaths === null
  const isLoading =
    isEmptyState && (view.hasNameFilter ? isNameFilterLoading : (tree.rootCache?.loading ?? true))
  const treeError = view.hasNameFilter ? view.nameFilterFiles.loadError : tree.rootError
  const hasError = isEmptyState && !isLoading && Boolean(treeError)
  const showTree = !isEmptyState
  const emptyMessage =
    view.hasNameFilter && !view.nameFilterFiles.loadError
      ? translate(
          'auto.components.workspacePanel.FileExplorer.2f4483d6c4',
          'No files match this filter'
        )
      : undefined

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden">
      <ContextMenuTrigger
        onContextMenu={interactions.actions.handleBackgroundContextMenu}
        className={cn(
          'h-full min-h-0 bg-sidebar py-2',
          view.explorerView !== 'files' && 'pointer-events-none invisible',
          dragDrop.isRootDragOver &&
            view.explorerView === 'files' &&
            !(dragDrop.dragSourcePath && dirname(dragDrop.dragSourcePath) === owner.worktreePath) &&
            'bg-border'
        )}
        onDragOver={dragDrop.rootDragHandlers.onDragOver}
        onDragEnter={dragDrop.rootDragHandlers.onDragEnter}
        onDragLeave={dragDrop.rootDragHandlers.onDragLeave}
        onDrop={dragDrop.rootDragHandlers.onDrop}
        onDragEnd={() => {
          dragDrop.stopDragEdgeScroll()
          dragDrop.setDropTargetDir(null)
        }}
        onDoubleClick={interactions.actions.handleBackgroundDoubleClick}
      >
        {!showTree && (
          <FileExplorerTreeStatus
            isLoading={isLoading}
            error={hasError ? treeError : null}
            isEmpty={isEmptyState && !isLoading && !hasError}
            emptyMessage={emptyMessage}
          />
        )}
        {showTree && (
          <PierreFileExplorerTree
            ref={setPierreTree}
            worktreePath={owner.worktreePath!}
            rowProjection={tree.rowProjection}
            expandedPaths={tree.rowExpandedPaths}
            selectedPaths={selection.selectedPaths}
            flashingPath={interactions.display.flashingPath}
            inlineInput={inline.inlineInput}
            statusByRelativePath={display.statusByRelativePath}
            ignoredByRelativePath={tree.ignoredByRelativePath}
            onScrollElementChange={setScrollElement}
            onActivateFile={handlers.handleClick}
            onDoubleClickFile={handlers.handleDoubleClick}
            onToggleDirectory={(node) => {
              if (view.hasNameFilter) {
                actions.handleToggleNameFilterDir(owner.activeWorktreeId!, node.path)
              } else {
                interactions.actions.toggleDir(owner.activeWorktreeId!, node.path)
              }
              if (!tree.rowExpandedPaths.has(node.path)) {
                void tree.loadDir(node.path, node.depth)
              }
            }}
            onSelectionChange={selection.setSelectedPaths}
            onRenameNode={interactions.actions.handlePierreRenameNode}
            onInlineInputSubmit={inline.handleInlineSubmit}
            onInlineInputCancel={inline.dismissInlineInput}
            onMoveDrop={dragDrop.handleMoveDrop}
            onDragSourceChange={dragDrop.setDragSourcePath}
            renderContextMenu={(node, context, isExpanded) => {
              const normalizedRelativePath = normalizeRelativePath(node.relativePath)
              const nodeStatus = node.isDirectory
                ? (display.folderStatusByRelativePath.get(normalizedRelativePath) ?? null)
                : (display.statusByRelativePath.get(normalizedRelativePath) ?? null)
              const isIgnored = shouldShowIgnoredDecoration(
                nodeStatus,
                tree.ignoredByRelativePath,
                normalizedRelativePath
              )
              const rowParentDir = node.isDirectory ? node.path : dirname(node.path)
              return (
                <FileExplorerRow
                  node={node}
                  isExpanded={isExpanded}
                  isLoading={node.isDirectory && Boolean(tree.dirCache[node.path]?.loading)}
                  isSelected={
                    selection.selectedPaths.has(node.path) ||
                    interactions.display.activeFileId === node.path
                  }
                  isFlashing={interactions.display.flashingPath === node.path}
                  selectedPaths={selection.selectedPaths}
                  nodeStatus={nodeStatus}
                  statusColor={nodeStatus ? STATUS_COLORS[nodeStatus] : null}
                  isIgnored={isIgnored}
                  deleteShortcutLabel={deletion.deleteShortcutLabel}
                  // Why: Repo.connectionId is dead — nothing sets it since
                  // remote hosts were removed (#63) — a direct repo/worktree
                  // owner is never SSH.
                  connectionId={null}
                  runtimeDownloadContext={owner.runtimeDownloadContext}
                  canCollapseFolderSubtree={!view.hasNameFilter}
                  targetDir={node.isDirectory ? node.path : rowParentDir}
                  targetDepth={node.isDirectory ? node.depth + 1 : node.depth}
                  selectionSize={
                    selection.selectedPaths.has(node.path)
                      ? tree.rowProjection.countVisiblePaths(selection.selectedPaths)
                      : 1
                  }
                  onClick={() => undefined}
                  onDoubleClick={() => undefined}
                  onViewFile={() => handlers.handleClick(node)}
                  onContextMenuSelect={() => selection.preserveSelectionForContextMenu(node)}
                  onCopyPaths={(pathKind) => selection.copyPathsForNode(node, pathKind)}
                  onStartNew={inline.startNew}
                  onStartRename={inline.startRename}
                  onDuplicate={interactions.actions.handleDuplicate}
                  onAddFolderAsProject={() => interactions.actions.handleAddFolderAsProject(node)}
                  canAddAsProject={canShowAddAsProjectAction(node, owner.activeRepo)}
                  onOpenInTerminal={() => interactions.actions.handleOpenInTerminal(node)}
                  onRequestDelete={() => interactions.actions.handleContextMenuDelete(node)}
                  onCollapseFolderSubtree={() =>
                    interactions.actions.handleCollapseFolderSubtree(node)
                  }
                  onFindInFolder={() => interactions.actions.handleFindInFolder(node)}
                  onMoveDrop={dragDrop.handleMoveDrop}
                  onDragTargetChange={dragDrop.setDropTargetDir}
                  onDragSourceChange={dragDrop.setDragSourcePath}
                  onDragExpandDir={
                    view.hasNameFilter
                      ? actions.handleExpandNameFilterDir
                      : dragDrop.handleDragExpandDir
                  }
                  menuOnly
                  menuPoint={{ x: context.anchorRect.x, y: context.anchorRect.y }}
                  onMenuOpenChange={(open) => {
                    if (!open) {
                      context.close()
                    }
                  }}
                />
              )
            }}
          />
        )}
      </ContextMenuTrigger>
      <div
        className={cn(
          'absolute inset-0 flex min-h-0 flex-col',
          view.explorerView !== 'search' && 'pointer-events-none invisible'
        )}
      >
        {view.searchPanel.activeWorktreeId ? (
          <SearchResultsPane {...view.searchPanel.resultsProps} />
        ) : (
          <div className="text-muted-foreground flex h-full items-center justify-center text-xs">
            {translate(
              'auto.components.workspacePanel.Search.98c8435e36',
              'Select a workspace to search'
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// Why: useFileExplorerModel and useFileSearchPanel now both memoize their
// full return chain, so `model` itself is stable when nothing in it
// changed. `interactions` is still capped by three sibling hooks
// (dragDrop/inline/handlers in useFileExplorerInteractions) that return a
// fresh object literal every call — see the Why: comment on that hook's
// return for detail.
export const FileExplorerTreeContentMemo = FileExplorerTreeContent

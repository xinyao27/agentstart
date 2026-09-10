import type { GitFileStatus } from '@agentstart/protocol/git/status-types'
import { useEffect, useRef } from 'react'
import { useEventCallback } from '~renderer/react/use-event-callback'
import type { RuntimeFileOperationArgs } from '~renderer/runtime/file-client'
import { CLOSE_ALL_CONTEXT_MENUS_EVENT } from '~renderer/tab-bar/sortable-tab'
import { ContextMenu, ContextMenuTrigger } from '~renderer/ui/context-menu'
import {
  encodeWorkspaceFilePaths,
  WORKSPACE_FILE_PATH_MIME,
  WORKSPACE_FILE_PATHS_MIME
} from '~renderer/workspace/file-drag'

import type { InlineInput } from './inline-input-row'
import { copyFileToOsClipboard, downloadRemoteEntry } from './row-actions'
import { setMultiPathDragPreview } from './row-drag-preview'
import { FileExplorerRowMenu } from './row-menu'
import { FileExplorerTreeRowButton } from './tree-row-button'
import type { TreeNode } from './types'
import { useFileExplorerRowDrag } from './use-row-drag'

export { type InlineInput }
type FileExplorerRowProps = {
  node: TreeNode
  isExpanded: boolean
  isLoading: boolean
  isSelected: boolean
  isFlashing: boolean
  selectedPaths: Set<string>
  nodeStatus: GitFileStatus | null
  statusColor: string | null
  isIgnored: boolean
  deleteShortcutLabel: string
  connectionId?: string | null
  runtimeDownloadContext?: RuntimeFileOperationArgs | null
  canCollapseFolderSubtree: boolean
  targetDir: string
  targetDepth: number
  selectionSize: number
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void
  onDoubleClick: () => void
  onViewFile: () => void
  onContextMenuSelect: () => void
  onCopyPaths: (pathKind: 'absolute' | 'relative') => void
  onStartNew: (type: 'file' | 'folder', dir: string, depth: number) => void
  onStartRename: (node: TreeNode) => void
  onDuplicate: (node: TreeNode) => void
  onAddFolderAsProject: () => void
  canAddAsProject: boolean
  onOpenInTerminal: () => void
  onRequestDelete: () => void
  onCollapseFolderSubtree: () => void
  onFindInFolder: () => void
  onMoveDrop: (sourcePath: string, destDir: string) => void
  onDragTargetChange: (dir: string | null) => void
  onDragSourceChange: (path: string | null) => void
  onDragExpandDir: (dirPath: string) => void
  menuOnly?: boolean
  menuPoint?: { x: number; y: number }
  onMenuOpenChange?: (open: boolean) => void
}

export function FileExplorerRow({
  node,
  isExpanded,
  isLoading,
  isSelected,
  isFlashing,
  selectedPaths,
  nodeStatus,
  statusColor,
  isIgnored,
  deleteShortcutLabel,
  connectionId,
  runtimeDownloadContext,
  canCollapseFolderSubtree,
  targetDir,
  targetDepth,
  selectionSize,
  onClick,
  onDoubleClick,
  onViewFile,
  onContextMenuSelect,
  onCopyPaths,
  onStartNew,
  onStartRename,
  onDuplicate,
  onAddFolderAsProject,
  canAddAsProject,
  onOpenInTerminal,
  onRequestDelete,
  onCollapseFolderSubtree,
  onFindInFolder,
  onMoveDrop,
  onDragTargetChange,
  onDragSourceChange,
  onDragExpandDir,
  menuOnly = false,
  menuPoint,
  onMenuOpenChange
}: FileExplorerRowProps): React.JSX.Element {
  const rowDropDir = node.isDirectory ? node.path : targetDir
  const { setRowDragNode, handleDragOver, handleDragEnter, handleDragLeave, handleDrop } =
    useFileExplorerRowDrag({
      rowDropDir,
      isDirectory: node.isDirectory,
      nodePath: node.path,
      isExpanded,
      onDragTargetChange,
      onDragExpandDir,
      onMoveDrop
    })
  const handleDownload = () => {
    if (runtimeDownloadContext) {
      void downloadRemoteEntry(node, runtimeDownloadContext)
    }
  }
  const handleCopyFile = () => {
    void copyFileToOsClipboard(node)
  }

  const menuTriggerRef = useRef<HTMLDivElement | null>(null)
  const selectContextMenu = useEventCallback(onContextMenuSelect)
  const menuPointX = menuPoint?.x
  const menuPointY = menuPoint?.y

  useEffect(() => {
    if (
      !menuOnly ||
      menuPointX === undefined ||
      menuPointY === undefined ||
      !menuTriggerRef.current
    ) {
      return
    }
    // Why: Pierre owns selection, but the React menu owns the anchored overlay.
    window.dispatchEvent(new Event(CLOSE_ALL_CONTEXT_MENUS_EVENT))
    selectContextMenu()
    menuTriggerRef.current.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        button: 2,
        buttons: 2,
        cancelable: true,
        clientX: menuPointX,
        clientY: menuPointY,
        view: window
      })
    )
  }, [menuOnly, menuPointX, menuPointY, selectContextMenu])

  const handleDragStart = (event: React.DragEvent<HTMLButtonElement>): void => {
    const paths =
      selectedPaths.has(node.path) && selectedPaths.size > 1 ? [...selectedPaths] : [node.path]
    event.dataTransfer.setData(WORKSPACE_FILE_PATH_MIME, node.path)
    if (paths.length > 1) {
      event.dataTransfer.setData(WORKSPACE_FILE_PATHS_MIME, encodeWorkspaceFilePaths(paths))
    }
    event.dataTransfer.effectAllowed = 'copyMove'
    onDragSourceChange(node.path)
    setMultiPathDragPreview(event, paths)
  }

  return (
    <ContextMenu
      onOpenChange={(open) => {
        onMenuOpenChange?.(open)
        if (!open || menuOnly) {
          return
        }
        window.dispatchEvent(new Event(CLOSE_ALL_CONTEXT_MENUS_EVENT))
        onContextMenuSelect()
      }}
    >
      <ContextMenuTrigger
        render={
          menuOnly ? (
            <div ref={menuTriggerRef} data-file-tree-context-menu-root="true" className="size-px" />
          ) : (
            <FileExplorerTreeRowButton
              node={node}
              isExpanded={isExpanded}
              isLoading={isLoading}
              isSelected={isSelected}
              isFlashing={isFlashing}
              nodeStatus={nodeStatus}
              statusColor={statusColor}
              isIgnored={isIgnored}
              buttonRef={setRowDragNode}
              data-explorer-draggable="true"
              draggable
              onDragStart={handleDragStart}
              onDragEnd={() => onDragSourceChange(null)}
              onDragOver={handleDragOver}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={onClick}
              onDoubleClick={onDoubleClick}
              onLabelDoubleClick={(event) => {
                // Why: directory toggle and preview pinning own the rest of the row.
                event.stopPropagation()
                onStartRename(node)
              }}
            />
          )
        }
      />
      <FileExplorerRowMenu
        node={node}
        isExpanded={isExpanded}
        selectionSize={selectionSize}
        deleteShortcutLabel={deleteShortcutLabel}
        connectionId={connectionId}
        runtimeDownloadContext={runtimeDownloadContext}
        canCollapseFolderSubtree={canCollapseFolderSubtree}
        canAddAsProject={canAddAsProject}
        targetDir={targetDir}
        targetDepth={targetDepth}
        onCopyFile={handleCopyFile}
        onCopyPaths={onCopyPaths}
        onDownload={handleDownload}
        onStartNew={onStartNew}
        onStartRename={onStartRename}
        onDuplicate={onDuplicate}
        onAddFolderAsProject={onAddFolderAsProject}
        onOpenInTerminal={onOpenInTerminal}
        onViewFile={onViewFile}
        onCollapseFolderSubtree={onCollapseFolderSubtree}
        onFindInFolder={onFindInFolder}
        onRequestDelete={onRequestDelete}
      />
    </ContextMenu>
  )
}

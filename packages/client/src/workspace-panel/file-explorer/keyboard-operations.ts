import { keybindingMatchesAction, type KeybindingOverrides } from '@yiru/protocol/keybindings'
import { shellClient } from '~renderer/runtime/shell-client'

import { pasteFileExplorerClipboard, setFileExplorerClipboard } from './clipboard'
import type { FileExplorerRowProjection } from './row-projection'
import { formatFileExplorerPathsForClipboard } from './selection'
import type { TreeNode } from './types'

export function handleFileExplorerOperationShortcut(args: {
  activeWorktreeId: string | null
  destinationNode: TreeNode | null
  event: KeyboardEvent
  keybindings: KeybindingOverrides
  platform: NodeJS.Platform
  refreshDir: (dirPath: string) => Promise<void>
  rowProjection: FileExplorerRowProjection
  selectedNodes: TreeNode[]
  setSelectedPaths: (paths: Set<string>) => void
  worktreePath: string | null
}): boolean {
  const { event, keybindings, platform, selectedNodes } = args
  const matches = (
    action:
      | 'fileExplorer.copy'
      | 'fileExplorer.copyPath'
      | 'fileExplorer.copyRelativePath'
      | 'fileExplorer.cut'
      | 'fileExplorer.paste'
      | 'fileExplorer.selectAll'
  ): boolean => keybindingMatchesAction(action, event, platform, keybindings)

  if (matches('fileExplorer.selectAll')) {
    event.preventDefault()
    args.setSelectedPaths(new Set(args.rowProjection.getOrderedPaths()))
    return true
  }
  if (matches('fileExplorer.paste')) {
    event.preventDefault()
    pasteFileExplorerClipboard({
      activeWorktreeId: args.activeWorktreeId,
      destinationNode: args.destinationNode,
      refreshDir: args.refreshDir,
      setSelectedPaths: args.setSelectedPaths,
      worktreePath: args.worktreePath
    })
    return true
  }
  if (selectedNodes.length === 0) {
    return false
  }
  if (matches('fileExplorer.copy')) {
    event.preventDefault()
    setFileExplorerClipboard('copy', selectedNodes, args.activeWorktreeId, args.worktreePath)
    return true
  }
  if (matches('fileExplorer.cut')) {
    event.preventDefault()
    setFileExplorerClipboard('cut', selectedNodes, args.activeWorktreeId, args.worktreePath)
    return true
  }
  if (matches('fileExplorer.copyRelativePath')) {
    event.preventDefault()
    void shellClient.ui.writeClipboardText(
      formatFileExplorerPathsForClipboard(selectedNodes, 'relative')
    )
    return true
  }
  if (matches('fileExplorer.copyPath')) {
    event.preventDefault()
    void shellClient.ui.writeClipboardText(
      formatFileExplorerPathsForClipboard(selectedNodes, 'absolute')
    )
    return true
  }
  return false
}

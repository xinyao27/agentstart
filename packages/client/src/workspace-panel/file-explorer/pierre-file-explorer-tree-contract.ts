import type { ContextMenuOpenContext } from '@pierre/trees'
import type { GitFileStatus } from '@yiru/protocol/git/status-types'
import type React from 'react'

import type { InlineInput } from './row'
import type { FileExplorerRowProjection } from './row-projection'
import type { TreeNode } from './types'

export type PierreFileExplorerTreeHandle = {
  scrollToAbsolutePath: (path: string, align?: 'center' | 'nearest') => void
}

export type PierreFileExplorerTreeProps = {
  worktreePath: string
  rowProjection: FileExplorerRowProjection
  expandedPaths: ReadonlySet<string>
  selectedPaths: ReadonlySet<string>
  flashingPath: string | null
  inlineInput: InlineInput | null
  statusByRelativePath: ReadonlyMap<string, GitFileStatus>
  ignoredByRelativePath: ReadonlySet<string>
  onScrollElementChange: (element: HTMLDivElement | null) => void
  onActivateFile: (node: TreeNode) => void
  onDoubleClickFile: (node: TreeNode) => void
  onToggleDirectory: (node: TreeNode) => void
  onSelectionChange: (paths: Set<string>) => void
  onRenameNode: (node: TreeNode, newName: string) => void
  onInlineInputSubmit: (value: string) => void
  onInlineInputCancel: () => void
  onMoveDrop: (sourcePath: string, destinationDirectory: string) => void
  onDragSourceChange: (path: string | null) => void
  renderContextMenu: (
    node: TreeNode,
    context: ContextMenuOpenContext,
    isExpanded: boolean
  ) => React.ReactNode
  ref?: React.Ref<PierreFileExplorerTreeHandle>
}

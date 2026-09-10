import React, { useState } from 'react'
import { translate } from '~renderer/i18n/i18n'

import { FileExplorerBackgroundMenu } from './background-menu'
import { useFileExplorerInteractions } from './interactions'
import { useFileExplorerModel } from './model'
import type { PierreFileExplorerTreeHandle } from './pierre-file-explorer-tree'
import { FileExplorerQueryHeaderMemo } from './query-header'
import { FileExplorerTreeContentMemo } from './tree-content'

function FileExplorerFiles({
  isVisible,
  workspacePanelTabId
}: {
  isVisible: boolean
  workspacePanelTabId?: string
}): React.JSX.Element {
  const model = useFileExplorerModel({ isVisible, workspacePanelTabId })
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null)
  const [pierreTree, setPierreTree] = useState<PierreFileExplorerTreeHandle | null>(null)
  const [explorerShellElement, setExplorerShellElement] = useState<HTMLDivElement | null>(null)
  const interactions = useFileExplorerInteractions(model, workspacePanelTabId, {
    explorerShellElement,
    pierreTree,
    scrollElement
  })
  const { view, owner } = model

  if (!owner.worktreePath) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center px-4 text-center text-[11px]">
        {view.explorerView === 'search'
          ? translate(
              'auto.components.right.sidebar.Search.98c8435e36',
              'Select a workspace to search'
            )
          : translate(
              'auto.components.right.sidebar.FileExplorer.79b1537dd3',
              'Select a workspace to browse files'
            )}
      </div>
    )
  }

  return (
    <FileExplorerBackgroundMenu
      open={interactions.menu.bgMenuOpen}
      onOpenChange={interactions.menu.setBgMenuOpen}
      worktreePath={owner.worktreePath}
      onStartNew={interactions.inline.startNew}
    >
      {/* Why: all tree states keep one drop surface so empty/error views accept imports. */}
      <div
        ref={setExplorerShellElement}
        data-agentstart-explorer-shell
        data-selected-folder-relative-path={
          interactions.selection.selectedNode?.isDirectory
            ? interactions.selection.selectedNode.relativePath
            : undefined
        }
        className="flex min-h-0 flex-1 flex-col"
      >
        <FileExplorerQueryHeaderMemo model={model} interactions={interactions} />
        <FileExplorerTreeContentMemo
          model={model}
          interactions={interactions}
          setPierreTree={setPierreTree}
          setScrollElement={setScrollElement}
        />
      </div>
    </FileExplorerBackgroundMenu>
  )
}

export const FileExplorerFilesMemo = FileExplorerFiles

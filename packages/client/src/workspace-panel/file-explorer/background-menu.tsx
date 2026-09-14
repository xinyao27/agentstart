import React, { useEffect } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { FilePlus, FolderPlus } from '~renderer/icons/hugeicons'
import { CLOSE_ALL_CONTEXT_MENUS_EVENT } from '~renderer/tab-bar/sortable-tab'
import { ContextMenu, ContextMenuContent, ContextMenuItem } from '~renderer/ui/context-menu'

export function FileExplorerBackgroundMenu({
  open,
  onOpenChange,
  worktreePath,
  onStartNew,
  children
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  worktreePath: string
  onStartNew: (type: 'file' | 'folder', dir: string, depth: number) => void
  children: React.ReactNode
}): React.JSX.Element {
  useEffect(() => {
    const close = (): void => onOpenChange(false)
    window.addEventListener(CLOSE_ALL_CONTEXT_MENUS_EVENT, close)
    return () => window.removeEventListener(CLOSE_ALL_CONTEXT_MENUS_EVENT, close)
  }, [onOpenChange])

  return (
    <ContextMenu open={open} onOpenChange={onOpenChange}>
      {children}
      <ContextMenuContent className="w-48" finalFocus={false}>
        <ContextMenuItem onClick={() => onStartNew('file', worktreePath, 0)}>
          <FilePlus />
          {translate(
            'auto.components.workspacePanel.FileExplorerBackgroundMenu.21fe46ed36',
            'New File'
          )}
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onStartNew('folder', worktreePath, 0)}>
          <FolderPlus />
          {translate(
            'auto.components.workspacePanel.FileExplorerBackgroundMenu.3b5e2dcb8d',
            'New Folder'
          )}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

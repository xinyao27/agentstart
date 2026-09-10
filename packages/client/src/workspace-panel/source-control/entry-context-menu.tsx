import React from 'react'
import { OpenInApplicationIcon } from '~renderer/external-editor/application-catalog'
import { getLocalFileManagerLabel } from '~renderer/external-editor/file-manager-label'
import { translate } from '~renderer/i18n/i18n'
import { Copy, Eye, FolderOpen, ArrowSquareOut as ExternalLink } from '~renderer/icons/hugeicons'
import { shellClient } from '~renderer/runtime/shell-client'
import { useRuntimeRemoteSshSupport } from '~renderer/sidebar/use-runtime-remote-ssh-support'
import {
  getWorktreeOpenInEntries,
  openOpenInAppsSettings,
  openWorktreePath
} from '~renderer/sidebar/worktree-open-in-menu'
import { getOpenInEntryAvailability } from '~renderer/sidebar/worktree-path-opening'
import { useAppStore } from '~renderer/store/state'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger
} from '~renderer/ui/context-menu'
import { getRuntimeEnvironmentIdForWorktree } from '~renderer/worktree/runtime-owner'

type SourceControlEntryContextMenuProps = {
  currentWorktreeId: string
  absolutePath?: string
  connectionId?: string | null
  onView?: () => void
  onRevealInExplorer: (worktreeId: string, absolutePath: string) => void
  // Base UI's ContextMenuTrigger `render` needs a single element, not arbitrary ReactNode.
  children: React.ReactElement
}

type SourceControlEntryMenuContentProps = Omit<SourceControlEntryContextMenuProps, 'children'> & {
  contentRef?: React.Ref<HTMLDivElement>
  leadingActions?: React.ReactNode
  ownsFileTreeMenu?: boolean
  positionerAnchor?: Element | null
}

function stopRightButtonMenuSelection(event: React.PointerEvent): void {
  if (event.button !== 2) {
    return
  }
  // Why: a right-button release can otherwise select the first menu item.
  event.preventDefault()
  event.stopPropagation()
}

export function SourceControlEntryMenuContent({
  currentWorktreeId,
  absolutePath,
  connectionId,
  onView,
  onRevealInExplorer,
  contentRef,
  leadingActions,
  ownsFileTreeMenu = false,
  positionerAnchor
}: SourceControlEntryMenuContentProps): React.JSX.Element {
  const openInApplications = useAppStore((s) => s.settings?.openInApplications ?? [])
  const runtimeEnvironmentId = useAppStore((s) =>
    getRuntimeEnvironmentIdForWorktree(s, currentWorktreeId)
  )
  const fileManagerLabel = getLocalFileManagerLabel()
  const runtimeRemoteSshSupport = useRuntimeRemoteSshSupport(runtimeEnvironmentId, connectionId)
  const openInEntries = (() => getWorktreeOpenInEntries(openInApplications, fileManagerLabel))()

  const handleCopyPath = () => {
    if (!absolutePath) {
      return
    }
    void shellClient.ui.writeClipboardText(absolutePath)
  }

  const handleRevealInAgentStartExplorer = () => {
    if (!absolutePath) {
      return
    }
    onRevealInExplorer(currentWorktreeId, absolutePath)
  }

  const handleOpenInExternal = (target: 'file-manager' | 'external-editor', command?: string) => {
    if (!absolutePath) {
      return
    }
    void openWorktreePath({
      target,
      worktreePath: absolutePath,
      connectionId,
      runtimeEnvironmentId,
      command
    })
  }

  return (
    <ContextMenuContent
      ref={contentRef}
      data-file-tree-context-menu-root={ownsFileTreeMenu ? 'true' : undefined}
      className="w-52"
      finalFocus={ownsFileTreeMenu ? false : undefined}
      anchor={positionerAnchor}
      side={positionerAnchor ? 'bottom' : undefined}
      align={positionerAnchor ? 'start' : undefined}
      onPointerUpCapture={ownsFileTreeMenu ? stopRightButtonMenuSelection : undefined}
    >
      {leadingActions ? (
        <>
          {leadingActions}
          <ContextMenuSeparator />
        </>
      ) : null}
      <ContextMenuItem onClick={onView} disabled={!onView}>
        <Eye className="size-3.5" />
        {translate(
          'auto.components.right.sidebar.SourceControlEntryContextMenu.a1f2c8d901',
          'View'
        )}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={handleCopyPath} disabled={!absolutePath}>
        <Copy className="size-3.5" />
        {translate('auto.components.right.sidebar.FileExplorerRow.b5d436aa30', 'Copy Path')}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuSub>
        <ContextMenuSubTrigger disabled={!absolutePath}>
          <FolderOpen className="size-3.5" />
          {translate('auto.components.sidebar.WorktreeOpenInMenu.8009ab69a6', 'Open in')}
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className="w-52">
          {openInEntries.map((entry) => {
            const availability = getOpenInEntryAvailability(entry, {
              connectionId,
              runtimeEnvironmentId,
              runtimeRemoteSshSupport
            })
            return (
              <ContextMenuItem
                key={entry.id}
                onClick={() => handleOpenInExternal(entry.target, entry.command)}
                disabled={!absolutePath || availability.disabled}
              >
                {entry.target === 'file-manager' ? (
                  <FolderOpen className="size-3.5" />
                ) : entry.command ? (
                  <OpenInApplicationIcon application={{ command: entry.command }} size={14} />
                ) : (
                  <ExternalLink className="size-3.5" />
                )}
                <span className="min-w-0 truncate">{entry.label}</span>
                {availability.metadata ? (
                  <span className="text-muted-foreground ml-auto shrink-0 text-xs">
                    {availability.metadata}
                  </span>
                ) : null}
              </ContextMenuItem>
            )
          })}
          <ContextMenuSeparator />
          <ContextMenuItem onClick={openOpenInAppsSettings}>
            {translate(
              'auto.components.sidebar.WorktreeOpenInMenu.1417fd8380',
              'Customize apps...'
            )}
          </ContextMenuItem>
        </ContextMenuSubContent>
      </ContextMenuSub>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={handleRevealInAgentStartExplorer} disabled={!absolutePath}>
        <FolderOpen className="size-3.5" />
        {translate(
          'auto.components.right.sidebar.SourceControl.cc05b2d088',
          'Open in File Explorer'
        )}
      </ContextMenuItem>
    </ContextMenuContent>
  )
}

export function SourceControlEntryContextMenu({
  currentWorktreeId,
  absolutePath,
  connectionId,
  onView,
  onRevealInExplorer,
  children
}: SourceControlEntryContextMenuProps): React.JSX.Element {
  return (
    <ContextMenu>
      <ContextMenuTrigger render={children} />
      <SourceControlEntryMenuContent
        currentWorktreeId={currentWorktreeId}
        absolutePath={absolutePath}
        connectionId={connectionId}
        onView={onView}
        onRevealInExplorer={onRevealInExplorer}
      />
    </ContextMenu>
  )
}

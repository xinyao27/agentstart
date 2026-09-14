import type { ContextMenuOpenContext } from '@pierre/trees'
import { useEffect, useRef } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { Minus, Trash, Plus, ArrowCounterClockwise as Undo2 } from '~renderer/icons/hugeicons'
import { joinPath } from '~renderer/path'
import { ContextMenu, ContextMenuItem } from '~renderer/ui/context-menu'
import type { SourceControlController } from '~renderer/workspace-panel/source-control/controller'

import { getSourceControlDirectoryActionPaths } from './directory-action-paths'
import { canDiscardStatusEntry, canStageStatusEntry, canUnstageStatusEntry } from './entry-actions'
import { SourceControlEntryMenuContent } from './entry-context-menu'
import type { SourceControlPierreTarget } from './pierre-tree-data'

function getUncommittedActions(
  controller: SourceControlController,
  target: Extract<SourceControlPierreTarget, { kind: 'uncommitted' }>
): React.JSX.Element | null {
  const { entry } = target
  const canDiscard = canDiscardStatusEntry(entry)
  const canStage = canStageStatusEntry(entry)
  const canUnstage = canUnstageStatusEntry(entry)
  if (!canDiscard && !canStage && !canUnstage) {
    return null
  }

  return (
    <>
      {canDiscard ? (
        <ContextMenuItem
          variant="destructive"
          onClick={() => controller.requestDiscardEntry(entry)}
        >
          {entry.area === 'untracked' ? <Trash /> : <Undo2 />}
          {entry.area === 'untracked'
            ? translate(
                'auto.components.workspacePanel.SourceControl.11463f7a98',
                'Delete untracked file'
              )
            : entry.status === 'deleted'
              ? translate('auto.components.workspacePanel.SourceControl.989f3d5e34', 'Restore file')
              : translate(
                  'auto.components.workspacePanel.SourceControl.d54dd48b0b',
                  'Discard changes'
                )}
        </ContextMenuItem>
      ) : null}
      {canStage ? (
        <ContextMenuItem onClick={() => void controller.handleStage(entry.path)}>
          <Plus />
          {translate('auto.components.workspacePanel.SourceControl.8cde1a2fb0', 'Stage')}
        </ContextMenuItem>
      ) : null}
      {canUnstage ? (
        <ContextMenuItem onClick={() => void controller.handleUnstage(entry.path)}>
          <Minus />
          {translate('auto.components.workspacePanel.SourceControl.df5040e3c3', 'Unstage')}
        </ContextMenuItem>
      ) : null}
    </>
  )
}

function getDirectoryActions(
  controller: SourceControlController,
  target: Extract<SourceControlPierreTarget, { kind: 'directory' }>
): React.JSX.Element | null {
  const node = target.node
  if (!node || controller.normalizedFilter) {
    return null
  }
  const actionPaths = getSourceControlDirectoryActionPaths(node)
  const canStage = actionPaths.stagePaths.length > 0
  const canUnstage = actionPaths.unstagePaths.length > 0
  const canDiscard = actionPaths.discardPaths.length > 0
  if (!canDiscard && !canStage && !canUnstage) {
    return null
  }

  return (
    <>
      {canDiscard ? (
        <ContextMenuItem
          variant="destructive"
          disabled={controller.isExecutingBulk}
          onClick={() =>
            controller.setPendingDiscard({
              kind: 'area',
              area: node.area,
              paths: actionPaths.discardPaths
            })
          }
        >
          {node.area === 'untracked' ? <Trash /> : <Undo2 />}
          {node.area === 'untracked'
            ? translate(
                'auto.components.workspacePanel.SourceControl.9b367363b6',
                'Delete untracked in folder'
              )
            : translate(
                'auto.components.workspacePanel.SourceControl.6d7f2a47e5',
                'Discard folder'
              )}
        </ContextMenuItem>
      ) : null}
      {canStage ? (
        <ContextMenuItem
          disabled={controller.isExecutingBulk}
          onClick={() => void controller.handleStageAllPaths(actionPaths.stagePaths)}
        >
          <Plus />
          {translate('auto.components.workspacePanel.SourceControl.bfe9011a0e', 'Stage folder')}
        </ContextMenuItem>
      ) : null}
      {canUnstage ? (
        <ContextMenuItem
          disabled={controller.isExecutingBulk}
          onClick={() => void controller.handleUnstagePaths(actionPaths.unstagePaths)}
        >
          <Minus />
          {translate('auto.components.workspacePanel.SourceControl.ab31221779', 'Unstage folder')}
        </ContextMenuItem>
      ) : null}
    </>
  )
}

type SourceControlPierreTreeMenuProps = {
  controller: SourceControlController
  target: SourceControlPierreTarget
  context: ContextMenuOpenContext
}

function focusFirstAvailableMenuItem(content: HTMLDivElement | null): void {
  content
    ?.querySelector<HTMLElement>('[data-slot="context-menu-item"]:not([data-disabled])')
    ?.focus()
}

export function SourceControlPierreTreeMenu({
  controller,
  target,
  context
}: SourceControlPierreTreeMenuProps): React.JSX.Element | null {
  const contentRef = useRef<HTMLDivElement>(null)
  const activeWorktree = controller.activeWorktree
  const worktreePath = controller.worktreePath

  useEffect(() => {
    // Why: Pierre owns the external context-menu trigger, so Base UI cannot
    // infer which menu item should receive keyboard focus when its portal opens.
    const frameId = window.requestAnimationFrame(() => {
      focusFirstAvailableMenuItem(contentRef.current)
    })
    return () => window.cancelAnimationFrame(frameId)
  }, [context.anchorElement])

  if (!activeWorktree || !worktreePath || target.kind === 'placeholder') {
    return null
  }

  const relativePath = target.kind === 'directory' ? target.relativePath : target.entry.path
  const onView =
    target.kind === 'uncommitted'
      ? target.isSubmodule
        ? undefined
        : () => controller.handleOpenDiff(target.entry)
      : target.kind === 'branch'
        ? () => controller.openCommittedDiff(target.entry)
        : undefined
  const leadingActions =
    target.kind === 'uncommitted'
      ? getUncommittedActions(controller, target)
      : target.kind === 'directory'
        ? getDirectoryActions(controller, target)
        : undefined

  return (
    <ContextMenu
      defaultOpen
      onOpenChange={(open) => {
        if (!open) {
          context.close()
        }
      }}
    >
      <SourceControlEntryMenuContent
        contentRef={contentRef}
        currentWorktreeId={activeWorktree.id}
        absolutePath={joinPath(worktreePath, relativePath)}
        connectionId={controller.activeConnectionId}
        onView={onView}
        onRevealInExplorer={controller.revealInExplorer}
        leadingActions={leadingActions}
        ownsFileTreeMenu
        positionerAnchor={context.anchorElement}
      />
    </ContextMenu>
  )
}

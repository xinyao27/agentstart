import type { Worktree } from '@agentstart/protocol/worktree/model'
import React, { useEffect, useRef, useState } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { useEventCallback } from '~renderer/react/use-event-callback'
import { ContextMenu, ContextMenuTrigger } from '~renderer/ui/context-menu'

import { ProjectGroupNameDialog } from '../project-group-name-dialog'
import { isEventTargetInsideCurrentTarget } from '../worktree-card/dom-events'
import { WorktreeParentPickerPopover } from '../worktree-parent-picker-popover'
import { WorktreeContextMenuContent } from './content'
import { useDebugLogMenuActions } from './debug-log-actions'
import { useLifecycleMenuActions } from './lifecycle-actions'
import { useLineageMenuActions } from './lineage-actions'
import { CLOSE_ALL_CONTEXT_MENUS_EVENT, shouldUseNativeContextMenu } from './opening-policy'
import { useWorktreeContextMenuState } from './state'
import { useWorkspaceMenuActions } from './workspace-actions'

type WorktreeContextMenuProps = {
  worktree: Worktree
  children: React.ReactNode
  selectedWorktrees?: readonly Worktree[]
  onContextMenuSelect?: (event: React.MouseEvent<HTMLElement>) => readonly Worktree[]
  onOpenChange?: (open: boolean) => void
}

function WorktreeContextMenuImplementation({
  worktree,
  children,
  selectedWorktrees,
  onContextMenuSelect,
  onOpenChange
}: WorktreeContextMenuProps): React.JSX.Element {
  const defaultSelectedWorktrees = (() => [worktree])()
  const effectiveSelectedWorktrees = selectedWorktrees ?? defaultSelectedWorktrees
  const [menuOpen, setMenuOpen] = useState(false)
  const [contextWorktrees, setContextWorktrees] = useState<readonly Worktree[]>(
    effectiveSelectedWorktrees
  )
  const scopeRef = useRef<HTMLDivElement>(null)
  const activeContextWorktrees = menuOpen ? contextWorktrees : effectiveSelectedWorktrees
  const state = useWorktreeContextMenuState({ worktree, menuOpen, activeContextWorktrees })

  const setMenuOpenState = useEventCallback((open: boolean) => {
    setMenuOpen(open)
    onOpenChange?.(open)
  })

  const workspaceActions = useWorkspaceMenuActions({ state, setMenuOpenState })
  const lineageActions = useLineageMenuActions({ state, scopeRef, setMenuOpenState })
  const lifecycleActions = useLifecycleMenuActions({ state, scopeRef, setMenuOpenState })
  const debugLogActions = useDebugLogMenuActions({ state, menuOpen })

  useEffect(() => {
    const closeMenu = (): void => setMenuOpenState(false)
    window.addEventListener(CLOSE_ALL_CONTEXT_MENUS_EVENT, closeMenu)
    return () => window.removeEventListener(CLOSE_ALL_CONTEXT_MENUS_EVENT, closeMenu)
  }, [setMenuOpenState])

  return (
    <>
      <ContextMenu open={menuOpen} onOpenChange={setMenuOpenState}>
        <ContextMenuTrigger
          onContextMenu={(event) => {
            if (!isEventTargetInsideCurrentTarget(event.currentTarget, event.target)) {
              event.preventBaseUIHandler()
              return
            }
            if (shouldUseNativeContextMenu(event.target)) {
              // Why: Base UI also suppresses native menus from a document listener.
              // Stop this event before it reaches that listener without cancelling it.
              event.preventBaseUIHandler()
              event.stopPropagation()
              return
            }
            window.dispatchEvent(new Event(CLOSE_ALL_CONTEXT_MENUS_EVENT))
            setContextWorktrees(onContextMenuSelect?.(event) ?? effectiveSelectedWorktrees)
          }}
          render={
            <div ref={scopeRef} className="relative">
              {children}
            </div>
          }
        />
        <WorktreeContextMenuContent
          state={state}
          workspaceActions={workspaceActions}
          lineageActions={lineageActions}
          lifecycleActions={lifecycleActions}
          debugLogActions={debugLogActions}
        />
      </ContextMenu>
      <ProjectGroupNameDialog
        open={workspaceActions.createGroupDialogOpen}
        title={translate(
          'auto.components.sidebar.WorktreeContextMenu.6664418e98',
          'New Project Group'
        )}
        description={translate(
          'auto.components.sidebar.WorktreeContextMenu.c39c37676a',
          'Create a group and move this project into it.'
        )}
        initialName={
          state.repo
            ? translate(
                'auto.components.sidebar.WorktreeContextMenu.newGroupName',
                '{{name}} group',
                { name: state.repo.displayName }
              )
            : ''
        }
        confirmLabel={translate('auto.components.sidebar.WorktreeContextMenu.create', 'Create')}
        onOpenChange={workspaceActions.setCreateGroupDialogOpen}
        onSubmit={workspaceActions.handleSubmitNewProjectGroup}
      />
      <WorktreeParentPickerPopover
        open={lineageActions.parentPicker !== null}
        childWorktreeId={lineageActions.parentPicker?.childWorktreeId ?? null}
        anchorElement={lineageActions.parentPicker?.anchorElement ?? null}
        onOpenChange={(open) => {
          if (!open) {
            lineageActions.setParentPicker(null)
          }
        }}
      />
    </>
  )
}

const MemoizedWorktreeContextMenu = WorktreeContextMenuImplementation

export function WorktreeContextMenu(props: WorktreeContextMenuProps): React.JSX.Element {
  return <MemoizedWorktreeContextMenu {...props} />
}

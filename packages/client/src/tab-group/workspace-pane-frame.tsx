import type React from 'react'
import { cn } from '~renderer/ui/class-names'

import { TAB_CONTENT_SURFACE_CLASSES } from '../tab-bar/tab-chrome-classes'

type WorkspacePaneFrameProps = {
  worktreeId: string
  stripId: string
  tabBar: React.ReactNode
  trailingActions?: React.ReactNode
  hideHeader?: boolean
  rootClassName?: string
  rootProps?: Omit<React.HTMLAttributes<HTMLDivElement>, 'children' | 'className'>
  bodyClassName?: string
  bodyRef?: React.Ref<HTMLDivElement>
  bodyProps?: Omit<React.HTMLAttributes<HTMLDivElement>, 'children' | 'className'> & {
    'data-tab-group-body-id'?: string
    'data-worktree-id'?: string
  }
  children: React.ReactNode
}

export function WorkspacePaneFrame({
  worktreeId,
  stripId,
  tabBar,
  trailingActions,
  hideHeader = false,
  rootClassName,
  rootProps,
  bodyClassName,
  bodyRef,
  bodyProps,
  children
}: WorkspacePaneFrameProps): React.JSX.Element {
  return (
    <div
      {...rootProps}
      className={cn(
        'group/tab-group relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
        rootClassName
      )}
    >
      {!hideHeader ? (
        // Why: the pane-local strip paints no surface of its own either — it
        // sits on whatever backs the frame, which in the workbench is the
        // content card the whole frame lives on.
        <div
          className="relative h-[var(--titlebar-height)] shrink-0"
          data-tab-group-strip-id={stripId}
          data-worktree-id={worktreeId}
        >
          <WorkspacePaneFrameHeader tabBar={tabBar} trailingActions={trailingActions} />
        </div>
      ) : null}

      <div
        {...bodyProps}
        ref={bodyRef}
        // Why: tab content is the interior of the floating workspace content
        // card, so every workspace content type shares the card's canvas.
        className={cn(
          'relative min-h-0 flex-1 overflow-hidden',
          TAB_CONTENT_SURFACE_CLASSES,
          bodyClassName
        )}
      >
        {children}
      </div>
    </div>
  )
}

export function WorkspacePaneFrameHeader({
  tabBar,
  trailingActions,
  stripId,
  worktreeId
}: {
  tabBar: React.ReactNode
  trailingActions?: React.ReactNode
  stripId?: string
  worktreeId?: string
}): React.JSX.Element {
  return (
    // Why: flex-1 keeps the trailing workspace actions pinned to the right edge
    // of the shared titlebar while the tab strip itself scrolls.
    <div
      className="relative flex h-full min-w-0 flex-1 items-stretch"
      data-tab-group-strip-id={stripId}
      data-worktree-id={worktreeId}
    >
      <div className="h-full min-w-0 flex-1">{tabBar}</div>
      {trailingActions ? (
        <div className="mr-1.5 flex shrink-0 items-center gap-0">{trailingActions}</div>
      ) : null}
    </div>
  )
}

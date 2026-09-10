import React from 'react'
import { translate } from '~renderer/i18n/i18n'
import { Warning as AlertTriangle, X } from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { useAppStore } from '~renderer/store/state'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'
import {
  getCreationProgressLabel,
  type PendingWorktreeCreation
} from '~renderer/worktree-creation/pending'

function statusLabel(entry: PendingWorktreeCreation): string {
  if (entry.status === 'error') {
    return (
      entry.error ??
      translate('auto.components.sidebar.PendingWorktreeRow.creationFailed', 'Creation failed')
    )
  }
  return getCreationProgressLabel(entry)
}

/**
 * Sidebar row for an in-progress (or failed) worktree create. Rendered inline in
 * the worktree list under its target repo, so the new workspace appears where it
 * will land. Self-contained: reads its own entry + active state by creationId.
 */
export function PendingWorktreeRow({
  creationId
}: {
  creationId: string
}): React.JSX.Element | null {
  const entry = useAppStore((s) => s.pendingWorktreeCreations[creationId])
  const active = useAppStore((s) => s.activePendingCreationId === creationId)
  if (!entry) {
    return null
  }

  const isError = entry.status === 'error'
  return (
    <div
      className={cn(
        'group flex w-full items-center gap-1 transition-colors rounded-md',
        active ? 'border-ring/35 bg-accent border' : 'border border-transparent hover:bg-accent'
      )}
    >
      <Button
        variant="ghost"
        size="sm"
        type="button"
        // Why: never route this through setActiveWorktree — there is no real
        // worktree yet. activePendingCreationId drives the content loader instead.
        onClick={() => {
          const store = useAppStore.getState()
          store.setActivePendingWorktreeCreation(creationId)
          store.updatePendingWorktreeCreation(creationId, { loaderVisible: true })
          store.setActiveView('terminal')
        }}
        className="focus-visible:bg-accent flex min-w-0 flex-1 justify-start gap-2 border-0 px-2 py-1.5 text-left font-normal whitespace-normal"
      >
        <span className="flex size-4 shrink-0 items-center justify-center">
          {isError ? (
            <AlertTriangle className="text-destructive size-3.5" />
          ) : (
            <LoadingIndicator className="text-muted-foreground size-4" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-sidebar-foreground block truncate text-[13px] font-medium">
            {entry.request.displayName || entry.request.name}
          </span>
          <span
            className={cn(
              'block truncate text-[11px]',
              isError ? 'text-destructive/90' : 'text-muted-foreground'
            )}
          >
            {statusLabel(entry)}
          </span>
        </span>
      </Button>
      <Button
        variant="quiet"
        size="icon-xs"
        type="button"
        title={translate('auto.components.sidebar.PendingWorktreeRow.188f6922a0', 'Cancel')}
        aria-label={translate(
          'auto.components.sidebar.PendingWorktreeRow.af21e953d1',
          'Cancel worktree creation'
        )}
        onClick={() => useAppStore.getState().removePendingWorktreeCreation(creationId)}
        className={cn(
          ' ',
          'mr-1 flex size-5 transition-opacity focus-visible:opacity-100',
          isError ? 'opacity-100' : 'can-hover:opacity-0 group-hover:opacity-100'
        )}
      >
        <X className="size-3.5" />
      </Button>
    </div>
  )
}

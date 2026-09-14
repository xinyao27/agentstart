import React from 'react'
import { createPortal } from 'react-dom'
import { installWindowVisibilityInterval } from '~renderer/application-shell/window-visibility-interval'
import { useWorkspaceSharedHeaderTarget } from '~renderer/application-shell/workspace-shared-header'
import { translate } from '~renderer/i18n/i18n'
import {
  Warning as AlertTriangle,
  GitMerge,
  ArrowCounterClockwise as RotateCcw,
  X
} from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { useAppStore } from '~renderer/store/state'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'
import { retryBackgroundWorktreeCreation } from '~renderer/worktree-creation/flow'
import { getCreationProgressLabel } from '~renderer/worktree-creation/pending'

import { getTitlebarTabStateClasses, TAB_ROOT_CLASSES } from '../tab-bar/tab-chrome-classes'
import { TabActiveSurface, TabSurfaceProvider } from '../tab-bar/tab-surfaces'
import { WorkspacePaneFrameHeader } from '../tab-group/workspace-pane-frame'
import { WorktreeCreationProgressChecklist } from './progress-checklist'

/**
 * In-frame creation state, shown in the workspace content area while a worktree
 * is being created. Presented as a faux tab: a tab strip carrying the new
 * worktree's name (the title) over a body that holds the live status. This lets
 * the in-progress create read as a real workspace tab whose content is loading,
 * so the handoff to the real terminal is a same-frame swap — and the title
 * (name) and the body status never duplicate each other. Its appearance is
 * debounced upstream so fast creates never paint it.
 */
export default function WorktreeCreationPanel({
  creationId,
  useSharedHeader = false
}: {
  creationId: string
  useSharedHeader?: boolean
}): React.JSX.Element | null {
  const entry = useAppStore((s) => s.pendingWorktreeCreations[creationId])
  const sharedHeaderTarget = useWorkspaceSharedHeaderTarget()
  const [now, setNow] = React.useState(() => Date.now())
  // Why: depend on the primitive status only, so a fresh `entry` reference does
  // not tear down and recreate this interval before it can fire.
  const entryStatus = entry?.status
  React.useEffect(() => {
    if (entryStatus !== 'creating') {
      return
    }
    // Pause the 1s clock while the window is hidden so a backgrounded creation
    // panel stops re-rendering for ticks no one can see.
    return installWindowVisibilityInterval({ run: () => setNow(Date.now()), intervalMs: 1000 })
  }, [entryStatus])
  if (!entry) {
    return null
  }

  const dismiss = (): void => useAppStore.getState().removePendingWorktreeCreation(creationId)
  const isError = entry.status === 'error'
  const title = entry.request.displayName || entry.request.name
  const elapsedLabel = formatElapsedTime(now - entry.startedAt)

  const header = (
    // Why: the faux tab wears the real tab chrome — no strip surface of its own,
    // just the shared merge silhouette on the card's baseline — so an
    // in-progress create fuses with the content exactly as a selected tab does.
    // A border or a painted band here would draw the seam that the silhouette
    // prevents. The row carries the strip's own 12px leading gutter so the
    // silhouette's outer arc has room to flare instead of being clipped.
    <div className="flex h-[var(--titlebar-height)] shrink-0 items-stretch pl-3">
      <div className={cn(TAB_ROOT_CLASSES, getTitlebarTabStateClasses(true), 'min-w-32 max-w-60')}>
        <TabActiveSurface />
        <div className="flex h-full min-w-0 items-center gap-2 text-xs">
          {isError ? (
            <AlertTriangle className="text-destructive size-3.5 shrink-0" />
          ) : (
            // Why: a static worktree glyph (not a spinner) keeps the tab reading
            // as a normal tab; the single loading spinner lives in the body.
            <GitMerge className="text-muted-foreground size-3.5 shrink-0" />
          )}
          <span className="text-foreground truncate font-medium">{title}</span>
          <Button
            variant="quiet"
            size="icon-xs"
            type="button"
            title={translate(
              'auto.components.worktree.creation.WorktreeCreationPanel.532aea14ce',
              'Cancel'
            )}
            aria-label={translate(
              'auto.components.worktree.creation.WorktreeCreationPanel.a3346fc6ed',
              'Cancel worktree creation'
            )}
            onClick={dismiss}
            className="hover:bg-muted focus-visible:bg-muted flex size-4"
          >
            <X className="size-3" />
          </Button>
        </div>
      </div>
    </div>
  )
  const shouldUseSharedHeader = useSharedHeader
  const sharedHeader =
    shouldUseSharedHeader && sharedHeaderTarget
      ? createPortal(
          <TabSurfaceProvider scope="plane">
            <WorkspacePaneFrameHeader tabBar={header} />
          </TabSurfaceProvider>,
          sharedHeaderTarget
        )
      : null

  return (
    <>
      {sharedHeader}
      {/* Why: no surface of its own — the shell's workspace-content-card is the
          frame it fills, so a nested card would double the rounding. */}
      <div className="absolute inset-0 flex flex-col">
        {/* Faux tab strip: mirrors the real tab row (height, border, bg) so the
          create reads as a workspace tab. Carries only the worktree name + a
          cancel control — the live status lives in the body below. */}
        {!shouldUseSharedHeader ? header : null}

        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          {/* Body: a quiet top-left annotation on the surface the terminal will
            fill — the same spot terminal output appears — so creation → terminal
            reads as one frame filling in. */}
          <div className="min-h-0 min-w-0 flex-1 p-3">
            {isError ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span className="text-destructive font-medium">
                  {translate(
                    'auto.components.worktree.creation.WorktreeCreationPanel.ed2a664f8b',
                    'Couldn’t create worktree'
                  )}
                </span>
                <span className="text-muted-foreground">
                  {entry.error ??
                    translate(
                      'auto.components.worktree.creation.WorktreeCreationPanel.767951265d',
                      'Something went wrong while creating the worktree.'
                    )}
                </span>
                <Button
                  variant="ghost"
                  size="xs"
                  type="button"
                  onClick={() => retryBackgroundWorktreeCreation(creationId)}
                  className="text-foreground focus-visible:bg-accent h-auto border-0 p-0 hover:underline"
                >
                  <RotateCcw className="size-3" />
                  {translate(
                    'auto.components.worktree.creation.WorktreeCreationPanel.34dd5ee38b',
                    'Retry'
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  type="button"
                  onClick={dismiss}
                  className="text-muted-foreground hover:text-foreground focus-visible:text-foreground focus-visible:bg-accent h-auto border-0 p-0 hover:underline"
                >
                  {translate(
                    'auto.components.worktree.creation.WorktreeCreationPanel.dabd226118',
                    'Dismiss'
                  )}
                </Button>
              </div>
            ) : (
              <div className="text-muted-foreground flex min-h-0 max-w-3xl flex-col gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-foreground font-medium">
                    {getCreationProgressLabel(entry)}
                  </span>
                  <span className="text-muted-foreground/70">{elapsedLabel}</span>
                </div>
                {entry.indeterminate ? (
                  <LoadingIndicator className="size-3.5" />
                ) : (
                  <WorktreeCreationProgressChecklist entry={entry} />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

function formatElapsedTime(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes === 0) {
    return `${seconds}s`
  }
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`
}

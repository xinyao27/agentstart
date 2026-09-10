import type { JSX } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { Warning as AlertTriangle } from '~renderer/icons/hugeicons'

export function DeleteWorktreeWarningPanels({
  isMainWorktree,
  mainWorktreeBlocker,
  deleteError
}: {
  isMainWorktree: boolean
  mainWorktreeBlocker: string
  deleteError: string | null
}): JSX.Element {
  return (
    <>
      {isMainWorktree && (
        <div className="border-border/70 bg-muted/35 text-muted-foreground rounded-md border px-3 py-2 text-xs">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <div className="min-w-0 flex-1">
              {translate(
                'auto.components.sidebar.DeleteWorktreeWarningPanels.e3be9eba15',
                'This is the'
              )}
              <span className="text-foreground font-semibold">
                {translate(
                  'auto.components.sidebar.DeleteWorktreeWarningPanels.c4f96a6e18',
                  'main worktree'
                )}
              </span>{' '}
              {translate(
                'auto.components.sidebar.DeleteWorktreeWarningPanels.026738155a',
                '(the original clone directory).'
              )}
              {mainWorktreeBlocker}
            </div>
          </div>
        </div>
      )}

      {deleteError && !isMainWorktree && (
        <div className="border-destructive/40 bg-destructive/8 text-destructive rounded-md border px-3 py-2 text-xs">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <div className="min-w-0 flex-1 break-all whitespace-pre-wrap">{deleteError}</div>
          </div>
        </div>
      )}
    </>
  )
}

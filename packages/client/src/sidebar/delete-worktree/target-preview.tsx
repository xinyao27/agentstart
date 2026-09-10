import type { Worktree } from '@agentstart/protocol/worktree/model'
import type { JSX } from 'react'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { ScrollArea } from '~renderer/ui/scroll-area'

import { DeleteWorktreeDirtyChangeHint } from './dirty-change-hint'

type DeleteState = {
  isDeleting?: boolean
  error?: string | null
}

export function DeleteWorktreeTargetPreview({
  isBatchDelete,
  worktree,
  worktrees,
  deleteStateByWorktreeId,
  dirtyChangeCountsByWorktreeId
}: {
  isBatchDelete: boolean
  worktree: Worktree | null
  worktrees: readonly Worktree[]
  deleteStateByWorktreeId: Record<string, DeleteState | undefined>
  dirtyChangeCountsByWorktreeId: ReadonlyMap<string, number>
}): JSX.Element | null {
  if (isBatchDelete) {
    return (
      <ScrollArea className="border-border/70 bg-muted/35 max-h-48 rounded-md border text-xs">
        <div className="space-y-1 px-3 py-2">
          {worktrees.map((item) => {
            const itemDeleteState = deleteStateByWorktreeId[item.id]
            return (
              <div key={item.id} className="border-border/50 min-w-0 border-b py-1 last:border-0">
                <div className="flex min-w-0 items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-foreground font-medium break-all">{item.displayName}</div>
                    <div className="text-muted-foreground mt-0.5 break-all">{item.path}</div>
                    <DeleteWorktreeDirtyChangeHint
                      changeCount={dirtyChangeCountsByWorktreeId.get(item.id)}
                    />
                    {itemDeleteState?.error ? (
                      <div className="text-destructive mt-1 break-all whitespace-pre-wrap">
                        {itemDeleteState.error}
                      </div>
                    ) : null}
                  </div>
                  {itemDeleteState?.isDeleting ? (
                    <LoadingIndicator className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      </ScrollArea>
    )
  }

  return worktree ? (
    <div className="border-border/70 bg-muted/35 rounded-md border px-3 py-2 text-xs">
      <div className="text-foreground font-medium break-all">{worktree.displayName}</div>
      <div className="text-muted-foreground mt-1 break-all">{worktree.path}</div>
      <DeleteWorktreeDirtyChangeHint changeCount={dirtyChangeCountsByWorktreeId.get(worktree.id)} />
    </div>
  ) : null
}

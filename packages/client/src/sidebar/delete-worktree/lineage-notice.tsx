import type { Worktree } from '@yiru/protocol/worktree/model'
import type { JSX } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { FlowArrow as Workflow } from '~renderer/icons/hugeicons'

import { DeleteWorktreeDirtyChangeHint } from './dirty-change-hint'

type DeleteWorktreeLineageNoticeProps = {
  descendants: readonly Worktree[]
  dirtyChangeCountsByWorktreeId: ReadonlyMap<string, number>
}

export function DeleteWorktreeLineageNotice({
  descendants,
  dirtyChangeCountsByWorktreeId
}: DeleteWorktreeLineageNoticeProps): JSX.Element | null {
  const childWorkspaceCount = descendants.length
  if (childWorkspaceCount === 0) {
    return null
  }

  return (
    <div className="border-border/70 bg-muted/35 max-w-full min-w-0 overflow-hidden border px-3 py-2 text-xs">
      <div className="flex items-start gap-2">
        <Workflow className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-foreground font-medium">
            {translate(
              'auto.components.sidebar.DeleteWorktreeLineageNotice.a940f3c96e',
              'Child workspaces will be deleted'
            )}
          </div>
          <div className="text-muted-foreground mt-1">
            {childWorkspaceCount === 1
              ? translate(
                  'auto.components.sidebar.DeleteWorktreeLineageNotice.66798cc6a2',
                  'Deleting this workspace also deletes 1 child workspace.'
                )
              : translate(
                  'auto.components.sidebar.DeleteWorktreeLineageNotice.29b98bf9cd',
                  'Deleting this workspace also deletes {{value0}} child workspaces.',
                  { value0: childWorkspaceCount }
                )}
          </div>
          {/* Why: long nowrap paths can otherwise give this grid child an
             intrinsic width wider than the modal. */}
          <div className="border-border/60 bg-background/60 mt-2 max-w-full min-w-0 space-y-1 overflow-hidden border px-2 py-1.5">
            {descendants.slice(0, 4).map((child) => (
              <div key={child.id} className="min-w-0 overflow-hidden">
                <div className="text-foreground truncate font-medium">{child.displayName}</div>
                <div className="text-muted-foreground truncate">{child.path}</div>
                <DeleteWorktreeDirtyChangeHint
                  changeCount={dirtyChangeCountsByWorktreeId.get(child.id)}
                />
              </div>
            ))}
            {descendants.length > 4 ? (
              <div className="text-muted-foreground">
                +{descendants.length - 4}{' '}
                {translate(
                  'auto.components.sidebar.DeleteWorktreeLineageNotice.ad407c2d55',
                  'more'
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

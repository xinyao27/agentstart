import React, { useState } from 'react'
import { getExternalWorktreeParentPath } from '~renderer/external-worktree-visibility'
import { translate } from '~renderer/i18n/i18n'
import { WarningCircle } from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '~renderer/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

import type { ImportedWorktreeCardActionState } from './imported-worktrees-card-actions'
import type { ImportedWorktreesCardCandidate } from './worktree-list/groups'

type DiscoveredWorktreesAlertProps = {
  projectName: string
  candidates: readonly ImportedWorktreesCardCandidate[]
  actionStateByRepoId: ReadonlyMap<string, ImportedWorktreeCardActionState>
  onShow: (projectId: string) => void
  onKeepHidden: (projectId: string) => void
}

const PREVIEW_LIMIT = 5

function getStatusLabel(count: number, projectName: string): string {
  return count === 1
    ? translate(
        'auto.components.sidebar.DiscoveredWorktreesAlert.statusOne',
        'Review 1 discovered worktree for {{value0}}',
        { value0: projectName }
      )
    : translate(
        'auto.components.sidebar.DiscoveredWorktreesAlert.statusMany',
        'Review {{value0}} discovered worktrees for {{value1}}',
        { value0: count, value1: projectName }
      )
}

function getDescription(count: number): string {
  return count === 1
    ? translate(
        'auto.components.sidebar.DiscoveredWorktreesAlert.descriptionOne',
        'Git found 1 worktree created outside AgentStart. It is currently hidden from the workspace list.'
      )
    : translate(
        'auto.components.sidebar.DiscoveredWorktreesAlert.descriptionMany',
        'Git found {{value0}} worktrees created outside AgentStart. They are currently hidden from the workspace list.',
        { value0: count }
      )
}

function stopProjectHeaderEvent(event: React.SyntheticEvent<HTMLElement>): void {
  event.stopPropagation()
}

export function DiscoveredWorktreesAlert(
  props: DiscoveredWorktreesAlertProps
): React.JSX.Element | null {
  const { projectName, candidates, actionStateByRepoId, onShow, onKeepHidden } = props
  const [open, setOpen] = useState(false)
  const previews = candidates.flatMap((candidate) =>
    candidate.hiddenWorktrees.map((worktree) => ({
      repoId: candidate.repo.id,
      worktree
    }))
  )
  const hiddenCount = previews.length
  const visiblePreviews = previews.slice(0, PREVIEW_LIMIT)
  const remainingCount = hiddenCount - visiblePreviews.length
  const pending = candidates.some(
    (candidate) => actionStateByRepoId.get(candidate.repo.id)?.pending === true
  )
  const hasError = candidates.some((candidate) =>
    Boolean(actionStateByRepoId.get(candidate.repo.id)?.error)
  )
  const canKeepHidden = candidates.every(
    (candidate) => actionStateByRepoId.get(candidate.repo.id)?.forceVisible !== true
  )
  const statusLabel = getStatusLabel(hiddenCount, projectName)

  if (hiddenCount === 0) {
    return null
  }

  return (
    <Popover modal={false} open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <Button
                  type="button"
                  variant="quiet"
                  size="icon-xs"
                  data-repo-header-action=""
                  disabled={pending}
                  aria-label={statusLabel}
                  aria-expanded={open}
                  onClick={stopProjectHeaderEvent}
                  onKeyDown={stopProjectHeaderEvent}
                  onPointerDown={stopProjectHeaderEvent}
                >
                  <WarningCircle className="text-destructive size-4" aria-hidden="true" />
                </Button>
              }
            />
          }
        />
        <TooltipContent side="bottom" sideOffset={4}>
          {statusLabel}
        </TooltipContent>
      </Tooltip>

      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={4}
        className="w-80 max-w-[calc(100vw-2rem)]"
        aria-busy={pending}
        onClick={stopProjectHeaderEvent}
        onKeyDown={stopProjectHeaderEvent}
        onPointerDown={stopProjectHeaderEvent}
      >
        <div className="border-border flex items-start gap-2 border-b px-3 py-2">
          <WarningCircle className="text-destructive size-4 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <div className="text-foreground text-xs font-medium">
              {translate(
                'auto.components.sidebar.DiscoveredWorktreesAlert.title',
                'Discovered worktrees'
              )}
            </div>
            <p className="text-muted-foreground mt-1 text-[11px] leading-4">
              {getDescription(hiddenCount)}
            </p>
          </div>
        </div>

        <div className="divide-border grid divide-y px-3">
          {visiblePreviews.map(({ repoId, worktree }) => (
            <div key={`${repoId}:${worktree.id}`} className="min-w-0 py-2">
              <div className="text-foreground truncate text-xs font-medium">
                {worktree.displayName}
              </div>
              <div
                className="text-muted-foreground mt-1 truncate font-mono text-[10px] leading-4"
                title={worktree.path}
              >
                {getExternalWorktreeParentPath(worktree.path)}
              </div>
            </div>
          ))}
          {remainingCount > 0 ? (
            <div className="text-muted-foreground py-2 text-[11px]">
              {remainingCount === 1
                ? translate(
                    'auto.components.sidebar.DiscoveredWorktreesAlert.moreOne',
                    '1 more hidden worktree'
                  )
                : translate(
                    'auto.components.sidebar.DiscoveredWorktreesAlert.moreMany',
                    '{{value0}} more hidden worktrees',
                    { value0: remainingCount }
                  )}
            </div>
          ) : null}
        </div>

        <div className="border-border grid gap-2 border-t px-3 py-2">
          <p className="text-muted-foreground text-[10px] leading-4">
            {translate(
              'auto.components.sidebar.DiscoveredWorktreesAlert.recoveryHint',
              'Keeping them hidden dismisses this notice. You can show them later from the project menu.'
            )}
          </p>
          {hasError ? (
            <p className="text-destructive text-[11px] leading-4" role="alert">
              {translate(
                'auto.components.sidebar.DiscoveredWorktreesAlert.error',
                'Could not update discovered worktrees. Try again.'
              )}
            </p>
          ) : null}
          <div className="flex items-center justify-end gap-2">
            {canKeepHidden ? (
              <Button
                type="button"
                variant="quiet"
                size="xs"
                disabled={pending}
                onClick={() => {
                  for (const candidate of candidates) {
                    onKeepHidden(candidate.repo.id)
                  }
                }}
              >
                {translate(
                  'auto.components.sidebar.DiscoveredWorktreesAlert.keepHidden',
                  'Keep hidden'
                )}
              </Button>
            ) : null}
            <Button
              type="button"
              size="xs"
              disabled={pending}
              onClick={() => {
                for (const candidate of candidates) {
                  onShow(candidate.repo.id)
                }
              }}
            >
              {translate(
                'auto.components.sidebar.DiscoveredWorktreesAlert.show',
                'Show in workspace list'
              )}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

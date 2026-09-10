import React, { useState } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { CaretRight as ChevronRight, X } from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

import type { NewExternalWorktreeInboxPreview } from './new-external-worktrees-inbox-candidates'

type NewExternalWorktreesInboxLineProps = {
  repoDisplayName: string
  inboxWorktrees: readonly NewExternalWorktreeInboxPreview[]
  pending: boolean
  error: string | null
  onImportWorktree?: (worktreeId: string) => void
  onKeepHidden?: () => void
  onImportAll?: () => void
  onSuppress?: () => void
  className?: string
}

export default function NewExternalWorktreesInboxLine({
  repoDisplayName,
  inboxWorktrees,
  pending,
  error,
  onImportWorktree,
  onKeepHidden,
  onImportAll,
  onSuppress,
  className
}: NewExternalWorktreesInboxLineProps): React.JSX.Element | null {
  const [isExpanded, setIsExpanded] = useState(false)
  const inboxCount = inboxWorktrees.length
  const suppressLabel = translate(
    'auto.components.sidebar.NewExternalWorktreesInboxLine.c3e8a1f4b2',
    "Don't show again"
  )
  const suppressAriaLabel = translate(
    'auto.components.sidebar.NewExternalWorktreesInboxLine.9f2d4c8b17',
    'Hide external worktrees permanently for {{value0}}',
    { value0: repoDisplayName }
  )

  if (inboxCount === 0) {
    return null
  }

  return (
    <section
      aria-busy={pending}
      className={cn('mx-1 my-0.5 ml-3 text-sidebar-foreground', className)}
    >
      <div
        className={cn(
          'group flex min-h-7 min-w-0 items-center gap-1.5 px-1.5 text-[11px] leading-none text-muted-foreground transition-colors rounded-md',
          'hover:bg-accent hover:text-accent-foreground'
        )}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          disabled={pending}
          aria-expanded={isExpanded}
          aria-label={
            isExpanded
              ? translate(
                  'auto.components.sidebar.NewExternalWorktreesInboxLine.d9f7b2a14c',
                  'Collapse new externally-created worktrees for {{value0}}',
                  { value0: repoDisplayName }
                )
              : translate(
                  'auto.components.sidebar.NewExternalWorktreesInboxLine.e2c4a8d91f',
                  'Expand new externally-created worktrees for {{value0}}',
                  { value0: repoDisplayName }
                )
          }
          onClick={() => setIsExpanded((value) => !value)}
          className="text-muted-foreground"
        >
          <ChevronRight
            className={cn('size-3 transition-transform', isExpanded && 'rotate-90')}
            aria-hidden="true"
          />
        </Button>
        <span className="min-w-0 flex-1 truncate">
          {translate(
            'auto.components.sidebar.NewExternalWorktreesInboxLine.7c4e9b2a81',
            'New externally-created worktrees'
          )}
        </span>
        <span className="relative inline-grid size-6 shrink-0 place-items-center">
          <span
            className={cn(
              'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full border border-border px-1.5 text-[10px] font-medium leading-none text-muted-foreground transition-opacity',
              onSuppress &&
                'can-hover:group-hover:opacity-0 can-hover:group-focus-within:opacity-0 [@media(hover:none)]:opacity-0'
            )}
          >
            {inboxCount}
          </span>
          {onSuppress ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    disabled={pending}
                    aria-label={suppressAriaLabel}
                    onClick={onSuppress}
                    className="text-muted-foreground can-hover:pointer-events-none can-hover:opacity-0 can-hover:group-hover:pointer-events-auto can-hover:group-hover:opacity-100 can-hover:group-focus-within:pointer-events-auto can-hover:group-focus-within:opacity-100 absolute inset-0"
                  >
                    <X className="size-3" aria-hidden="true" />
                  </Button>
                }
              />
              <TooltipContent side="top" sideOffset={4}>
                {suppressLabel}
              </TooltipContent>
            </Tooltip>
          ) : null}
        </span>
      </div>

      {isExpanded ? (
        <div className="border-sidebar-border mt-0.5 ml-4 border-l pb-1 pl-2">
          <p className="text-muted-foreground px-1.5 py-1 text-[10px] leading-4">
            {translate(
              'auto.components.sidebar.NewExternalWorktreesInboxLine.4d7a1c9e53',
              'These worktrees were created outside of AgentStart.'
            )}
          </p>
          <ul className="grid gap-0.5">
            {inboxWorktrees.map((worktree) => (
              <li
                key={worktree.id ?? worktree.path ?? worktree.displayName}
                className="hover:bg-accent flex min-h-7 min-w-0 items-center gap-2 px-1.5 py-1 text-xs"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{worktree.displayName}</div>
                  {worktree.path ? (
                    <div className="text-muted-foreground truncate font-mono text-[10px]">
                      {worktree.path}
                    </div>
                  ) : null}
                </div>
                {onImportWorktree && worktree.id ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    disabled={pending}
                    onClick={() => onImportWorktree(worktree.id!)}
                  >
                    {translate(
                      'auto.components.sidebar.NewExternalWorktreesInboxLine.8b3f2e1d74',
                      'Import'
                    )}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
          <div className="grid gap-1 px-1.5 pt-1 pb-1">
            <div className="flex flex-wrap gap-1.5">
              {onKeepHidden ? (
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  disabled={pending}
                  onClick={onKeepHidden}
                >
                  {translate(
                    'auto.components.sidebar.NewExternalWorktreesInboxLine.1c9e7a4b28',
                    'Keep hidden'
                  )}
                </Button>
              ) : null}
              {onImportAll ? (
                <Button
                  type="button"
                  variant="default"
                  size="xs"
                  disabled={pending}
                  onClick={onImportAll}
                >
                  {translate(
                    'auto.components.sidebar.NewExternalWorktreesInboxLine.6f2d8c1e95',
                    'Import all'
                  )}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="text-destructive px-1.5 pt-0.5 pb-1 text-[11px] leading-4" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  )
}

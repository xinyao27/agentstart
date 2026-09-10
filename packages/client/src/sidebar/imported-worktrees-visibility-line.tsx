import { normalizeRuntimePathForComparison } from '@agentstart/protocol/host/path'
import React, { useState } from 'react'
import { getExternalWorktreeParentPath } from '~renderer/external-worktree-visibility'
import { translate } from '~renderer/i18n/i18n'
import { CaretRight as ChevronRight, X } from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

type ImportedWorktreesVisibilityPlacement = 'repo-group' | 'pinned-fallback'

type ImportedWorktreeVisibilityPreview = {
  id?: string
  displayName: string
  path?: string
  branch?: string
}

type ImportedWorktreesVisibilityLineProps = {
  repoDisplayName: string
  hiddenWorktrees: readonly ImportedWorktreeVisibilityPreview[]
  placement: ImportedWorktreesVisibilityPlacement
  pending: boolean
  error: string | null
  onShow?: () => void
  onKeepHidden?: () => void
  className?: string
}

const PREVIEW_LIMIT = 3
const KEEP_HIDDEN_LABEL = 'Keep hidden - recover from the project menu'
const GROUP_LIMIT = 5

type ImportedWorktreePathGroup = {
  path: string
  worktrees: ImportedWorktreeVisibilityPreview[]
}

function pluralizeWorktree(count: number): string {
  return count === 1 ? 'worktree' : 'worktrees'
}

function getWorktreeKey(
  worktree: ImportedWorktreeVisibilityPreview,
  index: number,
  prefix: string
): string {
  return worktree.id ?? worktree.path ?? `${prefix}-${worktree.displayName}-${index}`
}

function getParentPath(path: string | undefined): string {
  return getExternalWorktreeParentPath(path)
}

function groupWorktreesByParentPath(
  worktrees: readonly ImportedWorktreeVisibilityPreview[]
): ImportedWorktreePathGroup[] {
  const groups: ImportedWorktreePathGroup[] = []
  const groupByPath = new Map<string, ImportedWorktreePathGroup>()
  for (const worktree of worktrees) {
    const path = getParentPath(worktree.path)
    const existing = groupByPath.get(path)
    if (existing) {
      existing.worktrees.push(worktree)
      continue
    }
    const group = { path, worktrees: [worktree] }
    groupByPath.set(path, group)
    groups.push(group)
  }
  return groups
}

export default function ImportedWorktreesVisibilityLine({
  repoDisplayName,
  hiddenWorktrees,
  placement,
  pending,
  error,
  onShow,
  onKeepHidden,
  className
}: ImportedWorktreesVisibilityLineProps): React.JSX.Element | null {
  const [isExpanded, setIsExpanded] = useState(false)
  const [expandedGroupPathKeys, setExpandedGroupPathKeys] = useState<Set<string>>(new Set())
  const hiddenCount = hiddenWorktrees.length
  const worktreeNoun = pluralizeWorktree(hiddenCount)
  const worktreeGroups = groupWorktreesByParentPath(hiddenWorktrees)
  const visibleWorktreeGroups = worktreeGroups.slice(0, GROUP_LIMIT)
  const remainingGroupCount = Math.max(0, worktreeGroups.length - visibleWorktreeGroups.length)
  const keepHiddenAriaLabel = `Keep ${hiddenCount} discovered ${worktreeNoun} hidden for ${repoDisplayName}; recover from the project menu`

  if (hiddenCount === 0) {
    return null
  }

  const lineText =
    placement === 'pinned-fallback'
      ? `Hiding ${hiddenCount} discovered ${worktreeNoun} in ${repoDisplayName}`
      : `Hiding ${hiddenCount} discovered ${worktreeNoun}`

  const toggleGroupExpanded = (path: string): void => {
    const key = normalizeRuntimePathForComparison(path)
    setExpandedGroupPathKeys((previous) => {
      const next = new Set(previous)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  return (
    <section
      aria-busy={pending}
      className={cn('mx-1 my-0.5 ml-3 text-sidebar-foreground', className)}
    >
      <div
        className={cn(
          'flex min-h-7 min-w-0 items-center gap-1.5 px-1.5 text-[11px] leading-none text-muted-foreground transition-colors rounded-md',
          'hover:bg-accent hover:text-accent-foreground'
        )}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          disabled={pending}
          aria-expanded={isExpanded}
          aria-label={translate(
            'auto.components.sidebar.ImportedWorktreesVisibilityLine.f54f2bec5d',
            '{{value0}} hidden worktrees for {{value1}}',
            { value0: isExpanded ? 'Collapse' : 'Expand', value1: repoDisplayName }
          )}
          onClick={() => setIsExpanded((value) => !value)}
          className="text-muted-foreground"
        >
          <ChevronRight
            className={cn('size-3 transition-transform', isExpanded && 'rotate-90')}
            aria-hidden="true"
          />
        </Button>
        <span className="min-w-0 flex-1 truncate">{lineText}</span>
        {onKeepHidden ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  disabled={pending}
                  aria-label={keepHiddenAriaLabel}
                  onClick={onKeepHidden}
                  className="text-muted-foreground"
                >
                  <X className="size-3" aria-hidden="true" />
                </Button>
              }
            />
            <TooltipContent side="top" sideOffset={4}>
              {KEEP_HIDDEN_LABEL}
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>

      {isExpanded ? (
        <div
          className="border-sidebar-border mt-0.5 ml-4 grid gap-1 border-l pb-1 pl-2"
          aria-label={translate(
            'auto.components.sidebar.ImportedWorktreesVisibilityLine.2251d41ebb',
            'Hidden worktree groups'
          )}
        >
          {visibleWorktreeGroups.map((group) => (
            <div key={group.path} className="grid min-w-0 gap-0.5 rounded-md px-1.5 py-1">
              <div className="flex min-h-7 min-w-0 items-center gap-1.5">
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <span
                        tabIndex={0}
                        className="text-muted-foreground block min-w-0 flex-1 truncate font-mono text-[10px] leading-4 outline-none"
                      >
                        {group.path}
                      </span>
                    }
                  />
                  <TooltipContent side="top" sideOffset={4}>
                    {group.path}
                  </TooltipContent>
                </Tooltip>
                <span className="border-sidebar-border text-muted-foreground shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] leading-none">
                  {group.worktrees.length}
                </span>
              </div>
              <ul
                className="text-muted-foreground marker:text-muted-foreground list-disc space-y-0.5 py-0 pr-2 pl-5 text-xs"
                aria-label={translate(
                  'auto.components.sidebar.ImportedWorktreesVisibilityLine.b47ba1a9d2',
                  '{{value0}} preview',
                  { value0: group.path }
                )}
              >
                {group.worktrees
                  .slice(
                    0,
                    expandedGroupPathKeys.has(normalizeRuntimePathForComparison(group.path))
                      ? group.worktrees.length
                      : PREVIEW_LIMIT
                  )
                  .map((worktree, index) => (
                    <li
                      key={getWorktreeKey(worktree, index, 'preview')}
                      className="min-h-6 min-w-0 py-0.5 pl-0"
                    >
                      <span className="block min-w-0 truncate font-medium">
                        {worktree.displayName}
                      </span>
                    </li>
                  ))}
                {group.worktrees.length > PREVIEW_LIMIT ? (
                  <li className="list-none">
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      disabled={pending}
                      onClick={() => toggleGroupExpanded(group.path)}
                      className="text-muted-foreground justify-start px-0 text-[11px] font-normal"
                    >
                      {expandedGroupPathKeys.has(normalizeRuntimePathForComparison(group.path))
                        ? translate(
                            'auto.components.sidebar.ImportedWorktreesVisibilityLine.294de4aeb2',
                            'Show fewer'
                          )
                        : translate(
                            'auto.components.sidebar.ImportedWorktreesVisibilityLine.5a9688802a',
                            'Show {{value0}} more',
                            { value0: group.worktrees.length - PREVIEW_LIMIT }
                          )}
                    </Button>
                  </li>
                ) : null}
              </ul>
            </div>
          ))}
          {remainingGroupCount > 0 ? (
            <div className="text-muted-foreground py-1 pr-2 pl-7 text-[11px] leading-4">
              + {remainingGroupCount}{' '}
              {translate(
                'auto.components.sidebar.ImportedWorktreesVisibilityLine.b2bc47c080',
                'more locations'
              )}
            </div>
          ) : null}
          <div className="grid gap-1 px-1.5 pt-1 pb-1">
            <p className="bg-sidebar-accent text-sidebar-accent-foreground rounded-md px-2 py-1 text-[10px] leading-4 font-medium">
              {translate(
                'auto.components.sidebar.ImportedWorktreesVisibilityLine.9f4f14e821',
                'Change this later from the project menu.'
              )}
            </p>
            <div className="flex min-w-0 items-center gap-1.5">
              {onKeepHidden ? (
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  disabled={pending}
                  onClick={onKeepHidden}
                  className="text-[11px]"
                >
                  {translate(
                    'auto.components.sidebar.ImportedWorktreesVisibilityLine.ad99f4eea9',
                    'Keep hidden'
                  )}
                </Button>
              ) : null}
              {onShow ? (
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  disabled={pending}
                  onClick={onShow}
                  className="text-[11px]"
                >
                  {translate(
                    'auto.components.sidebar.ImportedWorktreesVisibilityLine.b7a87dc32f',
                    'Show in worktree list'
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

export type { ImportedWorktreesVisibilityLineProps }

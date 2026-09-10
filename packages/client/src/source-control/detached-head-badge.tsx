import React from 'react'
import { GitCommit as GitCommitHorizontal } from '~renderer/icons/hugeicons'
import { Badge } from '~renderer/ui/badge'
import { cn } from '~renderer/ui/class-names'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'
import type { WorktreeGitIdentityDisplay } from '~renderer/worktree/git-identity-display'

type DetachedHeadDisplay = Extract<WorktreeGitIdentityDisplay, { kind: 'detached' }>

type DetachedHeadBadgeProps = {
  display: DetachedHeadDisplay
  label?: 'sidebar' | 'source-control'
  side?: React.ComponentProps<typeof TooltipContent>['side']
  className?: string
}

export function DetachedHeadBadge({
  display,
  label = 'source-control',
  side = 'right',
  className
}: DetachedHeadBadgeProps): React.JSX.Element {
  const visibleLabel = label === 'sidebar' ? display.sidebarLabel : display.sourceControlLabel

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Badge
            variant="outline"
            className={cn(
              'h-[18px] shrink-0 gap-1 px-1.5 text-[10px] font-medium leading-none rounded',
              'border-[color:color-mix(in_srgb,var(--git-decoration-modified)_30%,transparent)] bg-[color:color-mix(in_srgb,var(--git-decoration-modified)_8%,transparent)] text-[color:var(--git-decoration-modified)]',
              className
            )}
          >
            <GitCommitHorizontal className="size-2.5" />
            {visibleLabel}
          </Badge>
        }
      />
      <TooltipContent side={side} sideOffset={8}>
        {display.tooltip}
      </TooltipContent>
    </Tooltip>
  )
}

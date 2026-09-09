import type { GitHubRepositoryIdentity } from '@yiru/protocol/hosted-review/pull-request-types'
import React from 'react'
import { GitFork } from '~renderer/icons/hugeicons'
import { cn } from '~renderer/ui/class-names'

import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'

/**
 * Small muted glyph marking a repo as a fork, with a "Fork of owner/repo"
 * tooltip. Renders nothing when the repo has no resolved upstream.
 */
export function RepoForkIndicator({
  upstream,
  className
}: {
  upstream: GitHubRepositoryIdentity | null | undefined
  className?: string
}): React.JSX.Element | null {
  if (!upstream) {
    return null
  }
  const label = `Fork of ${upstream.owner}/${upstream.repo}`
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className={cn('inline-flex shrink-0 items-center text-muted-foreground', className)}
            aria-label={label}
          >
            <GitFork className="size-3" aria-hidden="true" />
          </span>
        }
      />
      <TooltipContent side="top" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

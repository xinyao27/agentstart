import type { GitHistoryItemRef } from '@agentstart/protocol/git/history-types'
import React from 'react'
import { CloudCheck, GitBranch, GitCommit, Tag as TagIcon, Target } from '~renderer/icons/hugeicons'
import { cn } from '~renderer/ui/class-names'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

// Why: Git Graph uses one pill shape (`.gitRef`) for every ref kind and
// differentiates purely by an inset icon — never a separate shape per type —
// so this reads `category` off the verified GitHistoryItemRef contract
// instead of guessing the kind from a name prefix.
function refIcon(category: GitHistoryItemRef['category']): React.ComponentType<{
  className?: string
}> {
  switch (category) {
    case 'head':
      return Target
    case 'branches':
      return GitBranch
    case 'remote branches':
      return CloudCheck
    case 'tags':
      return TagIcon
    case 'commits':
    case undefined:
      return GitCommit
  }
}

export function GitGraphRefBadge({ itemRef }: { itemRef: GitHistoryItemRef }): React.JSX.Element {
  const Icon = refIcon(itemRef.category)
  const isActive = itemRef.isCheckedOut ?? false
  const label = itemRef.remoteName ? `${itemRef.remoteName}/${itemRef.name}` : itemRef.name
  const laneColor = itemRef.color ? `var(--${itemRef.color})` : undefined

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className={cn(
              'bg-muted/60 inline-flex h-[18px] max-w-[9rem] shrink-0 items-center overflow-hidden border text-[11px] leading-none',
              isActive ? 'border-current font-semibold' : 'border-border/75'
            )}
            style={isActive && laneColor ? { color: laneColor, borderColor: laneColor } : undefined}
          >
            <span
              className="flex h-full shrink-0 items-center justify-center px-0.5"
              style={{ backgroundColor: laneColor, color: 'var(--background)' }}
            >
              {React.createElement(Icon, { className: 'size-3' })}
            </span>
            <span className="text-foreground truncate px-1.5">{label}</span>
          </span>
        }
      />
      <TooltipContent side="bottom" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

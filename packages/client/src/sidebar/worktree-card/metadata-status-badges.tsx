import React from 'react'
import { translate } from '~renderer/i18n/i18n'
import {
  CheckCircle as CircleCheck,
  Circle as CircleDot,
  XCircle as CircleX,
  Clock,
  GitMerge
} from '~renderer/icons/hugeicons'
import { Badge } from '~renderer/ui/badge'
import { cn } from '~renderer/ui/class-names'

import type { WorktreeCardPrDisplay } from './pr-display'
import { PullRequestIcon, checksLabel } from './presentation'

function MetadataStatusBadge({
  label,
  children,
  className
}: {
  label: string
  children: React.ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <Badge
      variant="outline"
      className={cn(
        'h-4 gap-1 px-1.5 text-[9px] font-medium leading-none [&>svg]:size-2.5',
        className
      )}
    >
      {children}
      <span>{label}</span>
    </Badge>
  )
}

export function ReviewStateBadge({
  state
}: {
  state: WorktreeCardPrDisplay['state']
}): React.JSX.Element | null {
  if (!state) {
    return null
  }

  if (state === 'merged') {
    return (
      <MetadataStatusBadge
        label={translate(
          'auto.components.sidebar.WorktreeCardMetadataStatusBadges.f394b3e86e',
          'State: Merged'
        )}
        className="border-purple-500/25 bg-purple-500/5 text-purple-600 dark:text-purple-300"
      >
        <GitMerge />
      </MetadataStatusBadge>
    )
  }

  if (state === 'closed') {
    return (
      <MetadataStatusBadge
        label={translate(
          'auto.components.sidebar.WorktreeCardMetadataStatusBadges.e888362def',
          'State: Closed'
        )}
        className="border-rose-500/25 bg-rose-500/5 text-rose-600 dark:text-rose-300"
      >
        <CircleX />
      </MetadataStatusBadge>
    )
  }

  if (state === 'draft') {
    return (
      <MetadataStatusBadge
        label={translate(
          'auto.components.sidebar.WorktreeCardMetadataStatusBadges.2931b42b09',
          'State: Draft PR'
        )}
        className="border-border bg-muted/30 text-muted-foreground"
      >
        <CircleDot />
      </MetadataStatusBadge>
    )
  }

  return (
    <MetadataStatusBadge
      label={translate(
        'auto.components.sidebar.WorktreeCardMetadataStatusBadges.fe188062a1',
        'State: Open'
      )}
      className="border-emerald-500/25 bg-emerald-500/5 text-emerald-600 dark:text-emerald-300"
    >
      <PullRequestIcon />
    </MetadataStatusBadge>
  )
}

export function ReviewChecksBadge({
  status
}: {
  status: WorktreeCardPrDisplay['status']
}): React.JSX.Element | null {
  if (!status || status === 'neutral') {
    return null
  }

  const label = `Checks: ${checksLabel(status)}`

  if (status === 'success') {
    return (
      <MetadataStatusBadge
        label={label}
        className="border-emerald-500/25 bg-emerald-500/5 text-emerald-600 dark:text-emerald-300"
      >
        <CircleCheck />
      </MetadataStatusBadge>
    )
  }

  if (status === 'failure') {
    return (
      <MetadataStatusBadge
        label={label}
        className="border-rose-500/25 bg-rose-500/5 text-rose-600 dark:text-rose-300"
      >
        <CircleX />
      </MetadataStatusBadge>
    )
  }

  return (
    <MetadataStatusBadge
      label={label}
      className="border-amber-500/25 bg-amber-500/5 text-amber-600 dark:text-amber-300"
    >
      <Clock />
    </MetadataStatusBadge>
  )
}

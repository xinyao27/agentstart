import React from 'react'
import { AgentStateDot } from '~renderer/agent/status-dot'
import { cn } from '~renderer/ui/class-names'
import { getWorktreeStatusLabel, type WorktreeStatus } from '~renderer/worktree/status'

type Status = WorktreeStatus

type StatusIndicatorProps = React.ComponentProps<'span'> & {
  status: Status
}

export function StatusIndicator({
  status,
  className,
  title,
  ...rest
}: StatusIndicatorProps): React.JSX.Element {
  const resolvedTitle = title ?? getWorktreeStatusLabel(status)

  if (
    status === 'thinking' ||
    status === 'executing' ||
    status === 'waiting-decision' ||
    status === 'complete'
  ) {
    return (
      <span
        className={cn('inline-flex h-3 w-3 shrink-0 items-center justify-center', className)}
        title={resolvedTitle}
        {...rest}
      >
        <AgentStateDot state={status} />
      </span>
    )
  }

  return (
    <span
      className={cn('inline-flex h-3 w-3 shrink-0 items-center justify-center', className)}
      title={resolvedTitle}
      {...rest}
    >
      <span
        className={cn(
          'block size-2 rounded-full',
          status === 'active' ? 'bg-emerald-500' : 'bg-neutral-500/40'
        )}
      />
    </span>
  )
}

import React from 'react'
import { translate } from '~renderer/i18n/i18n'
import { CheckCircle as CircleCheck, Question } from '~renderer/icons/hugeicons'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { cn } from '~renderer/ui/class-names'

// Why: providers and retained legacy records still use the lower-level status
// union, but every live user-facing state must speak the four-phase vocabulary.
// Failures, interruptions, and idle records remain outcomes rather than phases.

export type AgentDotState =
  | 'working'
  | 'thinking'
  | 'executing'
  | 'blocked'
  | 'waiting'
  | 'waiting-decision'
  | 'interrupted'
  // Why: AI Vault subagent rows report a transcript-derived failure, which is
  // an outcome (like 'done'), not a live attention state like 'blocked'.
  | 'failed'
  | 'done'
  | 'complete'
  | 'idle'
  // Why: title-based legacy detection still emits permission before the
  // authoritative hook event arrives. It renders as the same waiting phase.
  | 'permission'

/** Return the accessible label shared by every visual agent-state marker. */
export function agentStateLabel(state: AgentDotState): string {
  switch (state) {
    case 'working':
      return translate('extension.agent.phase.thinking', 'Thinking')
    case 'thinking':
      return translate('extension.agent.phase.thinking', 'Thinking')
    case 'executing':
      return translate('extension.agent.phase.executing', 'Executing')
    case 'blocked':
    case 'waiting':
    case 'waiting-decision':
    case 'permission':
      return translate('extension.agent.phase.waitingDecision', 'Waiting for you')
    case 'interrupted':
      return translate('agent.status.interrupted', 'Interrupted')
    case 'failed':
      return translate('agent.status.failed', 'Failed')
    case 'done':
    case 'complete':
      return translate('extension.agent.phase.complete', 'Complete')
    case 'idle':
      return translate('agent.status.idle', 'Idle')
  }
}

type Props = {
  state: AgentDotState
  size?: 'sm' | 'md'
  className?: string
}

/** Render the compact state glyph used by agent rows and terminal tabs. */
export const AgentStateDot = function AgentStateDot({
  state,
  size = 'sm',
  className
}: Props): React.JSX.Element {
  const box = size === 'md' ? 'size-4' : 'size-2.5'
  const inner = size === 'md' ? 'size-2' : 'size-1.5'
  const icon = size === 'md' ? 'size-3' : 'size-2.5'
  // Why: configurable loaders have more internal whitespace than simple dots,
  // so they fill the status slot to remain legible in terminal tabs.
  const loader = size === 'md' ? 'size-4' : 'size-2.5'

  if (state === 'working' || state === 'thinking' || state === 'executing') {
    return (
      <span
        className={cn('inline-flex shrink-0 items-center justify-center', box, className)}
        aria-label={agentStateLabel(state)}
      >
        {/* Why: working is a loading state, so it follows the same user-selected
            indicator as every other in-flight surface. */}
        <LoadingIndicator
          className={cn(state === 'executing' ? 'text-violet-600' : 'text-blue-600', loader)}
        />
      </span>
    )
  }

  if (state === 'done' || state === 'complete') {
    // Why: the dashboard lists many agents, so a check glyph scans well for
    // agent-reported completion and keeps 'done' visually distinct from
    // 'idle' and other dot states at a glance. The sidebar's StatusIndicator
    // intentionally diverges (emerald dot + tooltip) — see file header.
    return (
      <span
        className={cn('inline-flex shrink-0 items-center justify-center', box, className)}
        aria-label={agentStateLabel(state)}
      >
        <CircleCheck className={cn('text-emerald-500', icon)} aria-hidden="true" />
      </span>
    )
  }

  if (
    state === 'blocked' ||
    state === 'permission' ||
    state === 'waiting' ||
    state === 'waiting-decision'
  ) {
    return (
      <span
        className={cn('inline-flex shrink-0 items-center justify-center', box, className)}
        aria-label={agentStateLabel(state)}
      >
        <Question className={cn('text-amber-500', icon)} aria-hidden="true" />
      </span>
    )
  }

  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center', box, className)}
      aria-label={agentStateLabel(state)}
    >
      <span
        className={cn(
          'block rounded-full',
          inner,
          state === 'interrupted' || state === 'failed' ? 'bg-red-500' : 'bg-neutral-500/40'
        )}
      />
    </span>
  )
}

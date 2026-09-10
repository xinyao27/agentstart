import type { AgentPhase } from '@agentstart/protocol/agent/phase'
import { translate } from '~renderer/i18n/i18n'
import { cn } from '~renderer/ui/class-names'

export function AgentPhaseLabel({
  phase,
  className
}: {
  className?: string
  phase?: AgentPhase | null
}): React.JSX.Element | null {
  if (!phase) {
    return null
  }
  return (
    <span
      className={cn(
        'flex shrink-0 items-center gap-1 text-[10px]',
        phase === 'waiting-decision' ? 'text-amber-600' : 'text-muted-foreground',
        className
      )}
    >
      <span className={cn('size-1.5', phaseDotColor(phase))} aria-hidden="true" />
      {agentPhaseLabel(phase)}
    </span>
  )
}

export function agentPhaseLabel(phase: AgentPhase): string {
  switch (phase) {
    case 'thinking':
      return translate('extension.agent.phase.thinking', 'Thinking')
    case 'executing':
      return translate('extension.agent.phase.executing', 'Executing')
    case 'waiting-decision':
      return translate('extension.agent.phase.waitingDecision', 'Waiting for you')
    case 'complete':
      return translate('extension.agent.phase.complete', 'Complete')
  }
}

function phaseDotColor(phase: AgentPhase): string {
  switch (phase) {
    case 'thinking':
      return 'bg-blue-600'
    case 'executing':
      return 'bg-violet-600'
    case 'waiting-decision':
      return 'bg-amber-600'
    case 'complete':
      return 'bg-green-600'
  }
}

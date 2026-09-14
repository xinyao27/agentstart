import { isTuiAgentEnabled } from '@agentstart/protocol/agent/selection'
import type { TuiAgent } from '@agentstart/protocol/agent/types'
import type React from 'react'
import { AgentIcon, type AgentCatalogEntry } from '~renderer/agent/catalog'
import { translate } from '~renderer/i18n/i18n'
import { Check, Terminal } from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'

type DefaultAgentPillProps = {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}

function DefaultAgentPill({ active, onClick, children }: DefaultAgentPillProps): React.JSX.Element {
  return (
    <Button
      variant="quiet"
      size="sm"
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'text-sm gap-2 py-1.5 ',
        active
          ? 'border-muted-foreground/40 bg-accent text-accent-foreground'
          : 'bg-background/50 hover:border-muted-foreground/35 '
      )}
    >
      {children}
    </Button>
  )
}

type DefaultAgentPickerProps = {
  defaultAgent: TuiAgent | 'blank' | null
  detectedIds: Set<TuiAgent> | null
  disabledAgents: string[]
  enabledDetectedAgents: AgentCatalogEntry[]
  onSetDefault: (id: TuiAgent | 'blank' | null) => void
}

/** Pill row choosing which detected agent (or none) launches by default. */
export function DefaultAgentPicker({
  defaultAgent,
  detectedIds,
  disabledAgents,
  enabledDetectedAgents,
  onSetDefault
}: DefaultAgentPickerProps): React.JSX.Element {
  // Why: 'blank' is an explicit no-agent preference, not an auto fallback,
  // so the Auto pill should only light up when the default is null OR when a
  // selected agent id is no longer detected on PATH.
  const isAutoDefault =
    defaultAgent === null ||
    (defaultAgent !== 'blank' &&
      (!detectedIds?.has(defaultAgent) || !isTuiAgentEnabled(defaultAgent, disabledAgents)))
  const isBlankDefault = defaultAgent === 'blank'

  return (
    <div className="flex flex-wrap gap-2">
      <DefaultAgentPill active={isAutoDefault} onClick={() => onSetDefault(null)}>
        {isAutoDefault && <Check className="size-3.5" />}
        {translate('auto.components.settings.AgentsPane.92033495ff', 'Auto')}
      </DefaultAgentPill>

      {/* Why: users who prefer to open a raw shell by default need a
          first-class "no agent" choice here — without it, the Auto pill
          is the closest option but silently launches the first detected
          agent, which is the opposite of what they want. */}
      <DefaultAgentPill active={isBlankDefault} onClick={() => onSetDefault('blank')}>
        <Terminal className="size-3.5" />
        {translate('auto.components.settings.AgentsPane.110b74b022', 'No agent (blank terminal)')}
        {isBlankDefault && <Check className="size-3.5" />}
      </DefaultAgentPill>

      {enabledDetectedAgents.map((agent) => {
        const isActive = defaultAgent === agent.id
        return (
          <DefaultAgentPill key={agent.id} active={isActive} onClick={() => onSetDefault(agent.id)}>
            <AgentIcon agent={agent.id} size={14} />
            {agent.label}
            {isActive && <Check className="size-3.5" />}
          </DefaultAgentPill>
        )
      })}
    </div>
  )
}

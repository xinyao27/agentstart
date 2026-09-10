import { filterEnabledTuiAgents } from '@agentstart/protocol/agent/selection'
import type { TuiAgent } from '@agentstart/protocol/agent/types'
import React from 'react'
import { getAgentCatalog } from '~renderer/agent/catalog'
import AgentCombobox from '~renderer/agent/combobox'
import { translate } from '~renderer/i18n/i18n'
import { GearSix as Settings2 } from '~renderer/icons/hugeicons'
import { useAppStore } from '~renderer/store/state'
import { Button } from '~renderer/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

type AgentSectionProps = {
  quickAgent: TuiAgent | null
  onQuickAgentChange: (agent: TuiAgent | null) => void
  detectedAgentIds: Set<TuiAgent> | null
  onOpenAgentSettings: () => void
  createDisabled: boolean
  onCreate: () => void
}

export function AgentSection({
  quickAgent,
  onQuickAgentChange,
  detectedAgentIds,
  onOpenAgentSettings,
  createDisabled,
  onCreate
}: AgentSectionProps): React.JSX.Element {
  const defaultTuiAgent = useAppStore((s) => s.settings?.defaultTuiAgent ?? null)
  const disabledTuiAgents = useAppStore((s) => s.settings?.disabledTuiAgents ?? [])
  const updateSettings = useAppStore((s) => s.updateSettings)

  const visibleQuickAgents = (() => {
    const enabledIds = new Set(
      filterEnabledTuiAgents(
        getAgentCatalog().map((agent) => agent.id),
        disabledTuiAgents
      )
    )
    return getAgentCatalog().filter(
      (agent) =>
        enabledIds.has(agent.id) && (detectedAgentIds === null || detectedAgentIds.has(agent.id))
    )
  })()

  const handleSetDefaultAgent = (next: TuiAgent | 'blank' | null) => {
    updateSettings({ defaultTuiAgent: next })
  }

  return (
    <div className="space-y-1" data-contextual-tour-target="workspace-creation-agent">
      <div className="flex items-center justify-between gap-2">
        <label className="text-muted-foreground text-xs font-medium">
          {translate('auto.components.NewWorkspaceComposerCard.01d1e8f601', 'Agent')}
        </label>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="quiet"
                size="icon-xs"
                onClick={onOpenAgentSettings}
                // Why: keep Tab flow Name → Agent combobox. This settings
                // shortcut is a detour; making it tabbable forces a keystroke
                // on every workspace creation.
                tabIndex={-1}
                className="size-5 shrink-0"
                aria-label={translate(
                  'auto.components.NewWorkspaceComposerCard.ab63f25397',
                  'Open agent settings'
                )}
              >
                <Settings2 className="size-3" />
              </Button>
            }
          />
          <TooltipContent side="top" sideOffset={6}>
            {translate('auto.components.NewWorkspaceComposerCard.ba64270bdb', 'Configure agents')}
          </TooltipContent>
        </Tooltip>
      </div>
      <AgentCombobox
        agents={visibleQuickAgents}
        value={quickAgent}
        onValueChange={onQuickAgentChange}
        onOpenManageAgents={onOpenAgentSettings}
        defaultAgent={defaultTuiAgent}
        onSetDefault={handleSetDefaultAgent}
        triggerClassName="h-9 w-full border-input text-sm focus:border-ring    "
        onTriggerEnter={createDisabled ? undefined : onCreate}
      />
    </div>
  )
}

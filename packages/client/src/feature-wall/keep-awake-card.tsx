import type { GlobalSettings } from '@agentstart/protocol/settings/global/model'
import type { JSX } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { Switch } from '~renderer/ui/switch'

import { getAgentAwakeDescription, getAgentAwakeTitle } from '../settings/agent/awake-copy'

export function KeepAwakeCard(props: {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
}): JSX.Element {
  const { settings, updateSettings } = props
  const enabled = settings.keepComputerAwakeWhileAgentsRun
  const title = getAgentAwakeTitle()
  return (
    <div className="border-border bg-muted/20 rounded-xl border p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 shrink space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-foreground text-[15px] leading-tight font-semibold">{title}</div>
            <span className="border-border bg-background text-muted-foreground rounded-full border px-2 py-0.5 text-[11px] font-medium">
              {translate('auto.components.feature.wall.KeepAwakeCard.209713d3c7', 'Optional')}
            </span>
          </div>
          <p className="text-muted-foreground text-[13px] leading-snug">
            {getAgentAwakeDescription()}
          </p>
        </div>
        <Switch
          aria-label={title}
          checked={enabled}
          onCheckedChange={(checked) =>
            updateSettings({ keepComputerAwakeWhileAgentsRun: checked })
          }
        />
      </div>
    </div>
  )
}

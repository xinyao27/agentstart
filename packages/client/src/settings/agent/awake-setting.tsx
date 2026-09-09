import type { GlobalSettings } from '@yiru/protocol/settings/global/model'
import { Label } from '~renderer/ui/label'
import { Switch } from '~renderer/ui/switch'

import { SearchableSetting } from '../searchable-setting'
import {
  getAgentAwakeDescription,
  getAgentAwakeSearchKeywords,
  getAgentAwakeTitle
} from './awake-copy'

type AgentAwakeSettingProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
}

export function AgentAwakeSetting({
  settings,
  updateSettings
}: AgentAwakeSettingProps): React.JSX.Element {
  const title = getAgentAwakeTitle()
  const description = getAgentAwakeDescription()

  return (
    <section className="space-y-3">
      <SearchableSetting
        title={title}
        description={description}
        keywords={getAgentAwakeSearchKeywords()}
      >
        <div className="flex items-start justify-between gap-4 py-2">
          <div className="min-w-0 flex-1 space-y-0.5">
            <Label>{title}</Label>
            <p className="text-muted-foreground text-xs">{description}</p>
          </div>
          <Switch
            aria-label={title}
            checked={settings.keepComputerAwakeWhileAgentsRun}
            onCheckedChange={(checked) =>
              updateSettings({
                keepComputerAwakeWhileAgentsRun: checked
              })
            }
          />
        </div>
      </SearchableSetting>
    </section>
  )
}

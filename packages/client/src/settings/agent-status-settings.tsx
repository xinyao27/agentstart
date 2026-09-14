import {
  getAgentGeneratedTabTitlesDescription,
  getAgentGeneratedTabTitlesTitle
} from './agent/generated-tab-title-copy'
import { getAgentStatusHooksDescription, getAgentStatusHooksTitle } from './agent/status-hooks-copy'
import type { AgentsPaneProps } from './agents-pane-types'
import { SettingsSwitchRow } from './form-controls'

export function AgentStatusHooksSetting({
  settings,
  updateSettings
}: AgentsPaneProps): React.JSX.Element {
  const enabled = settings.agentStatusHooksEnabled !== false
  return (
    <div className="divide-border/40 divide-y">
      <SettingsSwitchRow
        label={getAgentStatusHooksTitle()}
        description={getAgentStatusHooksDescription()}
        checked={enabled}
        onChange={() =>
          updateSettings({
            agentStatusHooksEnabled: !enabled
          })
        }
        ariaLabel={getAgentStatusHooksTitle()}
      />
    </div>
  )
}

export function AgentGeneratedTabTitlesSetting({
  settings,
  updateSettings
}: AgentsPaneProps): React.JSX.Element {
  const enabled = settings.tabAutoGenerateTitle === true
  return (
    <div className="divide-border/40 divide-y">
      <SettingsSwitchRow
        label={getAgentGeneratedTabTitlesTitle()}
        description={getAgentGeneratedTabTitlesDescription()}
        checked={enabled}
        onChange={() =>
          updateSettings({
            tabAutoGenerateTitle: !enabled
          })
        }
        ariaLabel={getAgentGeneratedTabTitlesTitle()}
      />
    </div>
  )
}

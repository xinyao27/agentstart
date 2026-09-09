import type { GlobalSettings } from '@yiru/protocol/settings/global/model'
import { translate } from '~renderer/i18n/i18n'
import { useAppStore } from '~renderer/store/state'
import { Switch } from '~renderer/ui/switch'

import { Label } from '../ui/label'
import {
  MAX_AGENT_HIBERNATION_IDLE_MS,
  MIN_AGENT_HIBERNATION_IDLE_MS,
  getEffectiveAgentHibernationIdleMs
} from './agent/hibernation-planner'
import { getExperimentalPaneSearchEntries, getExperimentalSearchEntry } from './experimental-search'
import { NumberField, SettingsSwitch } from './form-controls'
import { HiddenExperimentalGroup } from './hidden-experimental-group'
import { matchesSettingsSearch } from './search'
import { SearchableSetting } from './searchable-setting'

export { getExperimentalPaneSearchEntries }

const MS_PER_MINUTE = 60 * 1000

type ExperimentalPaneProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
  /** Hidden-experimental group is only rendered once the user has unlocked
   *  it via Shift-clicking the Experimental sidebar entry. */
  hiddenExperimentalUnlocked?: boolean
}

export function ExperimentalPane({
  settings,
  updateSettings,
  hiddenExperimentalUnlocked = false
}: ExperimentalPaneProps): React.JSX.Element {
  const searchQuery = useAppStore((s) => s.settingsSearchQuery)
  const showTerminalAttention = matchesSettingsSearch(searchQuery, [
    getExperimentalSearchEntry().terminalAttention
  ])
  const showAgentHibernation = matchesSettingsSearch(searchQuery, [
    getExperimentalSearchEntry().agentHibernation
  ])
  const agentHibernationEnabled = settings.experimentalAgentHibernation === true
  // Why: the planner owns ms-based bounds/defaults; the UI edits minutes
  // while displaying the same effective clamped value the planner will use.
  const agentHibernationIdleMinutes = Math.round(
    getEffectiveAgentHibernationIdleMs(settings.agentHibernationIdleMs) / MS_PER_MINUTE
  )

  return (
    <div className="space-y-4">
      {showTerminalAttention ? (
        <SearchableSetting
          title={translate(
            'auto.components.settings.ExperimentalPane.ec897e8d89',
            'Terminal attention'
          )}
          description={translate(
            'auto.components.settings.ExperimentalPane.88b7613afb',
            'Persistent pane highlight for terminal bell and agent-completion events.'
          )}
          keywords={getExperimentalSearchEntry().terminalAttention.keywords}
          className="space-y-3 py-2"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 shrink space-y-0.5">
              <Label>
                {translate(
                  'auto.components.settings.ExperimentalPane.ec897e8d89',
                  'Terminal attention'
                )}
              </Label>
              <p className="text-muted-foreground text-xs">
                {translate(
                  'auto.components.settings.ExperimentalPane.a20d5ea365',
                  'Keeps a pane-level highlight visible after terminal bell or agent-completion events until you interact with that pane. Experimental while we tune the signal.'
                )}
              </p>
            </div>
            <Switch
              checked={settings.experimentalTerminalAttention}
              onCheckedChange={(checked) =>
                updateSettings({ experimentalTerminalAttention: checked })
              }
            />
          </div>
        </SearchableSetting>
      ) : null}

      {showAgentHibernation ? (
        <SearchableSetting
          title={translate(
            'auto.components.settings.ExperimentalPane.agentHibernation.title',
            'Agent sleep'
          )}
          description={translate(
            'auto.components.settings.ExperimentalPane.agentHibernation.description',
            'Stops idle background agent terminals after the configured idle window and resumes supported sessions when you open them again.'
          )}
          keywords={getExperimentalSearchEntry().agentHibernation.keywords}
          className="space-y-3 py-2"
          id="experimental-agent-hibernation"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 shrink space-y-0.5">
              <Label>
                {translate(
                  'auto.components.settings.ExperimentalPane.agentHibernation.title',
                  'Agent sleep'
                )}
              </Label>
              <p className="text-muted-foreground text-xs">
                {translate(
                  'auto.components.settings.ExperimentalPane.agentHibernation.copy',
                  'Stops idle background agent terminals after the configured idle window and resumes supported sessions when you open them again. Agent sleep preserves launch options for agents started by Yiru. Manually started agents may resume with your current Yiru defaults. Experimental while we tune the safety model.'
                )}
              </p>
            </div>
            <SettingsSwitch
              checked={agentHibernationEnabled}
              ariaLabel={translate(
                'auto.components.settings.ExperimentalPane.agentHibernation.toggleLabel',
                'Toggle agent sleep'
              )}
              onChange={() =>
                updateSettings({
                  experimentalAgentHibernation: !agentHibernationEnabled
                })
              }
            />
          </div>
          {agentHibernationEnabled ? (
            <NumberField
              label={translate(
                'auto.components.settings.ExperimentalPane.agentHibernation.idleMinutesLabel',
                'Sleep after'
              )}
              description={translate(
                'auto.components.settings.ExperimentalPane.agentHibernation.idleMinutesDescription',
                'How many idle minutes a completed background agent must wait before Yiru can sleep it.'
              )}
              value={agentHibernationIdleMinutes}
              min={MIN_AGENT_HIBERNATION_IDLE_MS / MS_PER_MINUTE}
              max={MAX_AGENT_HIBERNATION_IDLE_MS / MS_PER_MINUTE}
              step={1}
              suffix={translate(
                'auto.components.settings.ExperimentalPane.agentHibernation.idleMinutesSuffix',
                'minutes'
              )}
              onChange={(minutes) =>
                updateSettings({
                  // Why: settings persist the planner contract, not the display unit.
                  agentHibernationIdleMs: minutes * MS_PER_MINUTE
                })
              }
            />
          ) : null}
        </SearchableSetting>
      ) : null}

      {hiddenExperimentalUnlocked ? <HiddenExperimentalGroup /> : null}
    </div>
  )
}

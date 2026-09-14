import type { GlobalSettings } from '@agentstart/protocol/settings/global/model'
import { translate } from '~renderer/i18n/i18n'
import { Lightning, Moon } from '~renderer/icons/hugeicons'
import { Switch } from '~renderer/ui/switch'

import { Label } from '../ui/label'
import {
  MAX_AGENT_HIBERNATION_IDLE_MS,
  MIN_AGENT_HIBERNATION_IDLE_MS,
  getEffectiveAgentHibernationIdleMs
} from './agent/hibernation-planner'
import { getExperimentalSearchEntry } from './experimental-search'
import { NumberField, SettingsSwitch } from './form-controls'
import { SettingsGroupCards } from './group-card'
import { HiddenExperimentalGroup } from './hidden-experimental-group'

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
  const agentHibernationEnabled = settings.experimentalAgentHibernation === true
  // Why: the planner owns ms-based bounds/defaults; the UI edits minutes
  // while displaying the same effective clamped value the planner will use.
  const agentHibernationIdleMinutes = Math.round(
    getEffectiveAgentHibernationIdleMs(settings.agentHibernationIdleMs) / MS_PER_MINUTE
  )

  return (
    <div className="space-y-4">
      <SettingsGroupCards
        defaultOpenId="experimental-terminal-attention"
        groups={[
          {
            id: 'experimental-terminal-attention',
            icon: <Lightning aria-hidden="true" />,
            title: translate(
              'auto.components.settings.ExperimentalPane.ec897e8d89',
              'Terminal attention'
            ),
            summary: translate(
              'auto.components.settings.ExperimentalPane.88b7613afb',
              'Persistent pane highlight for terminal bell and agent-completion events.'
            ),
            searchEntries: [getExperimentalSearchEntry().terminalAttention],
            content: (
              <div className="divide-border/40 divide-y">
                <div className="flex items-start justify-between gap-4 py-3">
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
              </div>
            )
          },
          {
            id: 'experimental-agent-sleep',
            icon: <Moon aria-hidden="true" />,
            title: translate(
              'auto.components.settings.ExperimentalPane.agentHibernation.title',
              'Agent sleep'
            ),
            summary: translate(
              'auto.components.settings.ExperimentalPane.agentHibernation.description',
              'Stops idle background agent terminals after the configured idle window and resumes supported sessions when you open them again.'
            ),
            searchEntries: [getExperimentalSearchEntry().agentHibernation],
            content: (
              // Why: deep links and search scroll to this anchor id.
              <div
                id="experimental-agent-hibernation"
                className="divide-border/40 scroll-mt-6 divide-y"
              >
                <div className="flex items-start justify-between gap-4 py-3">
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
                        'Stops idle background agent terminals after the configured idle window and resumes supported sessions when you open them again. Agent sleep preserves launch options for agents started by AgentStart. Manually started agents may resume with your current AgentStart defaults. Experimental while we tune the safety model.'
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
                      'How many idle minutes a completed background agent must wait before AgentStart can sleep it.'
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
              </div>
            )
          }
        ]}
      />

      {hiddenExperimentalUnlocked ? <HiddenExperimentalGroup /> : null}
    </div>
  )
}

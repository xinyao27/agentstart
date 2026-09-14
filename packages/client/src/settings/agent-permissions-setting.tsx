import type { AgentPermissionMode } from '@agentstart/protocol/agent/launch/permissions'
import { translate } from '~renderer/i18n/i18n'

import type { AgentPermissionsSettingProps } from './agents-pane-types'
import { SettingsSegmentedControl } from './form-controls'

export function AgentPermissionsSetting({
  mode,
  onChange
}: AgentPermissionsSettingProps): React.JSX.Element {
  const visibleMode: Exclude<AgentPermissionMode, 'mixed'> = mode === 'manual' ? 'manual' : 'yolo'
  // Why: the card header in AgentsPane carries the title/summary; this body
  // keeps only the explanatory copy next to the Yolo/Manual control.
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <p className="text-muted-foreground min-w-0 flex-1 text-xs">
        {translate(
          'auto.components.settings.AgentsPane.agentPermissionsDescription',
          'Choose whether AgentStart launches agents with fewer permission prompts or with manual checks.'
        )}{' '}
        {translate(
          'auto.components.settings.AgentsPane.agentPermissionsTooltip',
          "Doesn't apply to agents where you've overridden launch arguments."
        )}
      </p>
      <div className="shrink-0">
        <SettingsSegmentedControl<AgentPermissionMode>
          value={visibleMode}
          onChange={(nextMode) => {
            if (nextMode !== 'mixed') {
              onChange(nextMode)
            }
          }}
          ariaLabel={translate(
            'auto.components.settings.AgentsPane.agentPermissions',
            'Agent Permissions'
          )}
          size="sm"
          options={[
            {
              value: 'yolo',
              label: translate('auto.components.settings.AgentsPane.agentPermissionsYolo', 'Yolo')
            },
            {
              value: 'manual',
              label: translate(
                'auto.components.settings.AgentsPane.agentPermissionsManual',
                'Manual'
              )
            }
          ]}
        />
      </div>
    </div>
  )
}

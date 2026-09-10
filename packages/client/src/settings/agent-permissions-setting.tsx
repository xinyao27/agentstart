import type { AgentPermissionMode } from '@agentstart/protocol/agent/launch/permissions'
import { translate } from '~renderer/i18n/i18n'

import type { AgentPermissionsSettingProps } from './agents-pane-types'
import { SettingsSegmentedControl, SettingsSubsectionHeader } from './form-controls'

export function AgentPermissionsSetting({
  mode,
  onChange
}: AgentPermissionsSettingProps): React.JSX.Element {
  const visibleMode: Exclude<AgentPermissionMode, 'mixed'> = mode === 'manual' ? 'manual' : 'yolo'
  return (
    <section className="space-y-3">
      <SettingsSubsectionHeader
        title={translate(
          'auto.components.settings.AgentsPane.agentPermissions',
          'Agent Permissions'
        )}
        description={
          <>
            {translate(
              'auto.components.settings.AgentsPane.agentPermissionsDescription',
              'Choose whether AgentStart launches agents with fewer permission prompts or with manual checks.'
            )}{' '}
            {translate(
              'auto.components.settings.AgentsPane.agentPermissionsTooltip',
              "Doesn't apply to agents where you've overridden launch arguments."
            )}
          </>
        }
        action={
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
        }
      />
    </section>
  )
}

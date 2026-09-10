import type { GlobalSettings } from '@agentstart/protocol/settings/global/model'
import { translate } from '~renderer/i18n/i18n'

import { Label } from '../ui/label'
import { SettingsSegmentedControl } from './form-controls'
import { SearchableSetting } from './searchable-setting'

type EditorWordWrapSettingProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
}

export function EditorWordWrapSetting({
  settings,
  updateSettings
}: EditorWordWrapSettingProps): React.JSX.Element {
  return (
    <SearchableSetting
      title={translate(
        'auto.components.settings.GeneralEditorSettingsSection.7ddd66fede',
        'Editor Word Wrap'
      )}
      description={translate(
        'auto.components.settings.GeneralEditorSettingsSection.9b18de6eea',
        'Wrap long lines in file editors instead of requiring horizontal scrolling.'
      )}
      keywords={['editor', 'code', 'word wrap', 'wrap', 'horizontal scroll', 'long lines']}
      className="flex items-center justify-between gap-4 py-2"
    >
      <div className="min-w-0 flex-1 space-y-0.5">
        <Label>
          {translate(
            'auto.components.settings.GeneralEditorSettingsSection.7ddd66fede',
            'Editor Word Wrap'
          )}
        </Label>
        <p className="text-muted-foreground text-xs">
          {translate(
            'auto.components.settings.GeneralEditorSettingsSection.9b18de6eea',
            'Wrap long lines in file editors instead of requiring horizontal scrolling.'
          )}
        </p>
      </div>
      <SettingsSegmentedControl
        ariaLabel={translate(
          'auto.components.settings.GeneralEditorSettingsSection.7ddd66fede',
          'Editor Word Wrap'
        )}
        value={settings.editorWordWrap === false ? 'off' : 'on'}
        onChange={(option) => updateSettings({ editorWordWrap: option === 'on' })}
        options={[
          {
            value: 'off',
            label: translate(
              'auto.components.settings.GeneralEditorSettingsSection.bf16ef0af2',
              'Off'
            )
          },
          {
            value: 'on',
            label: translate(
              'auto.components.settings.GeneralEditorSettingsSection.3f6892f307',
              'On'
            )
          }
        ]}
      />
    </SearchableSetting>
  )
}

import type { GlobalSettings } from '@yiru/protocol/settings/global/model'
import { translate } from '~renderer/i18n/i18n'
import { clampNumber, resolvePaneStyleOptions } from '~renderer/terminal/theme'

import { NumberField, SettingsSubsectionHeader } from '../form-controls'
import { SearchableSetting } from '../searchable-setting'

type TerminalPaneAppearanceSectionProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
}

export function TerminalPaneAppearanceSection({
  settings,
  updateSettings
}: TerminalPaneAppearanceSectionProps): React.JSX.Element {
  const paneStyleOptions = resolvePaneStyleOptions(settings)

  return (
    <section className="space-y-3">
      <SettingsSubsectionHeader
        title={translate(
          'auto.components.settings.TerminalAppearanceSection.e1a5c25555',
          'Terminal Panes'
        )}
      />

      <div className="divide-border/40 ml-4 divide-y">
        <SearchableSetting
          title={translate(
            'auto.components.settings.TerminalAppearanceSection.a6fdd6a3b1',
            'Inactive Pane Opacity'
          )}
          description={translate(
            'auto.components.settings.TerminalAppearanceSection.db632cb50e',
            'Opacity applied to panes that are not currently active.'
          )}
          keywords={['pane', 'opacity', 'dimming']}
        >
          <NumberField
            label={translate(
              'auto.components.settings.TerminalAppearanceSection.a6fdd6a3b1',
              'Inactive Pane Opacity'
            )}
            // Why: clarify which panes get dimmed; tightened per the copy audit.
            description={translate(
              'auto.components.settings.TerminalAppearanceSection.dimUnfocusedPanes',
              'Dim unfocused panes.'
            )}
            value={paneStyleOptions.inactivePaneOpacity}
            defaultValue={0.8}
            min={0}
            max={1}
            step={0.05}
            suffix="0-1"
            onChange={(value) =>
              updateSettings({
                terminalInactivePaneOpacity: clampNumber(value, 0, 1)
              })
            }
          />
        </SearchableSetting>
        <SearchableSetting
          title={translate(
            'auto.components.settings.TerminalAppearanceSection.f27a99978d',
            'Divider Thickness'
          )}
          description={translate(
            'auto.components.settings.TerminalAppearanceSection.a14a427ae4',
            'Thickness of the pane divider line.'
          )}
          keywords={['pane', 'divider', 'thickness']}
        >
          <NumberField
            label={translate(
              'auto.components.settings.TerminalAppearanceSection.f27a99978d',
              'Divider Thickness'
            )}
            description=""
            value={paneStyleOptions.dividerThicknessPx}
            defaultValue={1}
            min={1}
            max={32}
            step={1}
            suffix="px"
            onChange={(value) =>
              updateSettings({
                terminalDividerThicknessPx: clampNumber(value, 1, 32)
              })
            }
          />
        </SearchableSetting>
      </div>
    </section>
  )
}

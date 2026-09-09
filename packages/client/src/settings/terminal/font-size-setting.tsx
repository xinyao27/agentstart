import type { GlobalSettings } from '@yiru/protocol/settings/global/model'
import { translate } from '~renderer/i18n/i18n'
import { Minus, Plus } from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'
import { Input } from '~renderer/ui/input'

import { SettingsRow } from '../form-controls'
import { SearchableSetting } from '../searchable-setting'

export function TerminalFontSizeSetting({
  settings,
  updateSettings,
  forceVisible = false
}: {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
  forceVisible?: boolean
}): React.JSX.Element {
  return (
    <SearchableSetting
      title={translate('auto.components.settings.TerminalFontSizeSetting.a4a352b1e9', 'Font Size')}
      description={translate(
        'auto.components.settings.TerminalFontSizeSetting.0f4c92e595',
        'Default terminal font size for new panes and live updates.'
      )}
      keywords={['terminal', 'typography', 'text size']}
      forceVisible={forceVisible}
    >
      {/* Why: helper text dropped per the copy audit — "Font Size" + px control
          is self-evident; the search index keeps the longer description. */}
      <SettingsRow
        label={translate(
          'auto.components.settings.TerminalFontSizeSetting.a4a352b1e9',
          'Font Size'
        )}
        control={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => {
                const next = Math.max(10, settings.terminalFontSize - 1)
                updateSettings({ terminalFontSize: next })
              }}
              disabled={settings.terminalFontSize <= 10}
            >
              <Minus className="size-3" />
            </Button>
            <Input
              type="number"
              min={10}
              max={24}
              value={settings.terminalFontSize}
              onChange={(e) => {
                const value = Number.parseInt(e.target.value, 10)
                if (!Number.isNaN(value) && value >= 10 && value <= 24) {
                  updateSettings({ terminalFontSize: value })
                }
              }}
              className="w-14 text-center tabular-nums"
            />
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => {
                const next = Math.min(24, settings.terminalFontSize + 1)
                updateSettings({ terminalFontSize: next })
              }}
              disabled={settings.terminalFontSize >= 24}
            >
              <Plus className="size-3" />
            </Button>
            <span className="text-muted-foreground text-xs">
              {translate('auto.components.settings.TerminalFontSizeSetting.9b5252c85a', 'px')}
            </span>
          </div>
        }
      />
    </SearchableSetting>
  )
}

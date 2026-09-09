import type { GlobalSettings } from '@yiru/protocol/settings/global/model'
import { useState } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { clampNumber } from '~renderer/terminal/theme'
import { Button } from '~renderer/ui/button'
import { Label } from '~renderer/ui/label'
import { Switch } from '~renderer/ui/switch'

import { ColorField, NumberField } from '../form-controls'
import { SearchableSetting } from '../searchable-setting'

type TerminalWindowSectionProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
}

import { cn } from '~renderer/ui/class-names'

import { COLOR_OVERRIDE_GROUPS } from './window-color-groups'

export function TerminalWindowSection({
  settings,
  updateSettings
}: TerminalWindowSectionProps): React.JSX.Element {
  const [colorOverridesExpanded, setColorOverridesExpanded] = useState(false)
  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">
          {translate('auto.components.settings.TerminalWindowSection.b96ba13ed1', 'Window')}
        </h3>
        <p className="text-muted-foreground text-xs">
          {translate(
            'auto.components.settings.TerminalWindowSection.00eaa6b881',
            'Window appearance and background settings.'
          )}
        </p>
      </div>

      <div className="ml-4 space-y-4">
        <SearchableSetting
          title={translate(
            'auto.components.settings.TerminalWindowSection.ea7b1a158e',
            'Background Opacity'
          )}
          description={translate(
            'auto.components.settings.TerminalWindowSection.03acb60aa0',
            'Controls the transparency of the terminal background.'
          )}
          keywords={['opacity', 'transparency', 'background', 'alpha']}
        >
          <NumberField
            label={translate(
              'auto.components.settings.TerminalWindowSection.ea7b1a158e',
              'Background Opacity'
            )}
            description={translate(
              'auto.components.settings.TerminalWindowSection.809f37738d',
              'Controls the transparency of the terminal background. 1 is fully opaque, 0 is fully transparent.'
            )}
            value={settings.terminalBackgroundOpacity ?? 1}
            defaultValue={1}
            min={0}
            max={1}
            step={0.05}
            suffix="0 to 1"
            onChange={(value) =>
              updateSettings({ terminalBackgroundOpacity: clampNumber(value, 0, 1) })
            }
          />
        </SearchableSetting>

        <SearchableSetting
          title={translate(
            'auto.components.settings.TerminalWindowSection.36b8402015',
            'Horizontal Padding'
          )}
          description={translate(
            'auto.components.settings.TerminalWindowSection.25e2f8e8e1',
            'Horizontal padding around the terminal grid in pixels.'
          )}
          keywords={['padding', 'horizontal', 'spacing', 'margin']}
        >
          <NumberField
            label={translate(
              'auto.components.settings.TerminalWindowSection.36b8402015',
              'Horizontal Padding'
            )}
            description=""
            value={settings.terminalPaddingX ?? 4}
            defaultValue={4}
            min={0}
            max={512}
            step={1}
            suffix="px"
            onChange={(value) => updateSettings({ terminalPaddingX: Math.max(0, value) })}
          />
        </SearchableSetting>

        <SearchableSetting
          title={translate(
            'auto.components.settings.TerminalWindowSection.1afcc1d973',
            'Vertical Padding'
          )}
          description={translate(
            'auto.components.settings.TerminalWindowSection.1846f6ee6a',
            'Vertical padding around the terminal grid in pixels.'
          )}
          keywords={['padding', 'vertical', 'spacing', 'margin']}
        >
          <NumberField
            label={translate(
              'auto.components.settings.TerminalWindowSection.1afcc1d973',
              'Vertical Padding'
            )}
            description=""
            value={settings.terminalPaddingY ?? 4}
            defaultValue={4}
            min={0}
            max={512}
            step={1}
            suffix="px"
            onChange={(value) => updateSettings({ terminalPaddingY: Math.max(0, value) })}
          />
        </SearchableSetting>

        <SearchableSetting
          title={translate(
            'auto.components.settings.TerminalWindowSection.3530908ef9',
            'Hide Mouse While Typing'
          )}
          description={translate(
            'auto.components.settings.TerminalWindowSection.1d1920dc8a',
            'Hide the mouse cursor when typing in the terminal.'
          )}
          keywords={['mouse', 'hide', 'typing', 'cursor']}
          className="flex items-center justify-between gap-4 py-2"
        >
          <div className="space-y-0.5">
            {/* Why: helper text dropped per copy audit — near-verbatim restatement
              of the label; the search index keeps the longer phrasing. */}
            <Label>
              {translate(
                'auto.components.settings.TerminalWindowSection.3530908ef9',
                'Hide Mouse While Typing'
              )}
            </Label>
          </div>
          <Switch
            checked={settings.terminalMouseHideWhileTyping ?? false}
            onCheckedChange={(checked) => updateSettings({ terminalMouseHideWhileTyping: checked })}
          />
        </SearchableSetting>

        <SearchableSetting
          title={translate(
            'auto.components.settings.TerminalWindowSection.63f8d9336e',
            'Color Overrides'
          )}
          description={translate(
            'auto.components.settings.TerminalWindowSection.e86e09b5c7',
            'Override individual terminal colors.'
          )}
          keywords={['color', 'override', 'ansi', 'palette', 'theme']}
          className="space-y-3"
        >
          <div className="space-y-2">
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setColorOverridesExpanded((prev) => !prev)}
              className="focus-visible:bg-accent flex h-auto gap-2 border-0 p-0 text-sm"
            >
              <span
                className={cn('transition-transform', colorOverridesExpanded ? 'rotate-90' : '')}
              >
                ▶
              </span>
              {translate(
                'auto.components.settings.TerminalWindowSection.63f8d9336e',
                'Color Overrides'
              )}
            </Button>
            <div
              className={cn(
                'grid overflow-hidden transition-all duration-300 ease-out',
                colorOverridesExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
              )}
            >
              <div className="min-h-0 space-y-4">
                {COLOR_OVERRIDE_GROUPS.map((group) => (
                  <div key={group.label} className="space-y-2">
                    <p className="text-muted-foreground text-xs font-semibold">{group.label}</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {group.keys.map((item) => (
                        <ColorField
                          key={item.key}
                          label={item.label}
                          description={item.description}
                          value={settings.terminalColorOverrides?.[item.key] ?? ''}
                          fallback=""
                          onChange={(value) =>
                            updateSettings({
                              terminalColorOverrides: {
                                ...settings.terminalColorOverrides,
                                [item.key]: value || undefined
                              }
                            })
                          }
                        />
                      ))}
                    </div>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => updateSettings({ terminalColorOverrides: undefined })}
                >
                  {translate(
                    'auto.components.settings.TerminalWindowSection.03c855d15f',
                    'Reset all color overrides'
                  )}
                </Button>
              </div>
            </div>
          </div>
        </SearchableSetting>
      </div>
    </section>
  )
}

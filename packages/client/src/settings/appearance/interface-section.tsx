import type { GlobalSettings } from '@yiru/protocol/settings/global/model'
import { DEFAULT_APP_FONT_FAMILY } from '@yiru/protocol/settings/interface-font'
import type { UiLanguage } from '@yiru/protocol/settings/ui-language'
import type React from 'react'
import { translate } from '~renderer/i18n/i18n'
import {
  getUiLanguageChoiceLabel,
  SHOW_UI_LANGUAGE_SETTING,
  UI_LANGUAGE_CHOICES
} from '~renderer/i18n/supported-languages'
import { useShortcutKeyComboDetails } from '~renderer/keyboard-input/use-shortcut-label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~renderer/ui/select'

import { FontAutocomplete, SettingsRow, SettingsSegmentedControl } from '../form-controls'
import { LoaderStyleSetting } from '../loader-style-setting'
import { SearchableSetting } from '../searchable-setting'
import { UIZoomControl } from '../ui-zoom-control'
import {
  getLanguageEntries,
  getLoaderStyleEntries,
  getThemeEntries,
  getTypographyEntries,
  getZoomEntries
} from './search'
import { ShortcutHintList } from './shortcut-hint-list'

type AppearanceInterfaceSectionProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
  applyTheme: (theme: 'system' | 'dark' | 'light') => void
  fontSuggestions: string[]
  onRequestFontSuggestions?: () => void
  forceVisiblePrimary?: boolean
}

export function AppearanceInterfaceSection({
  settings,
  updateSettings,
  applyTheme,
  fontSuggestions,
  onRequestFontSuggestions,
  forceVisiblePrimary = false
}: AppearanceInterfaceSectionProps): React.JSX.Element {
  const zoomInKeyCombos = useShortcutKeyComboDetails('zoom.in')
  const zoomOutKeyCombos = useShortcutKeyComboDetails('zoom.out')
  const languageEntry = getLanguageEntries()[0]
  const loaderStyleEntry = getLoaderStyleEntries()[0]
  const themeEntry = getThemeEntries()[0]
  const themeLabel = translate('auto.components.settings.AppearancePane.932ff1fbff', 'Theme')
  const typographyEntry = getTypographyEntries()[0]
  const zoomEntry = getZoomEntries()[0]

  return (
    <div className="divide-border/40 divide-y">
      <SearchableSetting
        title={themeLabel}
        description={themeEntry?.description}
        keywords={themeEntry?.keywords ?? ['dark', 'light', 'system']}
        forceVisible={forceVisiblePrimary}
      >
        <SettingsRow
          label={themeLabel}
          control={
            <SettingsSegmentedControl
              ariaLabel={themeLabel}
              value={settings.theme}
              onChange={(option) => {
                updateSettings({ theme: option })
                applyTheme(option)
              }}
              options={[
                {
                  value: 'system',
                  label: translate('auto.components.settings.AppearancePane.fb0e0b4453', 'System')
                },
                {
                  value: 'dark',
                  label: translate('auto.components.settings.AppearancePane.7d26ccabe8', 'Dark')
                },
                {
                  value: 'light',
                  label: translate('auto.components.settings.AppearancePane.fd89b5487c', 'Light')
                }
              ]}
            />
          }
        />
      </SearchableSetting>

      <SearchableSetting
        title={translate('settings.appearance.loader.title', 'Loader')}
        description={loaderStyleEntry?.description}
        keywords={loaderStyleEntry?.keywords ?? []}
        forceVisible={forceVisiblePrimary}
      >
        <LoaderStyleSetting
          value={settings.loaderStyle}
          onChange={(loaderStyle) => updateSettings({ loaderStyle })}
        />
      </SearchableSetting>

      <SearchableSetting
        title={translate('auto.components.settings.AppearancePane.5e6d7aba8d', 'UI Zoom')}
        description={zoomEntry?.description}
        keywords={zoomEntry?.keywords ?? ['zoom', 'scale', 'shortcut']}
        forceVisible={forceVisiblePrimary}
      >
        <SettingsRow
          label={translate('auto.components.settings.AppearancePane.5e6d7aba8d', 'UI Zoom')}
          // Why: keep only the shortcut hint — the control itself makes "scale the
          // interface" obvious, but the keyboard gesture and its terminal-pane
          // exception are not discoverable from the buttons alone.
          description={
            <>
              <ShortcutHintList combos={zoomInKeyCombos} /> /{' '}
              <ShortcutHintList combos={zoomOutKeyCombos} />{' '}
              {translate(
                'auto.components.settings.AppearancePane.ef89200c1f',
                'when not in a terminal pane.'
              )}
            </>
          }
          control={<UIZoomControl />}
        />
      </SearchableSetting>

      <SearchableSetting
        title={translate('auto.components.settings.AppearancePane.102d6b5f9b', 'IDE Font')}
        description={typographyEntry?.description}
        keywords={typographyEntry?.keywords ?? ['font', 'typeface', 'typography']}
        forceVisible={forceVisiblePrimary}
      >
        <SettingsRow
          label={translate('auto.components.settings.AppearancePane.102d6b5f9b', 'IDE Font')}
          control={
            <FontAutocomplete
              value={settings.appFontFamily}
              suggestions={fontSuggestions}
              placeholder={DEFAULT_APP_FONT_FAMILY}
              onRequestSuggestions={onRequestFontSuggestions}
              onChange={(value) =>
                updateSettings({ appFontFamily: value.trim() || DEFAULT_APP_FONT_FAMILY })
              }
            />
          }
        />
      </SearchableSetting>

      {SHOW_UI_LANGUAGE_SETTING ? (
        <SearchableSetting
          title={translate('settings.appearance.language.title', 'Language')}
          description={languageEntry?.description}
          keywords={languageEntry?.keywords ?? []}
        >
          <SettingsRow
            label={translate('settings.appearance.language.title', 'Language')}
            control={
              <Select
                value={settings.uiLanguage}
                onValueChange={(value) => updateSettings({ uiLanguage: value as UiLanguage })}
              >
                <SelectTrigger
                  size="sm"
                  className="min-w-[220px]"
                  aria-label={translate('settings.appearance.language.title', 'Language')}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UI_LANGUAGE_CHOICES.map((choice) => (
                    <SelectItem key={choice.value} value={choice.value}>
                      {getUiLanguageChoiceLabel(choice, translate)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
          />
        </SearchableSetting>
      ) : null}
    </div>
  )
}

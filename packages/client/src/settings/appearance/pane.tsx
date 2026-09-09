import type { GlobalSettings } from '@yiru/protocol/settings/global/model'
import type React from 'react'
import { useLayoutEffect, useState } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { SHOW_UI_LANGUAGE_SETTING } from '~renderer/i18n/supported-languages'
import {
  AppWindow,
  Palette,
  SidebarSimple as PanelLeft,
  TerminalWindow as TerminalSquare
} from '~renderer/icons/hugeicons'
import { useAppStore } from '~renderer/store/state'

import { matchesSettingsSearch, normalizeSettingsSearchQuery } from '../search'
import { TerminalAppearanceSection } from '../terminal/appearance-section'
import { getTerminalAppearanceSearchEntries } from '../terminal/search'
import type { UseGhosttyImportReturn } from '../use-ghostty-import'
import type { UseWarpThemeImportReturn } from '../use-warp-theme-import'
import { AppearanceInterfaceSection } from './interface-section'
import {
  getAppearancePaneSearchEntries,
  getLanguageEntries,
  getLayoutEntries,
  getLoaderStyleEntries,
  getSidebarEntries,
  getStatusBarEntries,
  getThemeEntries,
  getTypographyEntries,
  getZoomEntries
} from './search'
import { AppearanceSection } from './section'
import { getLeftSidebarAppearanceEntry } from './sidebar-search'
import { getThemeColorEntries } from './theme-color-search'
import { AppearanceThemeColorSection } from './theme-color-section'
import { USAGE_PERCENTAGE_DISPLAY_SETTING_ID } from './usage-percentage-search'
import { AppearanceWindowSidebarSection } from './window-sidebar-section'
export { getAppearancePaneSearchEntries }

type AppearancePaneProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
  applyTheme: (theme: 'system' | 'dark' | 'light') => void
  fontSuggestions: string[]
  terminalFontSuggestions: string[]
  onRequestFontSuggestions?: () => void
  systemPrefersDark: boolean
  ghostty: UseGhosttyImportReturn
  warpThemes: UseWarpThemeImportReturn
}

type AppearanceSectionKey = 'interface' | 'terminal' | 'window' | 'theme-color'

function resolveThemeSummary(theme: GlobalSettings['theme']): string {
  if (theme === 'system') {
    return translate('auto.components.settings.AppearancePane.fb0e0b4453', 'System')
  }
  if (theme === 'light') {
    return translate('auto.components.settings.AppearancePane.fd89b5487c', 'Light')
  }
  return translate('auto.components.settings.AppearancePane.7d26ccabe8', 'Dark')
}

export function AppearancePane({
  settings,
  updateSettings,
  applyTheme,
  fontSuggestions,
  terminalFontSuggestions,
  onRequestFontSuggestions,
  systemPrefersDark,
  ghostty,
  warpThemes
}: AppearancePaneProps): React.JSX.Element {
  const searchQuery = useAppStore((state) => state.settingsSearchQuery)
  const appearanceAccordionDeepLink = useAppStore((state) => state.appearanceAccordionDeepLink)
  const clearAppearanceAccordionDeepLink = useAppStore(
    (state) => state.clearAppearanceAccordionDeepLink
  )
  const isSearching = normalizeSettingsSearchQuery(searchQuery).length > 0
  const [manuallyOpenSection, setManuallyOpenSection] = useState<AppearanceSectionKey | null>(
    'interface'
  )
  if (appearanceAccordionDeepLink && manuallyOpenSection !== appearanceAccordionDeepLink) {
    setManuallyOpenSection(appearanceAccordionDeepLink)
  }

  // Why: nested deep links (e.g. Usage percentages) land under Window & Sidebar;
  // expand that accordion before Settings scrolls so the row is actually visible.
  useLayoutEffect(() => {
    if (!appearanceAccordionDeepLink) {
      return
    }
    clearAppearanceAccordionDeepLink()
    // Why: accordion expand is layout-synchronous; scroll on the next frame so
    // the target has non-zero height when Settings (or this fallback) scrolls.
    const frameId = requestAnimationFrame(() => {
      document
        .getElementById(USAGE_PERCENTAGE_DISPLAY_SETTING_ID)
        ?.scrollIntoView({ block: 'nearest' })
    })
    return () => {
      cancelAnimationFrame(frameId)
    }
  }, [appearanceAccordionDeepLink, clearAppearanceAccordionDeepLink])
  const interfaceTitle = translate(
    'auto.components.settings.AppearancePane.interfaceTitle',
    'Interface'
  )
  const terminalTitle = translate(
    'auto.components.settings.AppearancePane.terminalTitle',
    'Terminal'
  )
  const windowSidebarTitle = translate('settings.appearance.sidebarLayoutTitle', 'Sidebar & Layout')
  const windowSidebarSummary = translate(
    'auto.components.settings.AppearancePane.windowSidebarSummary',
    'Sidebar, status bar, and file explorer'
  )

  // Search-entry buckets per section so a query can force-open the matching one.
  const interfaceSearchEntries = [
    { title: interfaceTitle },
    ...getThemeEntries(),
    ...getLoaderStyleEntries(),
    ...getZoomEntries(),
    ...getTypographyEntries(),
    ...(SHOW_UI_LANGUAGE_SETTING ? getLanguageEntries() : [])
  ]
  const terminalSearchEntries = [
    { title: terminalTitle },
    ...getTerminalAppearanceSearchEntries({ showWarpImport: true })
  ]
  const windowSearchEntries = [
    {
      title: windowSidebarTitle,
      description: windowSidebarSummary
    },
    ...getStatusBarEntries(),
    ...getSidebarEntries(),
    ...getLayoutEntries(),
    getLeftSidebarAppearanceEntry()
  ]

  const themeColorTitle = translate('themeGradient.section.title', 'Theme color')
  const themeColorSummary = translate(
    'themeGradient.section.summary',
    'Workspace accent color and background wash'
  )
  const themeColorSearchEntries = [
    { title: themeColorTitle, description: themeColorSummary },
    ...getThemeColorEntries()
  ]

  const interfaceMatches = matchesSettingsSearch(searchQuery, interfaceSearchEntries)
  const themeColorMatches = matchesSettingsSearch(searchQuery, themeColorSearchEntries)
  const terminalMatches = matchesSettingsSearch(searchQuery, terminalSearchEntries)
  const windowMatches = matchesSettingsSearch(searchQuery, windowSearchEntries)
  const interfaceLabelMatches = matchesSettingsSearch(searchQuery, { title: interfaceTitle })
  const terminalLabelMatches = matchesSettingsSearch(searchQuery, { title: terminalTitle })
  const windowLabelMatches = matchesSettingsSearch(searchQuery, {
    title: windowSidebarTitle,
    description: windowSidebarSummary
  })
  // While searching, force-open every section that contains a match so its
  // controls (including advanced ones) are revealed; otherwise the accordion
  // shows exactly one manually-chosen section.
  function isSectionOpen(key: AppearanceSectionKey): boolean {
    if (isSearching) {
      const matchesByKey: Record<AppearanceSectionKey, boolean> = {
        interface: interfaceMatches,
        terminal: terminalMatches,
        window: windowMatches,
        'theme-color': themeColorMatches
      }
      return matchesByKey[key]
    }
    return manuallyOpenSection === key
  }

  function toggleSection(key: AppearanceSectionKey): void {
    setManuallyOpenSection((current) => (current === key ? null : key))
  }

  const interfaceSummary = `${resolveThemeSummary(settings.theme)} · ${
    settings.appFontFamily ||
    translate('auto.components.settings.AppearancePane.interfaceDefaultFont', 'Default font')
  }`
  const terminalSummary = `${
    settings.terminalFontFamily ||
    translate('auto.components.settings.AppearancePane.terminalDefaultFont', 'Default font')
  } · ${settings.terminalFontSize}px`

  return (
    <div className="space-y-2.5">
      {interfaceMatches ? (
        <AppearanceSection
          id="interface"
          icon={<AppWindow aria-hidden="true" />}
          title={interfaceTitle}
          summary={interfaceSummary}
          open={isSectionOpen('interface')}
          onToggle={() => toggleSection('interface')}
        >
          <AppearanceInterfaceSection
            settings={settings}
            updateSettings={updateSettings}
            applyTheme={applyTheme}
            fontSuggestions={fontSuggestions}
            onRequestFontSuggestions={onRequestFontSuggestions}
            forceVisiblePrimary={interfaceLabelMatches}
          />
        </AppearanceSection>
      ) : null}

      {themeColorMatches ? (
        <AppearanceSection
          id="theme-color"
          icon={<Palette aria-hidden="true" />}
          title={themeColorTitle}
          summary={themeColorSummary}
          open={isSectionOpen('theme-color')}
          onToggle={() => toggleSection('theme-color')}
        >
          <AppearanceThemeColorSection
            themeMode={settings.theme}
            onThemeModeChange={(theme) => {
              updateSettings({ theme })
              applyTheme(theme)
            }}
          />
        </AppearanceSection>
      ) : null}

      {/* Why: Code & Markdown is intentionally omitted. Yiru has no Appearance-level
          code/markdown settings — the code editor reuses the terminal font and
          there is no markdown-style or line-number setting — so a fourth row would
          be empty. We surface only the three sections that hold real controls
          rather than fabricate settings. */}

      {terminalMatches ? (
        <AppearanceSection
          id="terminal"
          icon={<TerminalSquare aria-hidden="true" />}
          title={terminalTitle}
          summary={terminalSummary}
          open={isSectionOpen('terminal')}
          onToggle={() => toggleSection('terminal')}
        >
          <TerminalAppearanceSection
            settings={settings}
            updateSettings={updateSettings}
            systemPrefersDark={systemPrefersDark}
            terminalFontSuggestions={terminalFontSuggestions}
            onRequestFontSuggestions={onRequestFontSuggestions}
            ghostty={ghostty}
            warpThemes={warpThemes}
            forceVisiblePrimary={terminalLabelMatches}
          />
        </AppearanceSection>
      ) : null}

      {windowMatches ? (
        <AppearanceSection
          id="window"
          icon={<PanelLeft aria-hidden="true" />}
          title={windowSidebarTitle}
          summary={windowSidebarSummary}
          open={isSectionOpen('window')}
          onToggle={() => toggleSection('window')}
        >
          <AppearanceWindowSidebarSection
            settings={settings}
            updateSettings={updateSettings}
            forceVisiblePrimary={windowLabelMatches}
          />
        </AppearanceSection>
      ) : null}
    </div>
  )
}

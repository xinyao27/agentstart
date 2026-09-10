import { translate } from '~renderer/i18n/i18n'
import { createLocalizedCatalog } from '~renderer/i18n/localized-catalog'
import { SHOW_UI_LANGUAGE_SETTING } from '~renderer/i18n/supported-languages'

import type { SettingsSearchEntry } from '../search'
import { translateSearchKeyword } from '../search-keywords'
import { getTerminalAppearanceSearchEntries } from '../terminal/search'
import { getSidebarEntries } from './sidebar-search'
import { getStatusBarToggles } from './status-bar-search'
import { getThemeColorEntries } from './theme-color-search'
import { getUsagePercentageDisplayEntry } from './usage-percentage-search'

export { getStatusBarToggles, getUsagePercentageDisplayEntry }

export const getThemeEntries = createLocalizedCatalog((): SettingsSearchEntry[] => [
  {
    title: translate('auto.components.settings.appearance.search.71e06350b4', 'Theme'),
    description: translate(
      'auto.components.settings.appearance.search.0709c794f7',
      'Choose how AgentStart looks in the app window.'
    ),
    keywords: [
      ...translateSearchKeyword('auto.components.settings.appearance.search.262fe1d24f', 'dark'),
      ...translateSearchKeyword('auto.components.settings.appearance.search.44d873fd18', 'light'),
      ...translateSearchKeyword('auto.components.settings.appearance.search.3a9b69d734', 'system')
    ]
  }
])

export const getLoaderStyleEntries = createLocalizedCatalog((): SettingsSearchEntry[] => [
  {
    title: translate('settings.appearance.loader.title', 'Loader'),
    description: translate(
      'settings.appearance.loader.description',
      'Choose the dotted agent-state animation used across AgentStart.'
    ),
    keywords: [
      ...translateSearchKeyword('settings.appearance.loader.keyword.loader', 'loader'),
      ...translateSearchKeyword('settings.appearance.loader.keyword.loading', 'loading'),
      ...translateSearchKeyword('settings.appearance.loader.keyword.spinner', 'spinner'),
      ...translateSearchKeyword('settings.appearance.loader.keyword.animation', 'animation'),
      ...translateSearchKeyword('settings.appearance.loader.keyword.orb', 'orb'),
      ...translateSearchKeyword('settings.appearance.loader.keyword.working', 'working'),
      ...translateSearchKeyword('settings.appearance.loader.keyword.searching', 'searching'),
      ...translateSearchKeyword('settings.appearance.loader.keyword.solving', 'solving'),
      ...translateSearchKeyword('settings.appearance.loader.keyword.listening', 'listening'),
      ...translateSearchKeyword('settings.appearance.loader.keyword.composing', 'composing'),
      ...translateSearchKeyword('settings.appearance.loader.keyword.shaping', 'shaping')
    ]
  }
])

export const getLanguageEntries = createLocalizedCatalog((): SettingsSearchEntry[] => [
  {
    title: translate('settings.appearance.language.title', 'Language'),
    description: translate(
      'settings.appearance.language.description',
      'Choose the language used by the AgentStart interface.'
    ),
    keywords: [
      ...translateSearchKeyword('settings.appearance.language.title', 'Language'),
      ...translateSearchKeyword(
        'settings.appearance.language.description',
        'Choose the language used by the AgentStart interface.'
      ),
      ...translateSearchKeyword('settings.appearance.language.system', 'System'),
      ...translateSearchKeyword('settings.appearance.language.english', 'English'),
      ...translateSearchKeyword('settings.appearance.language.chinese', '中文（简体）'),
      ...translateSearchKeyword(
        'auto.components.settings.appearance.search.language.locale',
        'locale'
      ),
      ...translateSearchKeyword('auto.components.settings.appearance.search.language.i18n', 'i18n'),
      ...translateSearchKeyword(
        'auto.components.settings.appearance.search.language.translation',
        'translation'
      )
    ]
  }
])

export const getZoomEntries = createLocalizedCatalog((): SettingsSearchEntry[] => [
  {
    title: translate('auto.components.settings.appearance.search.c5e933970f', 'UI Zoom'),
    description: translate(
      'auto.components.settings.appearance.search.adddb91a3d',
      'Scale the entire application interface.'
    ),
    keywords: [
      ...translateSearchKeyword('auto.components.settings.appearance.search.3ae5de6101', 'zoom'),
      ...translateSearchKeyword('auto.components.settings.appearance.search.0952091186', 'scale'),
      ...translateSearchKeyword('auto.components.settings.appearance.search.0c83659f48', 'shortcut')
    ]
  }
])

export const getTypographyEntries = createLocalizedCatalog((): SettingsSearchEntry[] => [
  {
    title: translate('auto.components.settings.appearance.search.ddb991024d', 'IDE Font'),
    description: translate(
      'auto.components.settings.appearance.search.07c7c38fac',
      'Choose the font used by the AgentStart interface.'
    ),
    keywords: [
      ...translateSearchKeyword('auto.components.settings.appearance.search.24094af355', 'font'),
      ...translateSearchKeyword(
        'auto.components.settings.appearance.search.a0e09aed9c',
        'typeface'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.appearance.search.8b36fb3f64',
        'typography'
      ),
      ...translateSearchKeyword('auto.components.settings.appearance.search.fab91464dd', 'ide'),
      ...translateSearchKeyword(
        'auto.components.settings.appearance.search.1f2880a9d5',
        'agentstart'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.appearance.search.5095258df2',
        'interface'
      ),
      ...translateSearchKeyword('auto.components.settings.appearance.search.36e006efc1', 'app'),
      ...translateSearchKeyword('auto.components.settings.appearance.search.2f12e1aa3a', 'ui')
    ]
  }
])

export const getLayoutEntries = createLocalizedCatalog((): SettingsSearchEntry[] => [
  {
    title: translate(
      'auto.components.settings.appearance.search.f8129fb544',
      'Show Git-Ignored Files'
    ),
    description: translate(
      'auto.components.settings.appearance.search.7164edf71a',
      'Dim files matched by .gitignore in the file explorer.'
    ),
    keywords: [
      ...translateSearchKeyword('auto.components.settings.appearance.search.bce3ac317a', 'git'),
      ...translateSearchKeyword(
        'auto.components.settings.appearance.search.08c86bf58e',
        'gitignore'
      ),
      ...translateSearchKeyword('auto.components.settings.appearance.search.9f2df826ac', 'ignored'),
      ...translateSearchKeyword(
        'auto.components.settings.appearance.search.c1bca1885a',
        'file explorer'
      ),
      ...translateSearchKeyword('auto.components.settings.appearance.search.5bff6a2ef0', 'sidebar'),
      ...translateSearchKeyword('auto.components.settings.appearance.search.648eeada79', 'hide')
    ]
  }
])

export const getStatusBarEntries = createLocalizedCatalog((): SettingsSearchEntry[] => [
  getUsagePercentageDisplayEntry(),
  ...getStatusBarToggles().map(({ title, description, keywords }) => ({
    title,
    description,
    keywords
  }))
])

export { getSidebarEntries }

const getAppearanceCoreSectionEntries = createLocalizedCatalog((): SettingsSearchEntry[] => [
  {
    title: translate('auto.components.settings.AppearancePane.interfaceTitle', 'Interface')
  },
  {
    title: translate('auto.components.settings.AppearancePane.terminalTitle', 'Terminal')
  },
  {
    title: translate('themeGradient.section.title', 'Theme color'),
    description: translate(
      'themeGradient.section.summary',
      'Workspace accent color and background wash'
    )
  }
])

function getAppearanceSectionEntries(): SettingsSearchEntry[] {
  return [
    ...getAppearanceCoreSectionEntries(),
    {
      title: translate('settings.appearance.sidebarLayoutTitle', 'Sidebar & Layout'),
      description: translate(
        'auto.components.settings.AppearancePane.windowSidebarSummary',
        'Sidebar, status bar, and file explorer'
      )
    }
  ]
}

type AppearancePaneSearchOptions = {
  showWarpImport?: boolean
}

function buildAppearancePaneSearchEntries(
  options: AppearancePaneSearchOptions
): SettingsSearchEntry[] {
  return [
    ...getAppearanceSectionEntries(),
    ...getThemeEntries(),
    ...getLoaderStyleEntries(),
    ...(SHOW_UI_LANGUAGE_SETTING ? getLanguageEntries() : []),
    ...getTypographyEntries(),
    ...getZoomEntries(),
    ...getTerminalAppearanceSearchEntries(options),
    ...getLayoutEntries(),
    ...getStatusBarEntries(),
    ...getSidebarEntries(),
    ...getThemeColorEntries()
  ]
}

export function getAppearancePaneSearchEntries(
  options: AppearancePaneSearchOptions = {}
): SettingsSearchEntry[] {
  return buildAppearancePaneSearchEntries({
    showWarpImport: options.showWarpImport ?? true
  })
}

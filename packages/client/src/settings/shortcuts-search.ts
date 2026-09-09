import { KEYBINDING_DEFINITIONS } from '@yiru/protocol/keybindings'
import { translate } from '~renderer/i18n/i18n'
import { createLocalizedCatalog } from '~renderer/i18n/localized-catalog'

import type { SettingsSearchEntry } from './search'
import { translateSearchKeyword } from './search-keywords'

export const getTerminalShortcutPolicySearchEntry = createLocalizedCatalog(
  (): SettingsSearchEntry => ({
    title: translate(
      'auto.components.settings.shortcuts.search.f052906167',
      'Shortcuts in Terminal'
    ),
    description: translate(
      'auto.components.settings.shortcuts.search.ebd7d81e1d',
      'Choose whether Yiru or the focused terminal wins when shortcuts overlap.'
    ),
    keywords: [
      ...translateSearchKeyword('auto.components.settings.shortcuts.search.ca6a0c2df7', 'shortcut'),
      ...translateSearchKeyword('auto.components.settings.shortcuts.search.0ecba9aa5f', 'keyboard'),
      ...translateSearchKeyword('auto.components.settings.shortcuts.search.7e3fc707aa', 'terminal'),
      ...translateSearchKeyword('auto.components.settings.shortcuts.search.7f1b38f59a', 'tui'),
      ...translateSearchKeyword('auto.components.settings.shortcuts.search.f1adebbe8c', 'shell'),
      ...translateSearchKeyword('auto.components.settings.shortcuts.search.0f8cb15582', 'agent'),
      ...translateSearchKeyword('auto.components.settings.shortcuts.search.0ecfc47434', 'conflict'),
      ...translateSearchKeyword(
        'auto.components.settings.shortcuts.search.afda131738',
        'yiru first'
      ),
      ...translateSearchKeyword(
        'auto.components.settings.shortcuts.search.4811a8264a',
        'terminal first'
      )
    ]
  })
)

export const getShortcutsPaneSearchEntries = createLocalizedCatalog(() => [
  ...KEYBINDING_DEFINITIONS.map((item) => ({
    title: item.title,
    description: translate(
      'auto.components.settings.shortcuts.search.ca6a0c2df7',
      '{{value0}} shortcut',
      { value0: item.group }
    ),
    keywords: [...item.searchKeywords]
  })),
  getTerminalShortcutPolicySearchEntry()
])

import { getBrowserSettingsSearchEntries } from '~renderer/extension/browser-settings/search'

import { getAdvancedNetworkSearchEntries } from './advanced-network-search'
import { getAutomationsSearchEntries } from './automations-search'
import type { SettingsSearchEntry } from './search'

export function getAdvancedPaneSearchEntries(options?: {
  includeBrowserSettings?: boolean
}): SettingsSearchEntry[] {
  return [
    ...getAdvancedNetworkSearchEntries(),
    ...(options?.includeBrowserSettings
      ? [...getAutomationsSearchEntries(), ...getBrowserSettingsSearchEntries()]
      : [])
  ]
}

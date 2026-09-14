import type { GlobalSettings } from '@agentstart/protocol/settings/global/model'
import { hasExtensionBrowserCapabilities } from '~renderer/extension/browser-capabilities'
import { BrowserSettingsPane } from '~renderer/extension/browser-settings/pane'
import { getBrowserSettingsSearchEntries } from '~renderer/extension/browser-settings/search'
import { translate } from '~renderer/i18n/i18n'
import { CalendarDots, Globe, Network } from '~renderer/icons/hugeicons'

import { getAdvancedNetworkSearchEntries } from './advanced-network-search'
import { AdvancedNetworkSettingsSection } from './advanced-network-settings-section'
import { getAutomationsSearchEntries } from './automations-search'
import { AutomationsSection } from './automations-section'
import { SettingsGroupCards, type SettingsGroup } from './group-card'

type AdvancedPaneProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
}

export function AdvancedPane({ settings, updateSettings }: AdvancedPaneProps): React.JSX.Element {
  const groups: SettingsGroup[] = [
    {
      id: 'advanced-network',
      icon: <Network aria-hidden="true" />,
      title: translate('auto.components.settings.AdvancedPane.network', 'Network'),
      summary: translate(
        'auto.components.settings.AdvancedPane.networkDescription',
        'App-level network routing for proxies and corporate environments.'
      ),
      searchEntries: getAdvancedNetworkSearchEntries(),
      content: (
        <AdvancedNetworkSettingsSection settings={settings} updateSettings={updateSettings} />
      )
    }
  ]

  if (hasExtensionBrowserCapabilities()) {
    groups.push(
      {
        id: 'advanced-automations',
        icon: <CalendarDots aria-hidden="true" />,
        title: translate('extension.automations.title', 'Automations'),
        summary: translate(
          'extension.automations.description',
          'One explicit gesture coordinates daemon work and browser layout.'
        ),
        searchEntries: getAutomationsSearchEntries(),
        content: <AutomationsSection />
      },
      {
        id: 'advanced-browser',
        icon: <Globe aria-hidden="true" />,
        title: translate('extension.browserSettings.title', 'Browser settings'),
        summary: translate(
          'extension.browserSettings.description',
          'Preferences that only apply to AgentStart running inside this browser.'
        ),
        searchEntries: getBrowserSettingsSearchEntries(),
        content: <BrowserSettingsPane />
      }
    )
  }

  return <SettingsGroupCards groups={groups} defaultOpenId="advanced-network" />
}

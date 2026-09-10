import type { GlobalSettings } from '@agentstart/protocol/settings/global/model'
import { hasExtensionBrowserCapabilities } from '~renderer/extension/browser-capabilities'
import { BrowserSettingsPane } from '~renderer/extension/browser-settings/pane'
import { translate } from '~renderer/i18n/i18n'

import { AdvancedNetworkSettingsSection } from './advanced-network-settings-section'
import { AutomationsSection } from './automations-section'
import { SettingsSubsectionHeader } from './form-controls'

type AdvancedPaneProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
}

export function AdvancedPane({ settings, updateSettings }: AdvancedPaneProps): React.JSX.Element {
  return (
    <section className="space-y-3">
      <SettingsSubsectionHeader
        title={translate('auto.components.settings.AdvancedPane.network', 'Network')}
        description={translate(
          'auto.components.settings.AdvancedPane.networkDescription',
          'App-level network routing for proxies and corporate environments.'
        )}
      />
      <AdvancedNetworkSettingsSection settings={settings} updateSettings={updateSettings} />
      {hasExtensionBrowserCapabilities() ? (
        <>
          <AutomationsSection />
          <BrowserSettingsPane />
        </>
      ) : null}
    </section>
  )
}

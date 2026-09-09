import type { GlobalSettings } from '@yiru/protocol/settings/global/model'
import { translate } from '~renderer/i18n/i18n'

import { AdvancedNetworkSettingsSection } from './advanced-network-settings-section'
import { getAdvancedPaneSearchEntries } from './advanced-search'
import { SettingsSubsectionHeader } from './form-controls'

export { getAdvancedPaneSearchEntries }

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
    </section>
  )
}

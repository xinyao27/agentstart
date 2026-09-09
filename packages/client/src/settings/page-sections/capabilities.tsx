import type { GlobalSettings } from '@yiru/protocol/settings/global/model'
import type { WindowsTerminalCapabilities } from '~renderer/terminal/windows/capabilities'

import { translate } from '../../i18n/i18n'
import { AccountsPane } from '../accounts-pane'
import { AgentsPane } from '../agents-pane'
import { ComputerUsePane } from '../computer-use-pane'
import { GeneralPane } from '../general/pane'
import { IntegrationsPane } from '../integrations-pane'
import { OrchestrationPane } from '../orchestration/pane'
import type { SettingsSearchEntry } from '../search'
import { SettingsSection } from '../section'
import { SettingsSetupGuidePane } from '../setup-guide-pane'
import type { SettingsSlice } from '../state'

type CapabilitySectionsProps = {
  accountOwnerPlatform: WindowsTerminalCapabilities['hostPlatform']
  fontSuggestions: string[]
  getSearchEntries: (sectionId: string) => SettingsSearchEntry[]
  isMounted: (sectionId: string) => boolean
  onRequestFontSuggestions: () => void
  settings: GlobalSettings
  updateSettings: SettingsSlice['updateSettings']
  wslAvailable: boolean
  wslCapabilitiesLoading: boolean
  wslDistros: string[]
  wslSupportedPlatform: boolean
}

export function CapabilitySections({
  accountOwnerPlatform,
  fontSuggestions,
  getSearchEntries,
  isMounted,
  onRequestFontSuggestions,
  settings,
  updateSettings,
  wslAvailable,
  wslCapabilitiesLoading,
  wslDistros,
  wslSupportedPlatform
}: CapabilitySectionsProps): React.JSX.Element {
  return (
    <>
      <SettingsSection
        id="agents"
        title={translate('auto.components.settings.Settings.8afa676615', 'Agents')}
        description={translate(
          'auto.components.settings.Settings.ec1ba547f7',
          'Manage AI agents, set a default, and customize commands.'
        )}
        searchEntries={getSearchEntries('agents')}
      >
        {isMounted('agents') ? (
          <AgentsPane
            settings={settings}
            updateSettings={updateSettings}
            wslSupportedPlatform={wslSupportedPlatform}
            wslAvailable={wslAvailable}
            wslDistros={wslDistros}
            wslCapabilitiesLoading={wslCapabilitiesLoading}
          />
        ) : null}
      </SettingsSection>

      <SettingsSection
        id="accounts"
        title={translate('auto.components.settings.Settings.ad6c529693', 'AI Provider Accounts')}
        description={translate(
          'auto.components.settings.Settings.21f09426ea',
          'Optional. Yiru works with your existing provider logins; add accounts only if you want Yiru to help switch between them.'
        )}
        badge={translate('auto.hooks.useSettingsNavigationMetadata.7c79d3b7bf', 'Optional')}
        searchEntries={getSearchEntries('accounts')}
      >
        {isMounted('accounts') ? (
          <AccountsPane
            settings={settings}
            updateSettings={updateSettings}
            wslSupportedPlatform={wslSupportedPlatform}
            wslAvailable={wslAvailable}
            wslDistros={wslDistros}
            wslCapabilitiesLoading={wslCapabilitiesLoading}
            accountOwnerPlatform={accountOwnerPlatform}
          />
        ) : null}
      </SettingsSection>

      <SettingsSection
        id="orchestration"
        title={translate('auto.components.settings.Settings.00c3a7950d', 'Orchestration')}
        description={translate(
          'auto.components.settings.Settings.475980f53d',
          'Coordinate multiple coding agents through Yiru.'
        )}
        searchEntries={getSearchEntries('orchestration')}
      >
        {isMounted('orchestration') ? <OrchestrationPane /> : null}
      </SettingsSection>

      <SettingsSection
        id="computer-use"
        title={translate('auto.components.settings.Settings.c9841721cb', 'Computer Use')}
        description={translate(
          'auto.components.settings.Settings.7118953f14',
          'Enable agents to control any app on your computer.'
        )}
        searchEntries={getSearchEntries('computer-use')}
      >
        {isMounted('computer-use') ? <ComputerUsePane /> : null}
      </SettingsSection>

      <SettingsSection
        id="setup-guide"
        title={translate('auto.components.settings.Settings.6d119427ef', 'Onboarding checklist')}
        description={translate(
          'auto.components.settings.Settings.6855b0f77d',
          'Finish the core workflows that make Yiru useful for parallel agent work.'
        )}
        searchEntries={getSearchEntries('setup-guide')}
        bodyClassName="overflow-hidden border-0 bg-transparent p-0"
      >
        {isMounted('setup-guide') ? <SettingsSetupGuidePane /> : null}
      </SettingsSection>

      <SettingsSection
        id="general"
        title={translate('auto.components.settings.Settings.7807c11c4d', 'General')}
        description={translate(
          'auto.components.settings.Settings.f9b77539fd',
          'Workspace defaults, app setup, and maintenance.'
        )}
        searchEntries={getSearchEntries('general')}
      >
        {isMounted('general') ? (
          <GeneralPane
            settings={settings}
            updateSettings={updateSettings}
            fontSuggestions={fontSuggestions}
            onRequestFontSuggestions={onRequestFontSuggestions}
            wslSupportedPlatform={wslSupportedPlatform}
            wslAvailable={wslAvailable}
            wslDistros={wslDistros}
            wslCapabilitiesLoading={wslCapabilitiesLoading}
          />
        ) : null}
      </SettingsSection>

      <SettingsSection
        id="integrations"
        title={translate('auto.components.settings.Settings.c9ca101a3b', 'Integrations')}
        description={translate(
          'auto.components.settings.Settings.b07041697f',
          'Connect GitHub for pull requests, checks, and review status.'
        )}
        searchEntries={getSearchEntries('integrations')}
        bodyClassName="border-0 bg-transparent p-0"
      >
        {isMounted('integrations') ? <IntegrationsPane /> : null}
      </SettingsSection>
    </>
  )
}

import type { GlobalSettings } from '@agentstart/protocol/settings/global/model'
import { lazy, Suspense } from 'react'

import { translate } from '../../i18n/i18n'
import { AdvancedPane } from '../advanced-pane'
import { DeveloperPermissionsPane } from '../developer-permissions-pane'
import { ExperimentalPane } from '../experimental-pane'
import { PrivacyPane } from '../privacy-pane'
import { RuntimeEnvironmentsPane } from '../runtime-environments-pane'
import type { SettingsSearchEntry } from '../search'
import { SettingsSection } from '../section'
import { ShortcutsPane } from '../shortcuts-pane'
import type { SettingsSlice } from '../state'

const DevToolsPane = import.meta.env.DEV
  ? lazy(() => import('../devtools-pane').then((module) => ({ default: module.DevToolsPane })))
  : null

type SystemSectionsProps = {
  getSearchEntries: (sectionId: string) => SettingsSearchEntry[]
  hiddenExperimentalUnlocked: boolean
  isFocusedShortcutsPane: boolean
  isMac: boolean
  isMounted: (sectionId: string) => boolean
  settings: GlobalSettings
  switchRuntimeEnvironment: SettingsSlice['switchRuntimeEnvironment']
  updateSettings: SettingsSlice['updateSettings']
}

export function SystemSections({
  getSearchEntries,
  hiddenExperimentalUnlocked,
  isFocusedShortcutsPane,
  isMac,
  isMounted,
  settings,
  switchRuntimeEnvironment,
  updateSettings
}: SystemSectionsProps): React.JSX.Element {
  return (
    <>
      <SettingsSection
        id="shortcuts"
        title={translate('auto.components.settings.Settings.23bf7a1ad4', 'Shortcuts')}
        description={translate(
          'auto.components.settings.Settings.a737a4bb22',
          'Keyboard shortcuts for common actions.'
        )}
        searchEntries={getSearchEntries('shortcuts')}
        className={
          isFocusedShortcutsPane ? 'flex min-h-0 flex-1 flex-col gap-6 space-y-0' : undefined
        }
        bodyClassName={isFocusedShortcutsPane ? 'min-h-0 flex-1 overflow-hidden' : undefined}
      >
        {isMounted('shortcuts') ? <ShortcutsPane /> : null}
      </SettingsSection>

      <SettingsSection
        id="runtime-environments"
        title={translate(
          'auto.components.settings.Settings.runtimeEnvironmentsTitle',
          'Runtime Hosts'
        )}
        description={translate(
          'auto.components.settings.Settings.runtimeEnvironmentsDescription',
          'Connect to AgentStart daemons on this computer or remote hosts.'
        )}
        searchEntries={getSearchEntries('runtime-environments')}
      >
        {isMounted('runtime-environments') ? (
          <RuntimeEnvironmentsPane
            settings={settings}
            switchRuntimeEnvironment={switchRuntimeEnvironment}
          />
        ) : null}
      </SettingsSection>

      {isMac ? (
        <SettingsSection
          id="developer-permissions"
          title={translate('auto.components.settings.Settings.65660d4548', 'macOS Permissions')}
          description={translate(
            'auto.components.settings.Settings.9b83cc62c2',
            'macOS privacy access for terminal-launched developer tools.'
          )}
          searchEntries={getSearchEntries('developer-permissions')}
        >
          {isMounted('developer-permissions') ? <DeveloperPermissionsPane /> : null}
        </SettingsSection>
      ) : null}

      <SettingsSection
        id="privacy"
        title={translate('auto.components.settings.Settings.d7e3f62d70', 'Privacy & Telemetry')}
        description={translate(
          'auto.components.settings.Settings.c1b43dc4e2',
          'Anonymous usage data and telemetry controls.'
        )}
        searchEntries={getSearchEntries('privacy')}
      >
        {isMounted('privacy') ? <PrivacyPane settings={settings} /> : null}
      </SettingsSection>

      <SettingsSection
        id="advanced"
        title={translate('auto.components.settings.Settings.1c87f8d024', 'Advanced')}
        description={translate(
          'auto.components.settings.Settings.499c1cd7f9',
          'Low-level compatibility settings for troubleshooting.'
        )}
        searchEntries={getSearchEntries('advanced')}
      >
        {isMounted('advanced') ? (
          <AdvancedPane settings={settings} updateSettings={updateSettings} />
        ) : null}
      </SettingsSection>

      {import.meta.env.DEV ? (
        <SettingsSection
          id="dev"
          title={translate('auto.components.settings.Settings.dev', 'Dev Tools')}
          description={translate(
            'auto.components.settings.Settings.devDescription',
            'Dev-only tools for exercising UI states.'
          )}
          searchEntries={getSearchEntries('dev')}
        >
          {DevToolsPane && isMounted('dev') ? (
            <Suspense fallback={null}>
              <DevToolsPane />
            </Suspense>
          ) : null}
        </SettingsSection>
      ) : null}

      <SettingsSection
        id="experimental"
        title={translate('auto.components.settings.Settings.8b017f2506', 'Experimental')}
        description={translate(
          'auto.components.settings.Settings.075341c763',
          'New features that are still taking shape. Give them a try.'
        )}
        searchEntries={getSearchEntries('experimental')}
      >
        {isMounted('experimental') ? (
          <ExperimentalPane
            settings={settings}
            updateSettings={updateSettings}
            hiddenExperimentalUnlocked={hiddenExperimentalUnlocked}
          />
        ) : null}
      </SettingsSection>
    </>
  )
}

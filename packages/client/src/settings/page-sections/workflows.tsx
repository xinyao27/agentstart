import type { GlobalSettings } from '@agentstart/protocol/settings/global/model'
import type { SourceControlAiSettingsPatch } from '@agentstart/protocol/source-control/ai-types'
import type { ComponentProps } from 'react'
import type { WindowsTerminalCapabilities } from '~renderer/terminal/windows/capabilities'

import { translate } from '../../i18n/i18n'
import { AppearancePane } from '../appearance/pane'
import { CommitMessageAiPane } from '../commit-message-ai-pane'
import { GitPane } from '../git-pane'
import { GitProviderApiBudgetPane } from '../git-provider-api-budget-pane'
import { MobileEmulatorSettingsPane } from '../mobile/emulator-settings-pane'
import { MobileSettingsPane } from '../mobile/settings-pane'
import { NotificationsPane } from '../notifications-pane'
import { QuickCommandsPane } from '../quick-commands-pane'
import type { SettingsSearchEntry } from '../search'
import { SettingsSection } from '../section'
import type { SettingsSlice } from '../state'
import { TerminalPane } from '../terminal/pane'

type WorkflowSectionsProps = {
  applyTheme: ComponentProps<typeof AppearancePane>['applyTheme']
  displayedGitUsername: string
  fontSuggestions: string[]
  getSearchEntries: (sectionId: string) => SettingsSearchEntry[]
  ghostty: ComponentProps<typeof AppearancePane>['ghostty']
  hasUnsavedBranchPromptChanges: boolean
  hasUnsavedSourceControlAiPromptChanges: boolean
  isMounted: (sectionId: string) => boolean
  isWindowsTerminalHost: boolean
  onBranchPromptDirtyChange: (isDirty: boolean) => void
  onCommitPromptDirtyChange: (isDirty: boolean) => void
  onRequestFontSuggestions: () => void
  quickCommandAddIntentSignal: number
  scrollbackMode: 'preset' | 'custom'
  setScrollbackMode: (mode: 'preset' | 'custom') => void
  settings: GlobalSettings
  settingsSearchQuery: string
  sourceControlAiPromptDiscardSignal: number
  systemPrefersDark: boolean
  terminalFontSuggestions: string[]
  updateSettings: SettingsSlice['updateSettings']
  warpThemes: ComponentProps<typeof AppearancePane>['warpThemes']
  windowsTerminalCapabilities: WindowsTerminalCapabilities
  writeSourceControlAiSettings: (patch: SourceControlAiSettingsPatch) => Promise<void>
}

export function WorkflowSections({
  applyTheme,
  displayedGitUsername,
  fontSuggestions,
  getSearchEntries,
  ghostty,
  hasUnsavedBranchPromptChanges,
  hasUnsavedSourceControlAiPromptChanges,
  isMounted,
  isWindowsTerminalHost,
  onBranchPromptDirtyChange,
  onCommitPromptDirtyChange,
  onRequestFontSuggestions,
  quickCommandAddIntentSignal,
  scrollbackMode,
  setScrollbackMode,
  settings,
  settingsSearchQuery,
  sourceControlAiPromptDiscardSignal,
  systemPrefersDark,
  terminalFontSuggestions,
  updateSettings,
  warpThemes,
  windowsTerminalCapabilities,
  writeSourceControlAiSettings
}: WorkflowSectionsProps): React.JSX.Element {
  return (
    <>
      <SettingsSection
        id="mobile"
        title={translate('auto.components.settings.Settings.c40dadaac8', 'Mobile')}
        badge="Beta"
        description={translate(
          'auto.components.settings.Settings.c6c01ac209',
          'Control terminals and agents from your phone.'
        )}
        searchEntries={getSearchEntries('mobile')}
      >
        {isMounted('mobile') ? <MobileSettingsPane /> : null}
      </SettingsSection>

      <SettingsSection
        id="git"
        title={translate('auto.components.settings.Settings.70100f94c7', 'Git & Source Control')}
        description={translate(
          'auto.components.settings.Settings.cfa34f4465',
          'Branch naming, base refs, attribution, and Git AI Author.'
        )}
        searchEntries={getSearchEntries('git')}
        forceVisible={hasUnsavedSourceControlAiPromptChanges}
      >
        {isMounted('git') ? (
          <>
            <GitPane
              settings={settings}
              updateSettings={updateSettings}
              writeSourceControlAiSettings={writeSourceControlAiSettings}
              displayedGitUsername={displayedGitUsername}
              hasUnsavedBranchPromptChanges={hasUnsavedBranchPromptChanges}
              onBranchPromptDirtyChange={onBranchPromptDirtyChange}
              branchPromptDiscardSignal={sourceControlAiPromptDiscardSignal}
              settingsSearchQuery={settingsSearchQuery}
            />
            <CommitMessageAiPane
              settings={settings}
              updateSettings={updateSettings}
              writeSourceControlAiSettings={writeSourceControlAiSettings}
              onCustomPromptDirtyChange={onCommitPromptDirtyChange}
              customPromptDiscardSignal={sourceControlAiPromptDiscardSignal}
              settingsSearchQuery={settingsSearchQuery}
            />
            <GitProviderApiBudgetPane settingsSearchQuery={settingsSearchQuery} />
          </>
        ) : null}
      </SettingsSection>

      <SettingsSection
        id="terminal"
        title={translate('auto.components.settings.Settings.3de4bbb841', 'Terminal')}
        description={translate(
          'auto.components.settings.Settings.b79b5b31e9',
          'Shells, renderer, sessions, and terminal behavior.'
        )}
        searchEntries={getSearchEntries('terminal')}
      >
        {isMounted('terminal') ? (
          <TerminalPane
            settings={settings}
            updateSettings={updateSettings}
            scrollbackMode={scrollbackMode}
            setScrollbackMode={setScrollbackMode}
            wslAvailable={windowsTerminalCapabilities.wslAvailable}
            wslDistros={windowsTerminalCapabilities.wslDistros}
            wslCapabilitiesLoading={windowsTerminalCapabilities.isLoading}
            pwshAvailable={windowsTerminalCapabilities.pwshAvailable}
            gitBashAvailable={windowsTerminalCapabilities.gitBashAvailable}
            isWindowsTerminalHost={isWindowsTerminalHost}
          />
        ) : null}
      </SettingsSection>

      <SettingsSection
        id="quick-commands"
        title={translate('auto.components.settings.Settings.13d4fe30ad', 'Quick Commands')}
        description={translate(
          'auto.components.settings.Settings.6742c7932c',
          'Saved terminal commands, scoped globally or per project.'
        )}
        searchEntries={getSearchEntries('quick-commands')}
      >
        {isMounted('quick-commands') ? (
          <QuickCommandsPane
            settings={settings}
            updateSettings={updateSettings}
            addCommandIntentSignal={quickCommandAddIntentSignal}
          />
        ) : null}
      </SettingsSection>

      <SettingsSection
        id="mobile-emulator"
        title={translate('auto.components.settings.Settings.f75daf1002', 'Mobile Emulator')}
        description={translate(
          'auto.components.settings.Settings.01f9d36292',
          'Configure mobile emulator support for AgentStart and coding agents.'
        )}
        searchEntries={getSearchEntries('mobile-emulator')}
      >
        {isMounted('mobile-emulator') ? (
          <MobileEmulatorSettingsPane settings={settings} updateSettings={updateSettings} />
        ) : null}
      </SettingsSection>

      <SettingsSection
        id="appearance"
        title={translate('auto.components.settings.Settings.2b4474780a', 'Appearance')}
        description={translate(
          'auto.components.settings.Settings.6d1a27e193',
          'Theme, zoom, app and terminal appearance, sidebars, and status bar.'
        )}
        searchEntries={getSearchEntries('appearance')}
      >
        {isMounted('appearance') ? (
          <AppearancePane
            settings={settings}
            updateSettings={updateSettings}
            applyTheme={applyTheme}
            fontSuggestions={fontSuggestions}
            terminalFontSuggestions={terminalFontSuggestions}
            onRequestFontSuggestions={onRequestFontSuggestions}
            systemPrefersDark={systemPrefersDark}
            ghostty={ghostty}
            warpThemes={warpThemes}
          />
        ) : null}
      </SettingsSection>

      <SettingsSection
        id="notifications"
        title={translate('auto.components.settings.Settings.9907545fa3', 'Notifications')}
        description={translate(
          'auto.components.settings.Settings.7210ac09c4',
          'System notifications for agent activity and terminal events.'
        )}
        searchEntries={getSearchEntries('notifications')}
      >
        {isMounted('notifications') ? (
          <NotificationsPane settings={settings} updateSettings={updateSettings} />
        ) : null}
      </SettingsSection>
    </>
  )
}

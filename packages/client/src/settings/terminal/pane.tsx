import type { GlobalSettings } from '@agentstart/protocol/settings/global/model'
import { translate } from '~renderer/i18n/i18n'
import { CursorClick, Gear, List, Monitor, Play, TerminalWindow } from '~renderer/icons/hugeicons'
import { useAppStore } from '~renderer/store/state'
import { isMacUserAgent, isWindowsUserAgent } from '~renderer/terminal-pane/pane-interactions'

import { SettingsGroupCards, type SettingsGroup } from '../group-card'
import { ManageSessionsSection } from '../manage-sessions-section'
import { TerminalAdvancedSection } from './advanced-section'
import { TerminalInteractionSection } from './interaction-section'
import { TerminalRenderingSection } from './rendering-section'
import {
  getManageSessionsSearchEntries,
  getTerminalAdvancedSearchEntries,
  getTerminalMacOptionSearchEntries,
  getTerminalMacYenSearchEntries,
  getTerminalPaneInteractionSearchEntries,
  getTerminalRenderingSearchEntries,
  getTerminalSetupScriptSearchEntries
} from './search'
import { TerminalSetupScriptSection } from './setup-script-section'
import {
  getTerminalRightClickToPasteSearchEntry,
  getTerminalWindowsPowershellImplementationSearchEntry,
  getTerminalWindowsShellSearchEntry
} from './windows-search'
import { TerminalWindowsShellSection } from './windows-shell-section'

type TerminalPaneProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
  scrollbackMode: 'preset' | 'custom'
  setScrollbackMode: (mode: 'preset' | 'custom') => void
  /** Deprecated: WSL selection now belongs to Project Runtime settings. */
  wslAvailable?: boolean
  /** Deprecated: WSL selection now belongs to Project Runtime settings. */
  wslDistros?: string[]
  /** Deprecated: WSL selection now belongs to Project Runtime settings. */
  wslCapabilitiesLoading?: boolean
  /** Whether PowerShell 7+ (pwsh.exe) is installed on this Windows machine. */
  pwshAvailable?: boolean
  /** Whether Git for Windows bash.exe is installed on this machine. */
  gitBashAvailable?: boolean
  /** Whether the active terminal host is Windows, even if the client is not. */
  isWindowsTerminalHost?: boolean
}

export function TerminalPane({
  settings,
  updateSettings,
  scrollbackMode,
  setScrollbackMode,
  pwshAvailable,
  gitBashAvailable = false,
  isWindowsTerminalHost
}: TerminalPaneProps): React.JSX.Element {
  const searchQuery = useAppStore((state) => state.settingsSearchQuery)
  const isWindows = isWindowsUserAgent()
  const showWindowsHostSettings = isWindowsTerminalHost ?? isWindows
  const isMac = isMacUserAgent()
  const rawWindowsShell = settings.terminalWindowsShell ?? 'powershell.exe'
  const windowsShell = rawWindowsShell === 'wsl.exe' ? 'powershell.exe' : rawWindowsShell
  const showWindowsPowerShellImplementation =
    showWindowsHostSettings && windowsShell === 'powershell.exe'

  const groups: SettingsGroup[] = []

  if (showWindowsHostSettings) {
    groups.push({
      id: 'terminal-windows-shell',
      icon: <TerminalWindow aria-hidden="true" />,
      title: translate('auto.components.settings.TerminalPane.87e678a8af', 'Windows Shell'),
      summary: translate(
        'auto.components.settings.TerminalPane.a55eee649f',
        'Default shell for new terminal panes on Windows.'
      ),
      searchEntries: getTerminalWindowsShellSearchEntry(),
      content: (
        <TerminalWindowsShellSection
          updateSettings={updateSettings}
          windowsShell={windowsShell}
          gitBashAvailable={gitBashAvailable}
        />
      )
    })
  }

  groups.push(
    {
      id: 'terminal-rendering',
      icon: <Monitor aria-hidden="true" />,
      title: translate('auto.components.settings.TerminalPane.2fba319f21', 'Rendering'),
      summary: translate(
        'auto.components.settings.TerminalPane.72bc9334a0',
        'Terminal renderer behavior for live panes and new panes.'
      ),
      searchEntries: getTerminalRenderingSearchEntries(),
      content: <TerminalRenderingSection settings={settings} updateSettings={updateSettings} />
    },
    {
      id: 'terminal-interaction',
      icon: <CursorClick aria-hidden="true" />,
      title: translate('auto.components.settings.TerminalPane.45721f3e67', 'Terminal Interaction'),
      summary: translate(
        'auto.components.settings.TerminalPane.96fe15def8',
        'Mouse and clipboard behavior for terminal panes.'
      ),
      searchEntries: [
        ...getTerminalPaneInteractionSearchEntries(),
        ...getTerminalRightClickToPasteSearchEntry()
      ],
      content: (
        <TerminalInteractionSection
          settings={settings}
          updateSettings={updateSettings}
          searchQuery={searchQuery}
        />
      )
    },
    {
      id: 'terminal-setup-script',
      icon: <Play aria-hidden="true" />,
      title: translate(
        'auto.components.settings.TerminalPane.21f8da2078',
        'Workspace Setup Script'
      ),
      summary: translate(
        'auto.components.settings.TerminalPane.34a0dfa06e',
        'Where the repository setup script runs when a new workspace is created.'
      ),
      searchEntries: getTerminalSetupScriptSearchEntries(),
      content: <TerminalSetupScriptSection settings={settings} updateSettings={updateSettings} />
    },
    {
      id: 'terminal-manage-sessions',
      icon: <List aria-hidden="true" />,
      title: translate(
        'auto.components.settings.ManageSessionsSection.d1b80fd5cd',
        'Manage Sessions'
      ),
      summary: translate(
        'auto.components.settings.ManageSessionsSection.7c4889a724',
        'Recover from a frozen or misbehaving terminal by killing sessions or restarting the underlying daemon.'
      ),
      searchEntries: getManageSessionsSearchEntries(),
      content: <ManageSessionsSection />
    }
  )

  // Why: the advanced card hides rows behind platform gates; its search
  // entries must honor the same gates so the card only surfaces when a
  // visible row actually matches.
  const advancedSearchEntries = [
    ...getTerminalAdvancedSearchEntries(),
    ...(showWindowsPowerShellImplementation
      ? getTerminalWindowsPowershellImplementationSearchEntry()
      : []),
    ...(isMac ? [...getTerminalMacOptionSearchEntries(), ...getTerminalMacYenSearchEntries()] : [])
  ]
  groups.push({
    id: 'terminal-advanced',
    icon: <Gear aria-hidden="true" />,
    title: translate('auto.components.settings.TerminalPane.5e5f06c82c', 'Advanced'),
    summary: translate(
      'auto.components.settings.TerminalPane.267d020745',
      'Scrollback, word boundaries, and platform-specific terminal behaviors.'
    ),
    searchEntries: advancedSearchEntries,
    content: (
      <TerminalAdvancedSection
        settings={settings}
        updateSettings={updateSettings}
        scrollbackMode={scrollbackMode}
        setScrollbackMode={setScrollbackMode}
        searchQuery={searchQuery}
        showWindowsPowerShellImplementation={showWindowsPowerShellImplementation}
        pwshAvailable={pwshAvailable}
        isMac={isMac}
      />
    )
  })

  return <SettingsGroupCards groups={groups} defaultOpenId="terminal-rendering" />
}

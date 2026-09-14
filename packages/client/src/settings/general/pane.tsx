import type { GlobalSettings } from '@agentstart/protocol/settings/global/model'
import type React from 'react'
import { translate } from '~renderer/i18n/i18n'
import {
  FileText,
  FolderSimple,
  Monitor,
  SidebarSimple,
  Star,
  TerminalWindow
} from '~renderer/icons/hugeicons'
import { ArrowClockwise } from '~renderer/icons/hugeicons'
import { useAppStore } from '~renderer/store/state'

import { CliSection } from '../cli-section'
import { DefaultWindowsProjectRuntimeSetting } from '../default-windows-project-runtime-setting'
import { SettingsSwitchRow } from '../form-controls'
import { SettingsGroupCards, type SettingsGroup } from '../group-card'
import { RecentTabOrderControl } from '../recent-tab-order-control'
import { matchesSettingsSearch, type SettingsSearchEntry } from '../search'
import { SearchableSetting } from '../searchable-setting'
import { GeneralEditorSettingsSection } from './editor-settings-section'
import { getGeneralProjectRuntimeSearchEntries } from './project-runtime-search'
import {
  getGeneralCliSearchEntries,
  getGeneralEditorSearchEntries,
  getGeneralNavigationSearchEntries,
  getGeneralSupportSearchEntries,
  getGeneralUpdateSearchEntries,
  getGeneralWorkspaceSearchEntries
} from './search'
import { GeneralSupportSection } from './support-section'
import { GeneralUpdateSettingsSection } from './update-settings-section'
import { GeneralWorkspaceSettingsSection } from './workspace-settings-section'

type GeneralSearchEntry = ReturnType<typeof getGeneralNavigationSearchEntries>[number]

function getDesktopPlatformFromUserAgent(userAgent: string): 'darwin' | 'win32' | 'other' {
  if (userAgent.includes('Mac')) {
    return 'darwin'
  }
  if (userAgent.includes('Windows')) {
    return 'win32'
  }
  return 'other'
}

/**
 * The Project Runtime section is Windows-only. Gate on the platform directly:
 * an empty search query makes matchesSettingsSearch return true even for an
 * empty entries array, which would otherwise render an orphaned header (the
 * inner control self-hides) on non-Windows hosts.
 */
function shouldShowProjectRuntimeSection(
  wslSupportedPlatform: boolean | undefined,
  searchQuery: string,
  projectRuntimeSearchEntries: SettingsSearchEntry[]
): boolean {
  return (
    Boolean(wslSupportedPlatform) && matchesSettingsSearch(searchQuery, projectRuntimeSearchEntries)
  )
}

function getTabOrderControlSearchKeywords(
  navigationEntries: GeneralSearchEntry[] = getGeneralNavigationSearchEntries()
): string[] {
  const tabOrderSearchEntry = navigationEntries[0]
  return tabOrderSearchEntry
    ? [
        tabOrderSearchEntry.title,
        tabOrderSearchEntry.description ?? '',
        ...(tabOrderSearchEntry.keywords ?? [])
      ]
    : []
}

const EMPTY_WSL_DISTROS: string[] = []

type GeneralPaneProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
  fontSuggestions: string[]
  onRequestFontSuggestions?: () => void
  wslSupportedPlatform?: boolean
  wslAvailable?: boolean
  wslDistros?: string[]
  wslCapabilitiesLoading?: boolean
}

export function GeneralPane({
  settings,
  updateSettings,
  fontSuggestions,
  onRequestFontSuggestions,
  wslSupportedPlatform,
  wslAvailable,
  wslDistros = EMPTY_WSL_DISTROS,
  wslCapabilitiesLoading
}: GeneralPaneProps): React.JSX.Element {
  const searchQuery = useAppStore((s) => s.settingsSearchQuery)
  const generalNavigationSearchEntries = getGeneralNavigationSearchEntries()
  const tabOrderKeywords = getTabOrderControlSearchKeywords(generalNavigationSearchEntries)
  const projectRuntimeSearchEntries = wslSupportedPlatform
    ? getGeneralProjectRuntimeSearchEntries()
    : []

  const groups: SettingsGroup[] = [
    {
      id: 'general-navigation',
      icon: <SidebarSimple aria-hidden="true" />,
      title: translate('auto.components.settings.GeneralPane.d58fccfd84', 'Navigation'),
      searchEntries: generalNavigationSearchEntries,
      content: (
        <div className="divide-border/40 divide-y">
          <RecentTabOrderControl
            ctrlTabOrderMode={settings.ctrlTabOrderMode ?? 'mru'}
            keywords={tabOrderKeywords}
            updateSettings={updateSettings}
          />
          <SearchableSetting
            title={translate(
              'auto.components.settings.GeneralPane.5cb5475664',
              'Confirm before closing pinned tabs'
            )}
            description={translate(
              'auto.components.settings.GeneralPane.36b2a5dc6d',
              'Show a confirmation dialog before a pinned tab is closed.'
            )}
            keywords={['pinned', 'tab', 'confirm', 'close']}
          >
            <SettingsSwitchRow
              label={translate(
                'auto.components.settings.GeneralPane.5cb5475664',
                'Confirm before closing pinned tabs'
              )}
              description={translate(
                'auto.components.settings.GeneralPane.36b2a5dc6d',
                'Show a confirmation dialog before a pinned tab is closed.'
              )}
              checked={settings.confirmClosePinnedTab ?? true}
              onChange={() =>
                updateSettings({ confirmClosePinnedTab: !(settings.confirmClosePinnedTab ?? true) })
              }
            />
          </SearchableSetting>
        </div>
      )
    },
    {
      id: 'general-workspace',
      icon: <FolderSimple aria-hidden="true" />,
      title: translate(
        'auto.components.settings.GeneralWorkspaceSettingsSection.7511097c5d',
        'Workspace'
      ),
      summary: translate(
        'auto.components.settings.GeneralWorkspaceSettingsSection.e2955d9ccb',
        'Configure where new workspaces are created.'
      ),
      searchEntries: getGeneralWorkspaceSearchEntries(),
      content: (
        <GeneralWorkspaceSettingsSection settings={settings} updateSettings={updateSettings} />
      )
    }
  ]

  if (
    shouldShowProjectRuntimeSection(wslSupportedPlatform, searchQuery, projectRuntimeSearchEntries)
  ) {
    groups.push({
      id: 'general-project-runtime',
      icon: <Monitor aria-hidden="true" />,
      title: translate('auto.components.settings.GeneralPane.projectRuntime', 'Project Runtime'),
      summary: translate(
        'auto.components.settings.GeneralPane.projectRuntimeDescription',
        'Default runtime for local Windows projects that do not override it.'
      ),
      searchEntries: projectRuntimeSearchEntries,
      content: (
        <DefaultWindowsProjectRuntimeSetting
          settings={settings}
          updateSettings={updateSettings}
          wslSupportedPlatform={Boolean(wslSupportedPlatform)}
          wslAvailable={Boolean(wslAvailable)}
          wslDistros={wslDistros}
          wslCapabilitiesLoading={Boolean(wslCapabilitiesLoading)}
        />
      )
    })
  }

  groups.push(
    {
      id: 'general-editor',
      icon: <FileText aria-hidden="true" />,
      title: translate(
        'auto.components.settings.GeneralEditorSettingsSection.45c6e85c4d',
        'Editor'
      ),
      summary: translate(
        'auto.components.settings.GeneralEditorSettingsSection.d21136d9ef',
        'Configure how AgentStart persists file edits.'
      ),
      searchEntries: getGeneralEditorSearchEntries(),
      content: (
        <GeneralEditorSettingsSection
          settings={settings}
          updateSettings={updateSettings}
          fontSuggestions={fontSuggestions}
          onRequestFontSuggestions={onRequestFontSuggestions}
        />
      )
    },
    {
      id: 'general-cli',
      icon: <TerminalWindow aria-hidden="true" />,
      title: translate('auto.components.settings.CliSection.c5c0f2641d', 'AgentStart CLI'),
      summary: translate(
        'auto.components.settings.CliSection.6930feda9e',
        'Use AgentStart from your terminal to open the app, manage worktrees, and interact with AgentStart terminals.'
      ),
      searchEntries: getGeneralCliSearchEntries(),
      content: (
        <CliSection
          currentPlatform={getDesktopPlatformFromUserAgent(navigator.userAgent)}
          settings={settings}
          wslSupportedPlatform={wslSupportedPlatform}
          wslAvailable={wslAvailable}
          wslCapabilitiesLoading={wslCapabilitiesLoading}
        />
      )
    },
    {
      id: 'general-updates',
      icon: <ArrowClockwise aria-hidden="true" />,
      title: translate(
        'auto.components.settings.GeneralUpdateSettingsSection.f2b1ccc12a',
        'Updates'
      ),
      searchEntries: getGeneralUpdateSearchEntries(),
      content: <GeneralUpdateSettingsSection />
    },
    {
      id: 'general-support',
      icon: <Star aria-hidden="true" />,
      title: translate(
        'auto.components.settings.GeneralSupportSection.55a87e5fd1',
        'Support AgentStart'
      ),
      searchEntries: getGeneralSupportSearchEntries(),
      content: <GeneralSupportSection />
    }
  )

  return <SettingsGroupCards groups={groups} defaultOpenId="general-navigation" />
}

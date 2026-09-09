import type { GlobalSettings } from '@yiru/protocol/settings/global/model'
import type { StatusBarItem } from '@yiru/protocol/settings/ui-state'
import type { FeatureInteractionId } from '@yiru/protocol/telemetry/interactions/catalog'
import type React from 'react'
import { translate } from '~renderer/i18n/i18n'
import { useAvailableStatusBarToggles } from '~renderer/status-bar/use-available-status-bar-toggles'
import { useAppStore } from '~renderer/store/state'

import {
  SettingsRow,
  SettingsSegmentedControl,
  SettingsSubsectionHeader,
  SettingsSwitchRow
} from '../form-controls'
import { LeftSidebarAppearanceSetting } from '../left-sidebar-appearance-setting'
import { matchesSettingsSearch, normalizeSettingsSearchQuery } from '../search'
import { SearchableSetting } from '../searchable-setting'
import { AppearanceAdvancedDisclosure } from './advanced-disclosure'
import {
  getLayoutEntries,
  getSidebarEntries,
  getStatusBarToggles,
  getUsagePercentageDisplayEntry
} from './search'
import {
  getLeftSidebarAppearanceEntry,
  getShowPinnedWorktreesInGroupsEntry
} from './sidebar-search'
import { USAGE_PERCENTAGE_DISPLAY_SETTING_ID } from './usage-percentage-search'

type AppearanceWindowSidebarSectionProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
  forceVisiblePrimary?: boolean
}

function recordStatusBarToggleInteraction(
  id: StatusBarItem,
  recordFeatureInteraction: (feature: FeatureInteractionId) => void
): void {
  if (id === 'resource-usage') {
    recordFeatureInteraction('resource-manager')
  } else if (id === 'ports') {
    recordFeatureInteraction('ports')
  } else if (
    id === 'claude' ||
    id === 'codex' ||
    id === 'cursor' ||
    id === 'gemini' ||
    id === 'opencode-go' ||
    id === 'kimi' ||
    id === 'antigravity' ||
    id === 'minimax' ||
    id === 'grok'
  ) {
    recordFeatureInteraction('usage-tracking')
  }
}

export function AppearanceWindowSidebarSection({
  settings,
  updateSettings,
  forceVisiblePrimary = false
}: AppearanceWindowSidebarSectionProps): React.JSX.Element {
  const searchQuery = useAppStore((state) => state.settingsSearchQuery)
  const isSearching = normalizeSettingsSearchQuery(searchQuery).length > 0
  const statusBarItems = useAppStore((state) => state.statusBarItems)
  const toggleStatusBarItem = useAppStore((state) => state.toggleStatusBarItem)
  const usagePercentageDisplay = useAppStore((state) => state.usagePercentageDisplay)
  const setUsagePercentageDisplay = useAppStore((state) => state.setUsagePercentageDisplay)
  const recordFeatureInteraction = useAppStore((state) => state.recordFeatureInteraction)
  const visibleStatusBarToggles = useAvailableStatusBarToggles(getStatusBarToggles())
  const usagePercentageDisplayEntry = getUsagePercentageDisplayEntry()
  const leftSidebarAppearanceEntry = getLeftSidebarAppearanceEntry()
  const showPinnedWorktreesInGroupsEntry = getShowPinnedWorktreesInGroupsEntry()
  const sidebarEntries = getSidebarEntries()
  const layoutEntries = getLayoutEntries()
  const statusBarTitle = translate(
    'auto.components.settings.AppearancePane.3e4175e5c6',
    'Status Bar'
  )
  const statusBarDescription = translate(
    'auto.components.settings.AppearancePane.statusBarDescription',
    'Choose which indicators appear in the status bar.'
  )
  const statusBarKeywords = ['status bar', 'indicators']
  const statusBarSectionMatches = matchesSettingsSearch(searchQuery, {
    title: statusBarTitle,
    description: statusBarDescription,
    keywords: statusBarKeywords
  })
  const statusBarControlMatches =
    matchesSettingsSearch(searchQuery, usagePercentageDisplayEntry) ||
    visibleStatusBarToggles.some((toggle) =>
      matchesSettingsSearch(searchQuery, {
        title: toggle.title,
        description: toggle.description,
        keywords: toggle.keywords
      })
    )
  const sidebarAdvancedMatches = matchesSettingsSearch(searchQuery, sidebarEntries)
  const fileExplorerAdvancedMatches = matchesSettingsSearch(searchQuery, layoutEntries)
  const showStatusBarControls = !isSearching || statusBarSectionMatches || statusBarControlMatches
  const showSidebarAdvanced = !isSearching || sidebarAdvancedMatches
  const showFileExplorerAdvanced = !isSearching || fileExplorerAdvancedMatches
  const showAdvanced = showSidebarAdvanced || showFileExplorerAdvanced

  return (
    <div className="space-y-2">
      <div className="divide-border/40 divide-y">
        <SearchableSetting
          title={leftSidebarAppearanceEntry.title}
          description={leftSidebarAppearanceEntry.description}
          keywords={leftSidebarAppearanceEntry.keywords}
          className="space-y-2"
          forceVisible={forceVisiblePrimary}
        >
          <LeftSidebarAppearanceSetting settings={settings} updateSettings={updateSettings} />
        </SearchableSetting>

        <SearchableSetting
          title={statusBarTitle}
          keywords={statusBarKeywords}
          forceVisible={forceVisiblePrimary || statusBarSectionMatches || statusBarControlMatches}
        >
          <SettingsRow label={statusBarTitle} description={statusBarDescription} control={null} />
          {showStatusBarControls ? (
            <div className="divide-border/40 border-border/40 ml-4 divide-y border-t">
              <SearchableSetting
                id={USAGE_PERCENTAGE_DISPLAY_SETTING_ID}
                title={usagePercentageDisplayEntry.title}
                description={usagePercentageDisplayEntry.description}
                keywords={usagePercentageDisplayEntry.keywords}
              >
                <SettingsRow
                  label={usagePercentageDisplayEntry.title}
                  description={usagePercentageDisplayEntry.description}
                  control={
                    <SettingsSegmentedControl
                      ariaLabel={usagePercentageDisplayEntry.title}
                      value={usagePercentageDisplay}
                      onChange={setUsagePercentageDisplay}
                      options={[
                        {
                          value: 'used',
                          label: translate(
                            'auto.components.settings.AppearanceWindowSidebarSection.usagePercentageDisplayUsed',
                            'Used'
                          )
                        },
                        {
                          value: 'remaining',
                          label: translate(
                            'auto.components.settings.AppearanceWindowSidebarSection.usagePercentageDisplayRemaining',
                            'Remaining'
                          )
                        }
                      ]}
                    />
                  }
                />
              </SearchableSetting>

              {visibleStatusBarToggles.map((toggle) => {
                const enabled = statusBarItems.includes(toggle.id)
                return (
                  <SearchableSetting
                    key={toggle.id}
                    title={toggle.title}
                    description={toggle.description}
                    keywords={toggle.keywords}
                  >
                    <SettingsSwitchRow
                      label={toggle.title}
                      description={toggle.toggleDescription}
                      checked={enabled}
                      onChange={() => {
                        recordStatusBarToggleInteraction(toggle.id, recordFeatureInteraction)
                        toggleStatusBarItem(toggle.id)
                      }}
                      ariaLabel={toggle.title}
                    />
                  </SearchableSetting>
                )
              })}
            </div>
          ) : null}
        </SearchableSetting>
      </div>

      {showAdvanced ? (
        <AppearanceAdvancedDisclosure contentClassName="ml-4 pt-4">
          <div className="space-y-4">
            {showSidebarAdvanced ? (
              <div className="space-y-3">
                <SettingsSubsectionHeader
                  title={translate('auto.components.settings.AppearancePane.dc29f3cc0d', 'Sidebar')}
                />
                <div className="divide-border/40 ml-4 divide-y">
                  <SearchableSetting
                    title={translate(
                      'auto.components.settings.AppearancePane.9da1020447',
                      'Show Yiru Mobile Button'
                    )}
                    description={sidebarEntries[0]?.description}
                    keywords={sidebarEntries[0]?.keywords ?? ['mobile', 'phone', 'sidebar']}
                  >
                    <SettingsSwitchRow
                      label={translate(
                        'auto.components.settings.AppearancePane.9da1020447',
                        'Show Yiru Mobile Button'
                      )}
                      // Why: clarify where the shortcut still lives after hiding it, so users
                      // don't think the feature is gone.
                      description={translate(
                        'auto.components.settings.AppearancePane.61d842eca0',
                        'Show the Yiru Mobile shortcut in the sidebar. It remains available from Toolbox.'
                      )}
                      checked={settings.showMobileButton !== false}
                      onChange={() =>
                        updateSettings({ showMobileButton: !(settings.showMobileButton !== false) })
                      }
                    />
                  </SearchableSetting>

                  <SearchableSetting
                    title={showPinnedWorktreesInGroupsEntry.title}
                    description={showPinnedWorktreesInGroupsEntry.description}
                    keywords={showPinnedWorktreesInGroupsEntry.keywords}
                  >
                    <SettingsSwitchRow
                      label={showPinnedWorktreesInGroupsEntry.title}
                      description={showPinnedWorktreesInGroupsEntry.description}
                      checked={settings.showPinnedWorktreesInGroups === true}
                      onChange={() =>
                        updateSettings({
                          showPinnedWorktreesInGroups: settings.showPinnedWorktreesInGroups !== true
                        })
                      }
                    />
                  </SearchableSetting>
                </div>
              </div>
            ) : null}

            {showFileExplorerAdvanced ? (
              <div className="space-y-3">
                <SettingsSubsectionHeader
                  title={translate(
                    'auto.components.settings.AppearancePane.d496901cd0',
                    'File Explorer'
                  )}
                />
                <div className="divide-border/40 ml-4 divide-y">
                  <SearchableSetting
                    title={
                      layoutEntries[0]?.title ??
                      translate(
                        'auto.components.settings.AppearancePane.0fafabcf35',
                        'Show Git-Ignored Files'
                      )
                    }
                    description={layoutEntries[0]?.description}
                    keywords={layoutEntries[0]?.keywords ?? ['git', 'gitignore', 'ignored']}
                  >
                    <SettingsSwitchRow
                      label={translate(
                        'auto.components.settings.AppearancePane.0fafabcf35',
                        'Show Git-Ignored Files'
                      )}
                      // Why: define what "git-ignored" matches; the location (file explorer)
                      // is obvious from the section header.
                      description={translate(
                        'auto.components.settings.AppearancePane.gitIgnoredGlossary',
                        'Files matched by .gitignore.'
                      )}
                      checked={settings.showGitIgnoredFiles ?? true}
                      onChange={() =>
                        updateSettings({
                          showGitIgnoredFiles: !(settings.showGitIgnoredFiles ?? true)
                        })
                      }
                    />
                  </SearchableSetting>
                </div>
              </div>
            ) : null}
          </div>
        </AppearanceAdvancedDisclosure>
      ) : null}
    </div>
  )
}

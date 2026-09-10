import type { Repo } from '@agentstart/protocol/project/repository'
import { hasExtensionBrowserCapabilities } from '~renderer/extension/browser-capabilities'
import { translate } from '~renderer/i18n/i18n'
import { useUiLocale } from '~renderer/i18n/use-ui-locale'
import { SlidersHorizontal } from '~renderer/icons/hugeicons'
import { getRepoKindLabel } from '~renderer/project-catalog/kind-label'
import { useProjectCatalog } from '~renderer/project-catalog/provider'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'
import type { SettingsNavSection } from '~renderer/settings/navigation-types'
import { useAppStore } from '~renderer/store/state'
import { isMacUserAgent, isWindowsUserAgent } from '~renderer/terminal-pane/pane-interactions'
import {
  getWindowsTerminalCapabilityOwnerKey,
  useWindowsTerminalCapabilities
} from '~renderer/terminal/windows/capabilities'

import { buildNavigationCoreSections } from './navigation-core-sections'
import { buildNavigationWorkflowSections } from './navigation-workflow-sections'
import { buildSettingsProjectList } from './project-list'
import { getRepositoryPaneSearchEntries } from './repository/search'

function buildSettingsNavigationMetadata({
  isMac,
  isWindows,
  isWindowsTerminalHost = isWindows,
  isDev = import.meta.env.DEV,
  repos
}: {
  isMac: boolean
  isWindows: boolean
  isWindowsTerminalHost?: boolean
  isDev?: boolean
  repos: readonly Repo[]
}): SettingsNavSection[] {
  const reposById = new Map<string, Repo>()
  for (const repo of repos) {
    if (!reposById.has(repo.id)) {
      reposById.set(repo.id, repo)
    }
  }

  return [
    // Why: this order mirrors SETTINGS_NAV_GROUPS so Settings and Command Palette read
    // top-to-bottom in the same grouped order.
    ...buildNavigationCoreSections({
      isWindowsTerminalHost
    }),
    ...buildNavigationWorkflowSections({
      hasBrowserCapabilities: hasExtensionBrowserCapabilities(),
      isDev,
      isMac,
      isWindows,
      isWindowsTerminalHost
    }),
    // Why: one nav row per project, not per repo row — a project set up on
    // multiple hosts collapses to a single entry derived from repos alone.
    ...buildSettingsProjectList(repos).map(({ project, representativeRepoId, setups }) => {
      const representativeRepo = reposById.get(representativeRepoId) ?? repos[0]
      const hostSummary =
        setups.length > 1
          ? translate(
              'auto.hooks.useSettingsNavigationMetadata.projectHostsSummary',
              '{{value0}} hosts',
              { value0: setups.length }
            )
          : (setups[0]?.path ?? representativeRepo.path)
      return {
        id: `repo-${representativeRepoId}`,
        title: project.displayName,
        description: `${getRepoKindLabel(project)} • ${hostSummary}`,
        icon: SlidersHorizontal,
        searchEntries: getRepositoryPaneSearchEntries(representativeRepo, {
          windowsRuntimeSupported: isWindowsTerminalHost
        }),
        group: 'repositories'
      }
    })
  ]
}

export function useSettingsNavigationMetadata(): SettingsNavSection[] {
  // Why: translate() reads locale state implicitly; the subscription schedules
  // a new render when that external state changes.
  useUiLocale()
  const { repos } = useProjectCatalog()
  const settings = useAppStore((state) => state.settings)
  const isMac = isMacUserAgent()
  const isWindows = isWindowsUserAgent()
  const windowsTerminalCapabilityOwnerKey = getWindowsTerminalCapabilityOwnerKey(
    settings?.activeRuntimeEnvironmentId
  )
  const runtimeTarget = getActiveRuntimeTarget(settings)
  const windowsTerminalCapabilities = useWindowsTerminalCapabilities(
    isWindows || runtimeTarget.kind === 'environment',
    false,
    windowsTerminalCapabilityOwnerKey,
    runtimeTarget
  )
  const isWindowsTerminalHost = isWindows || windowsTerminalCapabilities.hostPlatform === 'win32'

  return (() =>
    buildSettingsNavigationMetadata({
      isMac,
      isWindows,
      isWindowsTerminalHost,
      isDev: import.meta.env.DEV,
      repos
    }))()
}

import { extensionShellExportApi } from '../extension/export'
import { getExtensionHostNavigation } from '../extension/navigation'
import { extensionShellNotificationsApi } from '../extension/notifications'
import { getBrowserShellApi } from './browser-shell-client'
import { getBrowserShellUIApi } from './browser-ui-shell-client'
import { shellAccountsApi, type ShellAccountsApi } from './shell-accounts-client'
import {
  shellKeybindingsApi,
  shellAgentStartProfilesApi,
  type ShellKeybindingsApi,
  type ShellAgentStartProfilesApi
} from './shell-configuration-client'
import type { ShellNotificationsApi } from './shell-notifications-client'
import { daemonShellPlatformApi, type ShellPlatformApi } from './shell-platform-client'
import {
  shellCrashReportsApi,
  shellDiagnosticsApi,
  shellFeedbackApi,
  shellTelemetryApi,
  type ShellCrashReportsApi,
  type ShellDiagnosticsApi,
  type ShellFeedbackApi,
  type ShellTelemetryApi
} from './shell-reporting-client'
import {
  shellCacheApi,
  shellOnboardingApi,
  shellSessionApi,
  shellSettingsApi,
  type ShellCacheApi,
  type ShellOnboardingApi,
  type ShellSessionApi,
  type ShellSettingsApi
} from './shell-state-client'
import {
  shellAppApi,
  shellGitHubApi,
  shellRepoHostApi,
  shellRuntimeStateApi,
  shellStarNagApi,
  shellUpdaterApi,
  type ShellAppApi,
  type ShellGitHubApi,
  type ShellRepoHostApi,
  type ShellRuntimeStateApi,
  type ShellStarNagApi,
  type ShellUpdaterApi
} from './shell-system-client'
import {
  shellDeveloperPermissionsApi,
  shellLocalhostWorktreeLabelsApi,
  shellMiniMaxCredentialsApi,
  shellMobileApi,
  type ShellDeveloperPermissionsApi,
  type ShellExportApi,
  type ShellLocalhostWorktreeLabelsApi,
  type ShellMiniMaxCredentialsApi,
  type ShellMobileApi
} from './shell-tools-client'
import type { ShellUiApi } from './shell-ui-client'
import { getWorkbenchLocation } from './workbench-location'

type RendererShellClient = {
  accounts: ShellAccountsApi
  app: ShellAppApi
  crashReports: ShellCrashReportsApi
  developerPermissions: ShellDeveloperPermissionsApi
  diagnostics: ShellDiagnosticsApi
  export: ShellExportApi
  feedback: ShellFeedbackApi
  repoHost: ShellRepoHostApi
  runtime: ShellRuntimeStateApi
  gh: ShellGitHubApi
  notifications: ShellNotificationsApi
  localhostWorktreeLabels: ShellLocalhostWorktreeLabelsApi
  minimaxCredentials: ShellMiniMaxCredentialsApi
  mobile: ShellMobileApi
  starNag: ShellStarNagApi
  updater: ShellUpdaterApi
  telemetry: ShellTelemetryApi
  shell: ShellPlatformApi
  ui: ShellUiApi
  settings: ShellSettingsApi
  session: ShellSessionApi
  onboarding: ShellOnboardingApi
  cache: ShellCacheApi
  keybindings: ShellKeybindingsApi
  agentstartProfiles: ShellAgentStartProfilesApi
}

function getShellPlatformApi(): ShellPlatformApi {
  const browserShell = getBrowserShellApi()
  return {
    ...daemonShellPlatformApi,
    // Why: opening a web destination and selecting browser-readable image content belong to the
    // extension renderer; absolute paths and OS launches remain daemon capabilities.
    openUrl: async (url) => {
      const location = getWorkbenchLocation()
      await getExtensionHostNavigation().openExternalUrl({
        url,
        ...(location.kind === 'project' ? { projectId: location.projectId } : {})
      })
    },
    pickRepoIconImage: browserShell.pickRepoIconImage
  }
}

// Why: feature code targets one shell adapter while the extension combines browser-owned
// capabilities with authenticated daemon capabilities behind the same shape.
export const shellClient: RendererShellClient = {
  accounts: shellAccountsApi,
  app: shellAppApi,
  crashReports: shellCrashReportsApi,
  developerPermissions: shellDeveloperPermissionsApi,
  diagnostics: shellDiagnosticsApi,
  export: extensionShellExportApi,
  feedback: shellFeedbackApi,
  repoHost: shellRepoHostApi,
  runtime: shellRuntimeStateApi,
  gh: shellGitHubApi,
  notifications: extensionShellNotificationsApi,
  localhostWorktreeLabels: shellLocalhostWorktreeLabelsApi,
  minimaxCredentials: shellMiniMaxCredentialsApi,
  mobile: shellMobileApi,
  starNag: shellStarNagApi,
  updater: shellUpdaterApi,
  telemetry: shellTelemetryApi,
  get shell() {
    return getShellPlatformApi()
  },
  ui: getBrowserShellUIApi(),
  settings: shellSettingsApi,
  session: shellSessionApi,
  onboarding: shellOnboardingApi,
  cache: shellCacheApi,
  keybindings: shellKeybindingsApi,
  agentstartProfiles: shellAgentStartProfilesApi
}

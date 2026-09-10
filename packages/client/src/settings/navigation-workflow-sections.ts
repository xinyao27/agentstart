import { translate } from '~renderer/i18n/i18n'
import {
  Bug,
  Flask as FlaskConical,
  GitMerge,
  Lock,
  Play,
  ShareNetwork,
  ShieldCheck,
  Devices as TabletSmartphone,
  TerminalWindow as SquareTerminal,
  Wrench
} from '~renderer/icons/hugeicons'
import { getAdvancedPaneSearchEntries } from '~renderer/settings/advanced-search'
import { getCommitMessageAiPaneSearchEntries } from '~renderer/settings/commit-message-ai-search'
import { getDeveloperPermissionsPaneSearchEntries } from '~renderer/settings/developer-permissions-search'
import { getExperimentalPaneSearchEntries } from '~renderer/settings/experimental-search'
import { getGitProviderApiBudgetSearchEntries } from '~renderer/settings/git-provider-api-budget-search'
import { getGitPaneSearchEntries } from '~renderer/settings/git-search'
import { getMobileEmulatorSearchEntries } from '~renderer/settings/mobile/emulator-search'
import type { SettingsNavSection } from '~renderer/settings/navigation-types'
import { getPrivacyPaneSearchEntries } from '~renderer/settings/privacy-search'
import { getQuickCommandsPaneSearchEntries } from '~renderer/settings/quick-commands-search'
import { getRuntimeEnvironmentsSearchEntry } from '~renderer/settings/runtime-environments-search'

import { getTerminalPaneSearchEntries } from './terminal/search'

type NavigationWorkflowSectionsParams = {
  hasBrowserCapabilities: boolean
  isDev: boolean
  isMac: boolean
  isWindows: boolean
  isWindowsTerminalHost: boolean
}

function getDevToolsPaneSearchEntries(): SettingsNavSection['searchEntries'] {
  return [
    {
      title: translate(
        'auto.hooks.useSettingsNavigationMetadata.devSearchNotificationPlayground',
        'Notification playground'
      ),
      description: translate(
        'auto.hooks.useSettingsNavigationMetadata.devSearchNotificationPlaygroundDescription',
        'Trigger representative toast and notification UI states.'
      ),
      keywords: [
        translate('auto.hooks.useSettingsNavigationMetadata.devSearchKeywordDev', 'dev'),
        translate('auto.hooks.useSettingsNavigationMetadata.devSearchKeywordToast', 'toast'),
        translate('auto.hooks.useSettingsNavigationMetadata.devSearchKeywordSonner', 'sonner'),
        translate('auto.hooks.useSettingsNavigationMetadata.devSearchKeywordError', 'error'),
        translate(
          'auto.hooks.useSettingsNavigationMetadata.devSearchKeywordNotification',
          'notification'
        )
      ]
    }
  ]
}

export function buildNavigationWorkflowSections({
  hasBrowserCapabilities,
  isDev,
  isMac,
  isWindows,
  isWindowsTerminalHost
}: NavigationWorkflowSectionsParams): SettingsNavSection[] {
  const terminalPaneSearchEntries = getTerminalPaneSearchEntries({
    isWindows,
    isWindowsTerminalHost,
    isMac
  })
  const runtimeEnvironmentsSearchEntry = getRuntimeEnvironmentsSearchEntry()

  return [
    {
      id: 'git',
      title: translate(
        'auto.hooks.useSettingsNavigationMetadata.09607cb0fe',
        'Git & Source Control'
      ),
      description: translate(
        'auto.hooks.useSettingsNavigationMetadata.ab4b21b58e',
        'Branch naming, base refs, attribution, and Git AI Author.'
      ),
      icon: GitMerge,
      // Why: Git AI Author is rendered inside Git, so shared metadata must
      // search both surfaces wherever Git appears.
      searchEntries: [
        ...getGitPaneSearchEntries(),
        ...getCommitMessageAiPaneSearchEntries(),
        ...getGitProviderApiBudgetSearchEntries()
      ],
      group: 'workflows'
    },
    {
      id: 'terminal',
      title: translate('auto.hooks.useSettingsNavigationMetadata.a9fb10afca', 'Terminal'),
      description: translate(
        'auto.hooks.useSettingsNavigationMetadata.c33bfd664c',
        'Shells, renderer, sessions, and terminal behavior.'
      ),
      icon: SquareTerminal,
      searchEntries: terminalPaneSearchEntries,
      group: 'workflows'
    },
    {
      id: 'quick-commands',
      title: translate('auto.hooks.useSettingsNavigationMetadata.3fc3db144f', 'Quick Commands'),
      description: translate(
        'auto.hooks.useSettingsNavigationMetadata.42ae40842f',
        'Saved terminal commands, scoped globally or per project.'
      ),
      icon: Play,
      searchEntries: getQuickCommandsPaneSearchEntries(),
      group: 'workflows'
    },
    {
      id: 'mobile-emulator',
      title: translate('auto.hooks.useSettingsNavigationMetadata.1e761cff2b', 'Mobile Emulator'),
      description: translate(
        'auto.hooks.useSettingsNavigationMetadata.3d65d3f1b9',
        'Configure mobile emulator support for AgentStart and coding agents.'
      ),
      icon: TabletSmartphone,
      searchEntries: getMobileEmulatorSearchEntries(),
      group: 'workflows'
    },
    {
      id: 'runtime-environments',
      title: translate(
        'auto.hooks.useSettingsNavigationMetadata.runtimeEnvironmentsTitle',
        'Runtime Hosts'
      ),
      description: translate(
        'auto.hooks.useSettingsNavigationMetadata.runtimeEnvironmentsDescription',
        'Connect to AgentStart daemons on this computer or remote hosts.'
      ),
      icon: ShareNetwork,
      searchEntries: [runtimeEnvironmentsSearchEntry],
      group: 'workflows'
    },
    ...(isMac
      ? [
          {
            id: 'developer-permissions',
            title: translate(
              'auto.hooks.useSettingsNavigationMetadata.d91ae31fbd',
              'macOS Permissions'
            ),
            description: translate(
              'auto.hooks.useSettingsNavigationMetadata.65ec7d1968',
              'macOS privacy access for terminal-launched developer tools.'
            ),
            icon: ShieldCheck,
            searchEntries: getDeveloperPermissionsPaneSearchEntries(),
            group: 'security'
          }
        ]
      : []),
    {
      id: 'privacy',
      title: translate(
        'auto.hooks.useSettingsNavigationMetadata.3618579df6',
        'Privacy & Telemetry'
      ),
      description: translate(
        'auto.hooks.useSettingsNavigationMetadata.8400cfe1c1',
        'Anonymous usage data and telemetry controls.'
      ),
      icon: Lock,
      searchEntries: getPrivacyPaneSearchEntries({
        includeBrowserContext: true
      }),
      group: 'security'
    },
    {
      id: 'advanced',
      title: translate('auto.hooks.useSettingsNavigationMetadata.580a04cd81', 'Advanced'),
      description: translate(
        'auto.hooks.useSettingsNavigationMetadata.e338c507c1',
        'Low-level compatibility settings for troubleshooting.'
      ),
      icon: Wrench,
      searchEntries: getAdvancedPaneSearchEntries({
        includeBrowserSettings: hasBrowserCapabilities
      }),
      group: 'advanced'
    },
    ...(import.meta.env.DEV && isDev
      ? [
          {
            id: 'dev',
            title: translate('auto.hooks.useSettingsNavigationMetadata.dev', 'Dev Tools'),
            description: translate(
              'auto.hooks.useSettingsNavigationMetadata.devDescription',
              'Dev-only tools for exercising UI states.'
            ),
            // Why: distinct from the sibling Advanced section's Wrench so the two
            // entries in the same 'advanced' group stay visually distinguishable.
            icon: Bug,
            searchEntries: getDevToolsPaneSearchEntries(),
            group: 'advanced',
            badge: translate('auto.hooks.useSettingsNavigationMetadata.devBadge', 'Dev')
          }
        ]
      : []),
    {
      id: 'experimental',
      title: translate('auto.hooks.useSettingsNavigationMetadata.225071c560', 'Experimental'),
      description: translate(
        'auto.hooks.useSettingsNavigationMetadata.4a728cd56b',
        'New features that are still taking shape. Give them a try.'
      ),
      icon: FlaskConical,
      searchEntries: getExperimentalPaneSearchEntries(),
      group: 'experimental'
    }
  ]
}

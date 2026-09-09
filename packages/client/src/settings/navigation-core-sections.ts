import { translate } from '~renderer/i18n/i18n'
import {
  Bell,
  Stack as Blocks,
  Robot as Bot,
  Keyboard,
  CursorClick as MousePointerClick,
  Network,
  Palette,
  DeviceMobile as Smartphone,
  SlidersHorizontal,
  UserGear as UserCog
} from '~renderer/icons/hugeicons'
import { getAccountsPaneSearchEntries } from '~renderer/settings/accounts-search'
import { getAgentsPaneSearchEntries } from '~renderer/settings/agents-search'
import { getComputerUsePaneSearchEntries } from '~renderer/settings/computer-use-search'
import { getGeneralPaneSearchEntries } from '~renderer/settings/general/search'
import { getIntegrationsPaneSearchEntries } from '~renderer/settings/integrations-search'
import { getMobileSettingsPaneSearchEntries } from '~renderer/settings/mobile/settings-search'
import type { SettingsNavSection } from '~renderer/settings/navigation-types'
import { getNotificationsPaneSearchEntries } from '~renderer/settings/notifications-search'
import { getOrchestrationPaneSearchEntries } from '~renderer/settings/orchestration/search'
import { getShortcutsPaneSearchEntries } from '~renderer/settings/shortcuts-search'
import { YiruLogoSettingsIcon } from '~renderer/settings/yiru-logo-settings-icon'

import { getAppearancePaneSearchEntries } from './appearance/search'

type NavigationCoreSectionsParams = {
  isWindowsTerminalHost: boolean
}

export function buildNavigationCoreSections({
  isWindowsTerminalHost
}: NavigationCoreSectionsParams): SettingsNavSection[] {
  return [
    {
      id: 'appearance',
      title: translate('auto.hooks.useSettingsNavigationMetadata.93d88d20bf', 'Appearance'),
      description: translate(
        'auto.hooks.useSettingsNavigationMetadata.b11a5a48a2',
        'Theme, zoom, app and terminal appearance, sidebars, and status bar.'
      ),
      icon: Palette,
      searchEntries: getAppearancePaneSearchEntries(),
      group: 'interface'
    },
    {
      id: 'notifications',
      title: translate('auto.hooks.useSettingsNavigationMetadata.2eece16ad1', 'Notifications'),
      description: translate(
        'auto.hooks.useSettingsNavigationMetadata.7682607591',
        'System notifications for agent and terminal events.'
      ),
      icon: Bell,
      searchEntries: getNotificationsPaneSearchEntries(),
      group: 'interface'
    },
    {
      id: 'shortcuts',
      title: translate('auto.hooks.useSettingsNavigationMetadata.94295ebfb3', 'Shortcuts'),
      description: translate(
        'auto.hooks.useSettingsNavigationMetadata.dcd0d9b74f',
        'Keyboard shortcuts for common actions.'
      ),
      icon: Keyboard,
      searchEntries: getShortcutsPaneSearchEntries(),
      group: 'interface'
    },
    {
      id: 'agents',
      title: translate('auto.hooks.useSettingsNavigationMetadata.b49abbd2f7', 'Agents'),
      description: translate(
        'auto.hooks.useSettingsNavigationMetadata.4121f7a0a2',
        'Manage AI agents, set a default, and customize commands.'
      ),
      icon: Bot,
      searchEntries: getAgentsPaneSearchEntries({ includeAgentRuntime: isWindowsTerminalHost }),
      group: 'capabilities'
    },
    {
      id: 'accounts',
      title: translate(
        'auto.hooks.useSettingsNavigationMetadata.f70ac54d38',
        'AI Provider Accounts'
      ),
      description: translate(
        'auto.hooks.useSettingsNavigationMetadata.b1c2f8b0ac',
        'Optional account switching and usage setup for Claude, Codex, Gemini, OpenCode Go, MiniMax, and Grok.'
      ),
      icon: UserCog,
      searchEntries: getAccountsPaneSearchEntries(),
      group: 'capabilities',
      badge: translate('auto.hooks.useSettingsNavigationMetadata.7c79d3b7bf', 'Optional')
    },
    {
      id: 'orchestration',
      title: translate('auto.hooks.useSettingsNavigationMetadata.58a868e8e4', 'Orchestration'),
      description: translate(
        'auto.hooks.useSettingsNavigationMetadata.cd50cec5d7',
        'Coordinate multiple coding agents through Yiru.'
      ),
      icon: Network,
      searchEntries: getOrchestrationPaneSearchEntries(),
      group: 'capabilities'
    },
    {
      id: 'computer-use',
      title: translate('auto.hooks.useSettingsNavigationMetadata.b35e92364b', 'Computer Use'),
      description: translate(
        'auto.hooks.useSettingsNavigationMetadata.0059bd17f3',
        'Enable agents to control any app on your computer.'
      ),
      icon: MousePointerClick,
      searchEntries: getComputerUsePaneSearchEntries(),
      group: 'capabilities'
    },
    {
      id: 'setup-guide',
      title: translate(
        'auto.hooks.useSettingsNavigationMetadata.ded9e9032f',
        'Onboarding checklist'
      ),
      description: translate(
        'auto.hooks.useSettingsNavigationMetadata.5f32ac08f3',
        'Finish the onboarding checklist for core Yiru workflows.'
      ),
      icon: YiruLogoSettingsIcon,
      searchEntries: [
        {
          title: translate(
            'auto.hooks.useSettingsNavigationMetadata.ded9e9032f',
            'Onboarding checklist'
          ),
          description: translate(
            'auto.hooks.useSettingsNavigationMetadata.17005c73d4',
            'Open the onboarding checklist for setup and milestone steps.'
          ),
          keywords: [
            translate('auto.hooks.useSettingsNavigationMetadata.ea0b1bc7b8', 'setup guide'),
            translate(
              'auto.hooks.useSettingsNavigationMetadata.0505d0df29',
              'get started with Yiru'
            ),
            translate('auto.hooks.useSettingsNavigationMetadata.724c440e72', 'getting started')
          ]
        }
      ],
      group: 'setup'
    },
    {
      id: 'general',
      title: translate('auto.hooks.useSettingsNavigationMetadata.13241992bd', 'General'),
      description: translate(
        'auto.hooks.useSettingsNavigationMetadata.2cd4ea75da',
        'Workspace defaults, app setup, and maintenance.'
      ),
      icon: SlidersHorizontal,
      searchEntries: getGeneralPaneSearchEntries({ includeProjectRuntime: isWindowsTerminalHost }),
      group: 'setup'
    },
    {
      id: 'integrations',
      title: translate('auto.hooks.useSettingsNavigationMetadata.2b043783ef', 'Integrations'),
      description: translate(
        'auto.hooks.useSettingsNavigationMetadata.33a5e1d597',
        'Connect GitHub for pull requests, checks, and review status.'
      ),
      icon: Blocks,
      searchEntries: getIntegrationsPaneSearchEntries(),
      group: 'setup'
    },
    {
      id: 'mobile',
      title: translate('auto.hooks.useSettingsNavigationMetadata.1cd25673df', 'Mobile'),
      description: translate(
        'auto.hooks.useSettingsNavigationMetadata.95a1886d94',
        'Control terminals and agents from your phone.'
      ),
      icon: Smartphone,
      searchEntries: getMobileSettingsPaneSearchEntries(),
      group: 'setup'
    }
  ]
}

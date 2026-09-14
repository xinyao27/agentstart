import type { GlobalSettings } from '@agentstart/protocol/settings/global/model'
import { AgentIcon } from '~renderer/agent/catalog'
import { translate } from '~renderer/i18n/i18n'
import { HardDrive } from '~renderer/icons/hugeicons'
import {
  ClaudeIcon,
  GeminiIcon,
  MiniMaxIcon,
  OpenAIIcon,
  OpenCodeGoIcon
} from '~renderer/status-bar/icons'
import { useAppStore } from '~renderer/store/state'

import { AccountLocation } from './account-location'
import {
  getAccountRuntimeSentenceLabel,
  getHostRuntimeLabel,
  getSelectedAccountRuntime
} from './account-runtime'
import {
  getAccountsClaudeSearchEntries,
  getAccountsCodexSearchEntries,
  getAccountsGeminiSearchEntries,
  getAccountsGrokSearchEntries,
  getAccountsLocationSearchEntries,
  getAccountsMiniMaxSearchEntries,
  getAccountsOpencodeSearchEntries
} from './accounts-search'
import { ClaudeAccountsSection } from './claude-accounts-section'
import { CodexAccountsSection } from './codex-accounts-section'
import { GeminiAccountsSection, OpenCodeAccountsSection } from './external-provider-sections'
import { GrokAccountsSection } from './grok-accounts-section'
import { SettingsGroupCards, type SettingsGroup } from './group-card'
import { MiniMaxAccountsSection } from './minimax-accounts-section'
import { useProviderAccounts } from './use-provider-accounts'

const EMPTY_WSL_DISTROS: string[] = []

type AccountsPaneProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
  wslSupportedPlatform?: boolean
  wslAvailable?: boolean
  wslDistros?: string[]
  wslCapabilitiesLoading?: boolean
  accountOwnerPlatform?: NodeJS.Platform | null
}

export function AccountsPane({
  settings,
  updateSettings,
  wslSupportedPlatform = false,
  wslAvailable = false,
  wslDistros = EMPTY_WSL_DISTROS,
  wslCapabilitiesLoading = false,
  accountOwnerPlatform = null
}: AccountsPaneProps): React.JSX.Element {
  const recordFeatureInteraction = useAppStore((state) => state.recordFeatureInteraction)
  const localRuntime = getSelectedAccountRuntime(
    settings,
    wslSupportedPlatform,
    wslAvailable,
    wslDistros,
    wslCapabilitiesLoading
  )
  const localRuntimeSentenceLabel = getAccountRuntimeSentenceLabel(localRuntime)
  const accounts = useProviderAccounts({
    accountOwnerPlatform,
    localRuntime,
    settings,
    wslAvailable,
    wslCapabilitiesLoading
  })

  const groups: SettingsGroup[] = []

  if (wslSupportedPlatform && !accounts.isRemoteScope) {
    groups.push({
      id: 'accounts-runtime',
      icon: <HardDrive aria-hidden="true" />,
      title: translate('auto.components.settings.AccountsPane.f54b4fbd71', 'Account Location'),
      summary: translate(
        'auto.components.settings.AccountsPane.2cd197025c',
        'Choose whether provider accounts are inspected and added in {{value0}} or WSL.',
        { value0: getHostRuntimeLabel() }
      ),
      searchEntries: getAccountsLocationSearchEntries(),
      content: (
        <AccountLocation
          accountRuntime={accounts.runtime}
          updateSettings={updateSettings}
          wslAvailable={wslAvailable}
          wslCapabilitiesLoading={wslCapabilitiesLoading}
          wslDistros={wslDistros}
        />
      )
    })
  }

  groups.push(
    {
      id: 'accounts-claude',
      icon: <ClaudeIcon />,
      title: translate('auto.components.settings.AccountsPane.26ef4b55be', 'Claude'),
      summary: translate(
        'auto.components.settings.AccountsPane.72b36ea174',
        'Optional. AgentStart can use your normal Claude login; add accounts only if you want quick switching without moving chat sessions.'
      ),
      searchEntries: getAccountsClaudeSearchEntries(),
      content: (
        <ClaudeAccountsSection
          accountRuntime={accounts.runtime}
          accountRuntimeSentenceLabel={accounts.runtimeSentenceLabel}
          accountRuntimeUnavailable={accounts.runtimeUnavailable}
          accountVisibilityOptions={accounts.visibilityOptions}
          claudeAccounts={accounts.claudeAccounts}
          claudeAction={accounts.claudeAction}
          isRemoteAccountScope={accounts.isRemoteScope}
          runClaudeAccountAction={accounts.runClaudeAction}
          settings={settings}
          systemClaudeActive={accounts.systemClaudeActive}
          visibleClaudeAccounts={accounts.visibleClaudeAccounts}
          wslCapabilitiesLoading={wslCapabilitiesLoading}
        />
      )
    },
    {
      id: 'accounts-codex',
      icon: <OpenAIIcon />,
      title: translate('auto.components.settings.AccountsPane.ef91cfa06b', 'Codex'),
      summary: translate(
        'auto.components.settings.AccountsPane.cedfab35ab',
        'Optional. AgentStart can use your normal Codex login; add accounts only if you want quick switching in AgentStart.'
      ),
      searchEntries: getAccountsCodexSearchEntries(),
      content: (
        <CodexAccountsSection
          accountRuntime={accounts.runtime}
          accountRuntimeSentenceLabel={accounts.runtimeSentenceLabel}
          accountRuntimeUnavailable={accounts.runtimeUnavailable}
          accountVisibilityOptions={accounts.visibilityOptions}
          activeCodexAccountId={accounts.activeCodexAccountId}
          codexAccounts={accounts.codexAccounts}
          codexAction={accounts.codexAction}
          hasActiveCodexAuthWarning={Boolean(accounts.activeCodexAuthWarning)}
          isRemoteAccountScope={accounts.isRemoteScope}
          runCodexAccountAction={accounts.runCodexAction}
          settings={settings}
          systemCodexActive={accounts.systemCodexActive}
          systemCodexIdentity={accounts.systemCodexIdentity}
          systemCodexNeedsReauthentication={accounts.systemCodexNeedsReauthentication}
          visibleCodexAccounts={accounts.visibleCodexAccounts}
          wslCapabilitiesLoading={wslCapabilitiesLoading}
        />
      )
    },
    {
      id: 'accounts-gemini',
      icon: <GeminiIcon />,
      title: translate('auto.components.settings.AccountsPane.0c64dc2a64', 'Gemini'),
      summary: translate(
        'auto.components.settings.AccountsPane.973741a871',
        'Configure Gemini provider settings.'
      ),
      searchEntries: getAccountsGeminiSearchEntries(),
      content: (
        <GeminiAccountsSection
          localRuntimeSentenceLabel={localRuntimeSentenceLabel}
          recordFeatureInteraction={recordFeatureInteraction}
          settings={settings}
          updateSettings={updateSettings}
        />
      )
    },
    {
      id: 'accounts-opencode',
      icon: <OpenCodeGoIcon />,
      title: translate('auto.components.settings.AccountsPane.4ac10b4d08', 'OpenCode Go'),
      summary: translate(
        'auto.components.settings.AccountsPane.ea631977b5',
        'Configure OpenCode Go provider settings.'
      ),
      searchEntries: getAccountsOpencodeSearchEntries(),
      content: (
        <OpenCodeAccountsSection
          recordFeatureInteraction={recordFeatureInteraction}
          settings={settings}
          updateSettings={updateSettings}
        />
      )
    },
    {
      id: 'accounts-minimax',
      icon: <MiniMaxIcon />,
      title: translate('auto.components.settings.AccountsPane.5d63bbfbec', 'MiniMax'),
      summary: translate(
        'auto.components.settings.AccountsPane.15e831350e',
        'Configure MiniMax usage tracking from platform.minimax.io.'
      ),
      searchEntries: getAccountsMiniMaxSearchEntries(),
      content: <MiniMaxAccountsSection settings={settings} updateSettings={updateSettings} />
    },
    {
      id: 'accounts-grok',
      icon: <AgentIcon agent="grok" />,
      title: translate('auto.components.settings.GrokAccountsSection.a1b2c3d4e5', 'Grok (xAI)'),
      summary: translate(
        'auto.components.settings.GrokAccountsSection.f6e5d4c3b2',
        'Shows weekly credit usage from your Grok CLI sign-in (session file ~/.grok/auth.json).'
      ),
      searchEntries: getAccountsGrokSearchEntries(),
      content: <GrokAccountsSection />
    }
  )

  return <SettingsGroupCards groups={groups} defaultOpenId={null} />
}

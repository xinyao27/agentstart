import type { GlobalSettings } from '@yiru/protocol/settings/global/model'
import { useAppStore } from '~renderer/store/state'
import { Separator } from '~renderer/ui/separator'

import { AccountLocation } from './account-location'
import { getAccountRuntimeSentenceLabel, getSelectedAccountRuntime } from './account-runtime'
import {
  getAccountsClaudeSearchEntries,
  getAccountsCodexSearchEntries,
  getAccountsGeminiSearchEntries,
  getAccountsGrokSearchEntries,
  getAccountsLocationSearchEntries,
  getAccountsMiniMaxSearchEntries,
  getAccountsOpencodeSearchEntries,
  getAccountsPaneSearchEntries
} from './accounts-search'
import { ClaudeAccountsSection } from './claude-accounts-section'
import { CodexAccountsSection } from './codex-accounts-section'
import { GeminiAccountsSection, OpenCodeAccountsSection } from './external-provider-sections'
import { GrokAccountsSection } from './grok-accounts-section'
import { MiniMaxAccountsSection } from './minimax-accounts-section'
import { matchesSettingsSearch } from './search'
import { useProviderAccounts } from './use-provider-accounts'

export { getAccountsPaneSearchEntries }

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
  const searchQuery = useAppStore((state) => state.settingsSearchQuery)
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
  const sections = [
    {
      id: 'account-runtime',
      isVisible:
        wslSupportedPlatform &&
        !accounts.isRemoteScope &&
        matchesSettingsSearch(searchQuery, getAccountsLocationSearchEntries()),
      content: (
        <AccountLocation
          accountRuntime={accounts.runtime}
          updateSettings={updateSettings}
          wslAvailable={wslAvailable}
          wslCapabilitiesLoading={wslCapabilitiesLoading}
          wslDistros={wslDistros}
        />
      )
    },
    {
      id: 'claude',
      isVisible: matchesSettingsSearch(searchQuery, getAccountsClaudeSearchEntries()),
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
      id: 'codex',
      isVisible: matchesSettingsSearch(searchQuery, getAccountsCodexSearchEntries()),
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
      id: 'gemini',
      isVisible: matchesSettingsSearch(searchQuery, getAccountsGeminiSearchEntries()),
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
      id: 'opencode',
      isVisible: matchesSettingsSearch(searchQuery, getAccountsOpencodeSearchEntries()),
      content: (
        <OpenCodeAccountsSection
          recordFeatureInteraction={recordFeatureInteraction}
          settings={settings}
          updateSettings={updateSettings}
        />
      )
    },
    {
      id: 'minimax',
      isVisible: matchesSettingsSearch(searchQuery, getAccountsMiniMaxSearchEntries()),
      content: <MiniMaxAccountsSection settings={settings} updateSettings={updateSettings} />
    },
    {
      id: 'grok',
      isVisible: matchesSettingsSearch(searchQuery, getAccountsGrokSearchEntries()),
      content: <GrokAccountsSection />
    }
  ].filter((section) => section.isVisible)

  return (
    <div className="space-y-8">
      {sections.map((section, index) => (
        <div key={section.id} className="space-y-8">
          {index > 0 ? <Separator /> : null}
          {section.content}
        </div>
      ))}
    </div>
  )
}

import type { GlobalSettings } from '@agentstart/protocol/settings/global/model'
import type {
  ClaudeRateLimitAccountsState,
  CodexRateLimitAccountsState
} from '@agentstart/protocol/settings/managed-accounts'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { markLiveCodexSessionsForRestart } from '~renderer/agent-session/codex-restart'
import { translate } from '~renderer/i18n/i18n'
import { useProjectCatalog } from '~renderer/project-catalog/provider'
import {
  emptyClaudeAccountsState,
  emptyCodexAccountsState,
  hasRemoteProviderAccountOwner,
  watchProviderAccounts
} from '~renderer/runtime/provider-accounts-client'
import { useAppStore } from '~renderer/store/state'

import {
  type AccountRuntime,
  getAccountRuntimeSentenceLabel,
  getClaudeAccountErrorDescription,
  getClaudeAccountLabel,
  getCodexAccountErrorDescription,
  getCodexAccountLabel,
  isClaudeAccountCancellation
} from './account-runtime'
import { getCodexAccountAuthWarning } from './codex-account-auth-warning'
import {
  getProviderAccountActiveIdForView,
  providerAccountIsActiveInView,
  providerAccountMatchesView,
  type ProviderAccountRuntimeView
} from './provider-account-visibility'

export type ProviderAccountAction =
  | 'idle'
  | 'adding'
  | `reauth:${string}`
  | `remove:${string}`
  | `select:${string | 'system'}`

type UseProviderAccountsOptions = {
  accountOwnerPlatform: NodeJS.Platform | null
  localRuntime: AccountRuntime
  settings: GlobalSettings
  wslAvailable: boolean
  wslCapabilitiesLoading: boolean
}

export function useProviderAccounts({
  accountOwnerPlatform,
  localRuntime,
  settings,
  wslAvailable,
  wslCapabilitiesLoading
}: UseProviderAccountsOptions) {
  const codexRateLimits = useAppStore((state) => state.rateLimits.codex)
  const codexRateLimitTarget = useAppStore((state) => state.rateLimits.codexTarget)
  const recordFeatureInteraction = useAppStore((state) => state.recordFeatureInteraction)
  const fetchSettings = useAppStore((state) => state.fetchSettings)
  const { runtimeEnvironments } = useProjectCatalog()
  const [codexAccounts, setCodexAccounts] =
    useState<CodexRateLimitAccountsState>(emptyCodexAccountsState)
  const [codexAccountsLoaded, setCodexAccountsLoaded] = useState(false)
  const [codexAction, setCodexAction] = useState<ProviderAccountAction>('idle')
  const [claudeAccounts, setClaudeAccounts] =
    useState<ClaudeRateLimitAccountsState>(emptyClaudeAccountsState)
  const [claudeAction, setClaudeAction] = useState<ProviderAccountAction>('idle')
  const isRemoteScope = hasRemoteProviderAccountOwner(settings)
  const activeRuntimeEnvironmentId = settings.activeRuntimeEnvironmentId?.trim() || null
  const remoteServerLabel = isRemoteScope
    ? (runtimeEnvironments.find((environment) => environment.id === activeRuntimeEnvironmentId)
        ?.name ??
      translate('auto.components.settings.AccountsPane.remoteServerFallback', 'the remote daemon'))
    : null
  const runtime: AccountRuntime = isRemoteScope
    ? { runtime: 'host', label: remoteServerLabel ?? '' }
    : localRuntime
  const runtimeSentenceLabel = getAccountRuntimeSentenceLabel(runtime)
  const visibilityOptions = {
    remoteOwner: isRemoteScope,
    ownerPlatform: accountOwnerPlatform
  }
  const visibleClaudeAccounts = claudeAccounts.accounts.filter((account) =>
    providerAccountMatchesView(account, runtime, visibilityOptions)
  )
  const visibleCodexAccounts = codexAccounts.accounts.filter((account) =>
    providerAccountMatchesView(account, runtime, visibilityOptions)
  )
  const activeCodexAccountId = getProviderAccountActiveIdForView(codexAccounts, runtime)
  const ownerPlatformUnknown = isRemoteScope && accountOwnerPlatform === null
  const systemCodexActive = !(
    ownerPlatformUnknown ? codexAccounts.accounts : visibleCodexAccounts
  ).some((account) =>
    providerAccountIsActiveInView(account, codexAccounts, runtime, visibilityOptions)
  )
  const systemClaudeActive = !(
    ownerPlatformUnknown ? claudeAccounts.accounts : visibleClaudeAccounts
  ).some((account) =>
    providerAccountIsActiveInView(account, claudeAccounts, runtime, visibilityOptions)
  )
  const systemCodexIdentity = runtime.runtime === 'host' ? codexAccounts.systemDefault : undefined
  const activeCodexAuthWarning =
    codexAccountsLoaded && !isRemoteScope
      ? getCodexAccountAuthWarning({
          limits: codexRateLimits,
          target: codexRateLimitTarget,
          runtime,
          activeAccountId: activeCodexAccountId,
          accountId: activeCodexAccountId,
          authKind: activeCodexAccountId === null ? systemCodexIdentity?.authKind : undefined
        })
      : null
  const systemCodexNeedsReauthentication =
    activeCodexAccountId === null && Boolean(activeCodexAuthWarning)
  const runtimeUnavailable = runtime.runtime === 'wsl' && !wslAvailable && !wslCapabilitiesLoading

  useEffect(() => {
    const watcher = watchProviderAccounts(
      { activeRuntimeEnvironmentId },
      {
        onSnapshot: (snapshot) => {
          if (!snapshot.failedProviders?.includes('codex')) {
            setCodexAccounts(snapshot.codex)
            setCodexAccountsLoaded(true)
          }
          if (!snapshot.failedProviders?.includes('claude')) {
            setClaudeAccounts(snapshot.claude)
          }
        },
        onError: (error) => {
          toast.error(
            translate(
              'auto.components.settings.AccountsPane.loadAccountsFailed',
              'Could not load provider accounts.'
            ),
            { description: String((error as Error)?.message ?? error) }
          )
        }
      }
    )
    return () => watcher.close()
  }, [activeRuntimeEnvironmentId])

  const syncCodexAccounts = async (next: CodexRateLimitAccountsState): Promise<void> => {
    setCodexAccounts(next)
    setCodexAccountsLoaded(true)
    if (!isRemoteScope) {
      await fetchSettings()
    }
  }

  const syncClaudeAccounts = async (next: ClaudeRateLimitAccountsState): Promise<void> => {
    setClaudeAccounts(next)
    if (!isRemoteScope) {
      await fetchSettings()
    }
  }

  const runCodexAction = async (
    action: ProviderAccountAction,
    operation: () => Promise<CodexRateLimitAccountsState>,
    actionRuntime: ProviderAccountRuntimeView = runtime
  ): Promise<void> => {
    const previousId = getProviderAccountActiveIdForView(codexAccounts, actionRuntime)
    setCodexAction(action)
    try {
      const next = await operation()
      await syncCodexAccounts(next)
      recordFeatureInteraction('codex-account-switching')
      const nextId = getProviderAccountActiveIdForView(next, actionRuntime)
      const shouldPromptRestart =
        action === 'adding' ||
        (action.startsWith('select:') && previousId !== nextId) ||
        (action.startsWith('reauth:') && nextId !== null && action === `reauth:${nextId}`) ||
        (action.startsWith('remove:') && previousId !== nextId)
      if (shouldPromptRestart) {
        void markLiveCodexSessionsForRestart({
          previousAccountLabel: getCodexAccountLabel(codexAccounts, previousId),
          nextAccountLabel: getCodexAccountLabel(next, nextId)
        })
      }
    } catch (error) {
      toast.error(
        translate(
          'auto.components.settings.AccountsPane.5bf8764953',
          'Codex account update failed.'
        ),
        { description: getCodexAccountErrorDescription(error) }
      )
    } finally {
      setCodexAction('idle')
    }
  }

  const runClaudeAction = async (
    action: ProviderAccountAction,
    operation: () => Promise<ClaudeRateLimitAccountsState>,
    actionRuntime: ProviderAccountRuntimeView = runtime
  ): Promise<void> => {
    const previousId = getProviderAccountActiveIdForView(claudeAccounts, actionRuntime)
    setClaudeAction(action)
    try {
      const next = await operation()
      await syncClaudeAccounts(next)
      recordFeatureInteraction('claude-account-switching')
      const nextId = getProviderAccountActiveIdForView(next, actionRuntime)
      if (
        action === 'adding' ||
        previousId !== nextId ||
        (action.startsWith('reauth:') && nextId !== null && action === `reauth:${nextId}`)
      ) {
        toast.info(
          translate('auto.components.settings.AccountsPane.f921d32606', 'Claude account updated.'),
          {
            description: translate(
              'auto.components.settings.AccountsPane.b15ce90870',
              '{{value0}} -> {{value1}}. Restart live Claude terminals before continuing old sessions.',
              {
                value0: getClaudeAccountLabel(claudeAccounts, previousId),
                value1: getClaudeAccountLabel(next, nextId)
              }
            )
          }
        )
      }
    } catch (error) {
      if (!isClaudeAccountCancellation(error)) {
        toast.error(
          translate(
            'auto.components.settings.AccountsPane.2743cdc0af',
            'Claude account update failed.'
          ),
          { description: getClaudeAccountErrorDescription(error) }
        )
      }
    } finally {
      setClaudeAction('idle')
    }
  }

  return {
    activeCodexAccountId,
    activeCodexAuthWarning,
    claudeAccounts,
    claudeAction,
    codexAccounts,
    codexAction,
    isRemoteScope,
    runClaudeAction,
    runCodexAction,
    runtime,
    runtimeSentenceLabel,
    runtimeUnavailable,
    systemClaudeActive,
    systemCodexActive,
    systemCodexIdentity,
    systemCodexNeedsReauthentication,
    visibilityOptions,
    visibleClaudeAccounts,
    visibleCodexAccounts
  }
}

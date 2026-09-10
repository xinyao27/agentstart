import {
  AccountsClient,
  type ClaudeRateLimitAccountsState,
  type CodexRateLimitAccountsState,
  type GrokAccountStatus,
  type RateLimitState
} from '@agentstart/protocol'
import type { GlobalSettings } from '@agentstart/protocol/settings/global/model'

import { openRuntimeProtocolTarget } from './protocol-target'
import { getActiveRuntimeTarget, type RuntimeClientTarget } from './rpc-client'

export type ProviderAccountsSnapshot = {
  claude: ClaudeRateLimitAccountsState
  codex: CodexRateLimitAccountsState
  rateLimits: RateLimitState | null
  failedProviders?: ('claude' | 'codex')[]
}

type ProviderAccountSelection = {
  accountId: string | null
  runtime: 'host' | 'wsl'
  wslDistro?: string | null
}

const REMOTE_ACCOUNTS_FIRST_SNAPSHOT_TIMEOUT_MS = 15_000
const REMOTE_ACCOUNT_MUTATION_TIMEOUT_MS = 30_000

export function hasRemoteProviderAccountOwner(
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined
): boolean {
  return getActiveRuntimeTarget(settings).kind === 'environment'
}

export type ProviderAccountsWatcher = { close: () => void }

export function emptyClaudeAccountsState(): ClaudeRateLimitAccountsState {
  return { accounts: [], activeAccountId: null, activeAccountIdsByRuntime: { host: null, wsl: {} } }
}

export function emptyCodexAccountsState(): CodexRateLimitAccountsState {
  return { accounts: [], activeAccountId: null, activeAccountIdsByRuntime: { host: null, wsl: {} } }
}

function providerAccountsLoadError(provider: 'Claude' | 'Codex', cause: unknown): Error {
  const message = cause instanceof Error ? cause.message : String(cause)
  return new Error(`Could not load ${provider} accounts: ${message}`)
}

async function accountsClient(target: RuntimeClientTarget): Promise<AccountsClient> {
  return new AccountsClient(await openRuntimeProtocolTarget(target))
}

export function watchProviderAccounts(
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined,
  handlers: {
    onSnapshot: (snapshot: ProviderAccountsSnapshot) => void
    onError: (error: unknown) => void
  }
): ProviderAccountsWatcher {
  const target = getActiveRuntimeTarget(settings)
  if (target.kind === 'local') {
    return watchLocalAccounts(target, handlers)
  }
  return watchRemoteAccounts(target, handlers)
}

function watchLocalAccounts(
  target: RuntimeClientTarget,
  handlers: {
    onSnapshot: (snapshot: ProviderAccountsSnapshot) => void
    onError: (error: unknown) => void
  }
): ProviderAccountsWatcher {
  let closed = false
  void Promise.allSettled([
    accountsClient(target).then((client) => client.listCachedClaude()),
    accountsClient(target).then((client) => client.listCachedCodex())
  ])
    .then(([claudeResult, codexResult]) => {
      if (closed) {
        return
      }
      const claudeError =
        claudeResult.status === 'rejected'
          ? providerAccountsLoadError('Claude', claudeResult.reason)
          : null
      const codexError =
        codexResult.status === 'rejected'
          ? providerAccountsLoadError('Codex', codexResult.reason)
          : null
      if (claudeError && codexError) {
        handlers.onError(
          new AggregateError(
            [claudeError, codexError],
            `${claudeError.message} ${codexError.message}`
          )
        )
        return
      }
      const failedProviders: ('claude' | 'codex')[] = []
      if (claudeError) {
        failedProviders.push('claude')
      }
      if (codexError) {
        failedProviders.push('codex')
      }
      handlers.onSnapshot({
        claude:
          claudeResult.status === 'fulfilled' ? claudeResult.value : emptyClaudeAccountsState(),
        codex: codexResult.status === 'fulfilled' ? codexResult.value : emptyCodexAccountsState(),
        rateLimits: null,
        ...(failedProviders.length > 0 ? { failedProviders } : {})
      })
      for (const error of [claudeError, codexError]) {
        if (error && !closed) {
          handlers.onError(error)
        }
      }
    })
    .catch((error: unknown) => {
      if (!closed) {
        handlers.onError(error)
      }
    })
  return {
    close: () => {
      closed = true
    }
  }
}

function watchRemoteAccounts(
  target: RuntimeClientTarget,
  handlers: {
    onSnapshot: (snapshot: ProviderAccountsSnapshot) => void
    onError: (error: unknown) => void
  }
): ProviderAccountsWatcher {
  let closed = false
  let receivedSnapshot = false
  let cancel: ((reason?: string) => Promise<void>) | undefined
  const abort = new AbortController()
  const timer = window.setTimeout(() => {
    if (!closed && !receivedSnapshot) {
      handlers.onError(new Error('Timed out waiting for remote provider accounts.'))
    }
  }, REMOTE_ACCOUNTS_FIRST_SNAPSHOT_TIMEOUT_MS)
  void accountsClient(target)
    .then((client) => client.subscribe({ signal: abort.signal }))
    .then(async (subscription) => {
      cancel = subscription.cancel
      for await (const event of subscription.events) {
        if (closed) {
          return
        }
        if (event.type === 'ready' || event.type === 'snapshot') {
          receivedSnapshot = true
          handlers.onSnapshot(event.snapshot)
        } else {
          if (!receivedSnapshot) {
            handlers.onError(new Error('Remote provider account subscription closed.'))
          }
          return
        }
      }
    })
    .catch((error: unknown) => {
      if (!closed) {
        handlers.onError(error)
      }
    })
  return {
    close: () => {
      closed = true
      window.clearTimeout(timer)
      abort.abort()
      void cancel?.('Provider accounts watcher closed')
    }
  }
}

export async function selectClaudeProviderAccount(
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined,
  selection: ProviderAccountSelection
): Promise<ClaudeRateLimitAccountsState> {
  return (await accountsClient(getActiveRuntimeTarget(settings))).selectClaude(selection, {
    timeoutMs: REMOTE_ACCOUNT_MUTATION_TIMEOUT_MS
  })
}

export async function selectCodexProviderAccount(
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined,
  selection: ProviderAccountSelection
): Promise<CodexRateLimitAccountsState> {
  return (await accountsClient(getActiveRuntimeTarget(settings))).selectCodex(selection, {
    timeoutMs: REMOTE_ACCOUNT_MUTATION_TIMEOUT_MS
  })
}

export async function removeClaudeProviderAccount(
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined,
  accountId: string
): Promise<ClaudeRateLimitAccountsState> {
  return (await accountsClient(getActiveRuntimeTarget(settings))).removeClaude(accountId, {
    timeoutMs: REMOTE_ACCOUNT_MUTATION_TIMEOUT_MS
  })
}

export async function removeCodexProviderAccount(
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined,
  accountId: string
): Promise<CodexRateLimitAccountsState> {
  return (await accountsClient(getActiveRuntimeTarget(settings))).removeCodex(accountId, {
    timeoutMs: REMOTE_ACCOUNT_MUTATION_TIMEOUT_MS
  })
}

export async function fetchGrokAccountStatus(
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined
): Promise<GrokAccountStatus> {
  return (await accountsClient(getActiveRuntimeTarget(settings))).getGrokStatus()
}

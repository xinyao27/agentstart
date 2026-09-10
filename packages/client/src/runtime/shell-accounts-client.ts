import {
  AccountsClient,
  type ClaudeRateLimitAccountsState,
  type CodexRateLimitAccountsState
} from '@agentstart/protocol'

import { openConfiguredBrowserHostProtocol } from './browser-host-runtime'

type AccountAddTarget = {
  runtime?: 'host' | 'wsl'
  wslDistro?: string | null
}

export type ShellAccountsApi = {
  claude: {
    list: () => Promise<ClaudeRateLimitAccountsState>
    add: (target?: AccountAddTarget) => Promise<ClaudeRateLimitAccountsState>
    cancelPendingLogin: () => Promise<boolean>
    reauthenticate: (args: { accountId: string }) => Promise<ClaudeRateLimitAccountsState>
  }
  codex: {
    list: () => Promise<CodexRateLimitAccountsState>
    add: (target?: AccountAddTarget) => Promise<CodexRateLimitAccountsState>
    reauthenticate: (args: { accountId: string }) => Promise<CodexRateLimitAccountsState>
  }
}

async function client(): Promise<AccountsClient> {
  return new AccountsClient(await openConfiguredBrowserHostProtocol())
}

export const shellAccountsApi: ShellAccountsApi = {
  claude: {
    list: async () => (await client()).listCachedClaude(),
    add: async (input) => (await client()).addClaude(input, { timeoutMs: 190_000 }),
    cancelPendingLogin: async () => (await client()).cancelPendingLogin({ timeoutMs: 5_000 }),
    reauthenticate: async (input) =>
      (await client()).reauthenticateClaude(input.accountId, { timeoutMs: 190_000 })
  },
  codex: {
    list: async () => (await client()).listCachedCodex(),
    add: async (input) => (await client()).addCodex(input, { timeoutMs: 130_000 }),
    reauthenticate: async (input) =>
      (await client()).reauthenticateCodex(input.accountId, { timeoutMs: 130_000 })
  }
}

import type {
  CursorRateLimitRefreshContext,
  RateLimitRuntimeTarget,
  RateLimitState
} from '@agentstart/protocol/account-rate-types'
import type { StateCreator } from 'zustand'
import { translate } from '~renderer/i18n/i18n'
import {
  consumeCodexRateLimitResetCredit,
  fetchInactiveClaudeRateLimitAccounts,
  fetchInactiveCodexRateLimitAccounts,
  refreshClaudeRateLimitTarget,
  refreshCodexRateLimitTarget,
  refreshGrokRateLimitSnapshot,
  refreshRateLimitSnapshot
} from '~renderer/runtime/rate-limits-client'

import type { AppState } from '../store/types'

export type RateLimitSlice = {
  rateLimits: RateLimitState
  fetchRateLimits: () => Promise<void>
  refreshRateLimits: (cursorContext?: CursorRateLimitRefreshContext) => Promise<void>
  refreshGrokRateLimits: () => Promise<void>
  refreshClaudeRateLimitsForTarget: (target: RateLimitRuntimeTarget) => Promise<void>
  refreshCodexRateLimitsForTarget: (target: RateLimitRuntimeTarget) => Promise<void>
  consumeCodexRateLimitResetCredit: () => Promise<void>
  fetchInactiveClaudeAccountUsage: () => Promise<void>
  fetchInactiveCodexAccountUsage: () => Promise<void>
  setRateLimitsFromPush: (state: RateLimitState) => void
}

export const createRateLimitSlice: StateCreator<AppState, [], [], RateLimitSlice> = (set, get) => ({
  rateLimits: {
    claude: null,
    codex: null,
    cursor: null,
    gemini: null,
    opencodeGo: null,
    kimi: null,
    antigravity: null,
    minimax: null,
    grok: null,
    minimaxCookieConfigured: false,
    grokAuthConfigured: false,
    claudeTarget: { runtime: 'host', wslDistro: null },
    codexTarget: { runtime: 'host', wslDistro: null },
    inactiveClaudeAccounts: [],
    inactiveCodexAccounts: []
  },

  fetchRateLimits: async () => {
    try {
      const state = await refreshRateLimitSnapshot()
      set({ rateLimits: state })
    } catch (error) {
      setRateLimitFailure(set, get, error)
      console.error('Failed to fetch rate limits.')
    }
  },

  refreshRateLimits: async (cursorContext) => {
    try {
      const state = await refreshRateLimitSnapshot(cursorContext)
      set({ rateLimits: state })
    } catch (error) {
      setRateLimitFailure(set, get, error)
      console.error('Failed to refresh rate limits.')
    }
  },

  refreshGrokRateLimits: async () => {
    try {
      const state = await refreshGrokRateLimitSnapshot()
      set({ rateLimits: state })
    } catch (error) {
      console.error('Failed to refresh Grok usage:', error)
    }
  },

  refreshClaudeRateLimitsForTarget: async (target) => {
    const current = get().rateLimits
    const targetChanged =
      current.claudeTarget.runtime !== target.runtime ||
      current.claudeTarget.wslDistro !== target.wslDistro
    set({
      rateLimits: {
        ...current,
        claudeTarget: target,
        claude:
          current.claude && !targetChanged
            ? { ...current.claude, status: 'fetching' }
            : {
                provider: 'claude',
                session: null,
                weekly: null,
                updatedAt: 0,
                error: null,
                status: 'fetching'
              }
      }
    })
    try {
      const state = await refreshClaudeRateLimitTarget(target)
      set({ rateLimits: state })
    } catch (error) {
      setProviderRateLimitFailure(set, get, 'claude', error)
      console.error('Failed to refresh Claude usage for runtime:', error)
    }
  },

  refreshCodexRateLimitsForTarget: async (target) => {
    const current = get().rateLimits
    const targetChanged =
      current.codexTarget.runtime !== target.runtime ||
      current.codexTarget.wslDistro !== target.wslDistro
    set({
      rateLimits: {
        ...current,
        codexTarget: target,
        codex:
          current.codex && !targetChanged
            ? { ...current.codex, status: 'fetching' }
            : {
                provider: 'codex',
                session: null,
                weekly: null,
                updatedAt: 0,
                error: null,
                status: 'fetching'
              }
      }
    })
    try {
      const state = await refreshCodexRateLimitTarget(target)
      set({ rateLimits: state })
    } catch (error) {
      setProviderRateLimitFailure(set, get, 'codex', error)
      console.error('Failed to refresh Codex usage for runtime:', error)
    }
  },

  consumeCodexRateLimitResetCredit: async () => {
    try {
      const result = await consumeCodexRateLimitResetCredit()
      set({ rateLimits: result.state })
    } catch (error) {
      console.error('Failed to consume Codex rate-limit reset:', error)
      throw error
    }
  },

  fetchInactiveClaudeAccountUsage: async () => {
    try {
      await fetchInactiveClaudeRateLimitAccounts()
    } catch (error) {
      console.error('Failed to fetch inactive Claude account usage:', error)
    }
  },

  fetchInactiveCodexAccountUsage: async () => {
    try {
      await fetchInactiveCodexRateLimitAccounts()
    } catch (error) {
      console.error('Failed to fetch inactive Codex account usage:', error)
    }
  },

  setRateLimitsFromPush: (state) => {
    set({ rateLimits: state })
  }
})

function setRateLimitFailure(
  set: Parameters<typeof createRateLimitSlice>[0],
  get: Parameters<typeof createRateLimitSlice>[1],
  error: unknown
): void {
  const current = get().rateLimits
  const message = rateLimitFailureMessage(error)
  const updatedAt = Date.now()
  const failed = (provider: 'claude' | 'codex') => ({
    provider,
    session: null,
    weekly: null,
    updatedAt,
    error: message,
    status: 'error' as const
  })
  set({
    rateLimits: {
      ...current,
      claude:
        current.claude !== null
          ? { ...current.claude, error: message, status: 'error', updatedAt }
          : (get().settings?.claudeManagedAccounts.length ?? 0) > 0
            ? failed('claude')
            : null,
      codex:
        current.codex !== null
          ? { ...current.codex, error: message, status: 'error', updatedAt }
          : (get().settings?.codexManagedAccounts.length ?? 0) > 0
            ? failed('codex')
            : null
    }
  })
}

function setProviderRateLimitFailure(
  set: Parameters<typeof createRateLimitSlice>[0],
  get: Parameters<typeof createRateLimitSlice>[1],
  provider: 'claude' | 'codex',
  error: unknown
): void {
  const current = get().rateLimits
  const message = rateLimitFailureMessage(error)
  const updatedAt = Date.now()
  if (provider === 'claude') {
    set({
      rateLimits: {
        ...current,
        claude: current.claude
          ? { ...current.claude, error: message, status: 'error', updatedAt }
          : null
      }
    })
    return
  }
  set({
    rateLimits: {
      ...current,
      codex: current.codex ? { ...current.codex, error: message, status: 'error', updatedAt } : null
    }
  })
}

function rateLimitFailureMessage(error: unknown): string {
  return error instanceof Error && error.message === 'Rate-limit refresh timed out.'
    ? translate('usage.refreshTimedOut', 'Usage refresh timed out.')
    : translate('usage.refreshFailed', 'Usage refresh failed.')
}

import { StatusCode } from '../generated/agent_start/protocol/v1/errors_pb.js'
import {
  AccountProvider,
  AccountUsageStatus,
  CodexRateLimitResetOutcome as ProtocolResetOutcome,
  ManagedAccountRuntime,
  UsageRateLimitFailureKind as ProtocolFailureKind,
  UsageRateLimitSource as ProtocolSource,
  type AccountRateLimitState,
  type CodexRateLimitResetResult as ProtocolResetResult,
  type ProviderRateLimits as ProtocolProviderRateLimits,
  type RateLimitRuntimeTarget as ProtocolRateLimitRuntimeTarget,
  type RateLimitWindow as ProtocolRateLimitWindow,
  type UsageRateLimitMetadata as ProtocolMetadata
} from '../generated/agent_start/runtime/v1/accounts_pb.js'
import type {
  CodexRateLimitResetOutcome,
  CodexRateLimitResetResult,
  ProviderRateLimits,
  RateLimitRuntimeTarget,
  RateLimitState,
  RateLimitWindow,
  UsageRateLimitFailureKind,
  UsageRateLimitMetadata,
  UsageRateLimitSource
} from './account-rate-types.js'
import { RuntimeProtocolError } from './error.js'

export function rateLimitState(state: AccountRateLimitState | undefined): RateLimitState {
  if (!state?.claudeTarget || !state.codexTarget) {
    throw invalid('Rate-limit targets are missing')
  }
  return {
    claude: optionalProvider(state.claude),
    codex: optionalProvider(state.codex),
    cursor: optionalProvider(state.cursor),
    gemini: optionalProvider(state.gemini),
    opencodeGo: optionalProvider(state.openCodeGo),
    kimi: optionalProvider(state.kimi),
    antigravity: optionalProvider(state.antigravity),
    minimax: optionalProvider(state.minimax),
    grok: optionalProvider(state.grok),
    minimaxCookieConfigured: state.minimaxCookieConfigured,
    grokAuthConfigured: state.grokAuthConfigured,
    claudeTarget: rateLimitTarget(state.claudeTarget),
    codexTarget: rateLimitTarget(state.codexTarget),
    inactiveClaudeAccounts: state.inactiveClaudeAccounts.map(inactiveAccount),
    inactiveCodexAccounts: state.inactiveCodexAccounts.map(inactiveAccount)
  }
}

export function codexRateLimitResetResult(
  result: ProtocolResetResult | undefined
): CodexRateLimitResetResult {
  if (!result) {
    throw invalid('Codex reset result is missing')
  }
  return { outcome: resetOutcome(result.outcome), state: rateLimitState(result.rateLimits) }
}

function optionalProvider(
  value: ProtocolProviderRateLimits | undefined
): ProviderRateLimits | null {
  return value ? providerRateLimits(value) : null
}

function providerRateLimits(value: ProtocolProviderRateLimits): ProviderRateLimits {
  return {
    provider: accountProvider(value.provider),
    session: value.session ? rateLimitWindow(value.session) : null,
    weekly: value.weekly ? rateLimitWindow(value.weekly) : null,
    ...(value.hasFableWeekly
      ? { fableWeekly: value.fableWeekly ? rateLimitWindow(value.fableWeekly) : null }
      : {}),
    ...(value.hasMonthly ? { monthly: value.monthly ? rateLimitWindow(value.monthly) : null } : {}),
    ...(value.hasBuckets
      ? {
          buckets: value.buckets.map((bucket) => {
            if (!bucket.window) {
              throw invalid('Rate-limit bucket window is missing')
            }
            return { name: bucket.name, ...rateLimitWindow(bucket.window) }
          })
        }
      : {}),
    ...(value.hasRateLimitResetCredits
      ? {
          rateLimitResetCredits: value.rateLimitResetCredits
            ? {
                availableCount: safeInteger(value.rateLimitResetCredits.availableCount),
                ...(value.rateLimitResetCredits.totalEarnedCount === undefined
                  ? {}
                  : {
                      totalEarnedCount: safeInteger(value.rateLimitResetCredits.totalEarnedCount)
                    }),
                nextExpiresAt: value.rateLimitResetCredits.nextExpiresAtMs ?? null,
                ...(value.rateLimitResetCredits.hasCredits
                  ? {
                      credits: value.rateLimitResetCredits.credits.map((credit) => ({
                        status: credit.status,
                        expiresAt: credit.expiresAtMs ?? null,
                        grantedAt: credit.grantedAtMs ?? null
                      }))
                    }
                  : {})
              }
            : null
        }
      : {}),
    ...(value.hasPlanType ? { planType: value.planType ?? null } : {}),
    updatedAt: finiteTimestamp(value.updatedAtMs),
    error: value.error ?? null,
    status: usageStatus(value.status),
    ...(value.usageMetadata ? { usageMetadata: usageMetadata(value.usageMetadata) } : {})
  }
}

function rateLimitWindow(value: ProtocolRateLimitWindow): RateLimitWindow {
  if (!Number.isFinite(value.usedPercent) || !Number.isFinite(value.windowMinutes)) {
    throw invalid('Rate-limit window is invalid')
  }
  return {
    usedPercent: value.usedPercent,
    windowMinutes: value.windowMinutes,
    resetsAt: value.resetsAtMs ?? null,
    resetDescription: value.resetDescription ?? null
  }
}

function rateLimitTarget(value: ProtocolRateLimitRuntimeTarget): RateLimitRuntimeTarget {
  return { runtime: managedRuntime(value.runtime), wslDistro: value.wslDistro ?? null }
}

function inactiveAccount(value: AccountRateLimitState['inactiveClaudeAccounts'][number]) {
  if (!value.accountId.trim()) {
    throw invalid('Inactive account identifier is missing')
  }
  return {
    accountId: value.accountId,
    rateLimits: optionalProvider(value.rateLimits),
    updatedAt: finiteTimestamp(value.updatedAtMs),
    isFetching: value.isFetching
  }
}

function usageMetadata(value: ProtocolMetadata): UsageRateLimitMetadata {
  const source = usageSource(value.source)
  const failureKind = usageFailure(value.failureKind)
  const lastSuccessfulSource = usageSource(value.lastSuccessfulSource)
  const attemptedSources = value.attemptedSources.map(requiredUsageSource)
  return {
    ...(source ? { source } : {}),
    ...(value.hasAttemptedSources ? { attemptedSources } : {}),
    ...(failureKind ? { failureKind } : {}),
    ...(value.credentialSource === undefined ? {} : { credentialSource: value.credentialSource }),
    ...(value.authProvenance === undefined ? {} : { authProvenance: value.authProvenance }),
    ...(value.deferredByLiveClaudeSession === undefined
      ? {}
      : { deferredByLiveClaudeSession: value.deferredByLiveClaudeSession }),
    ...(lastSuccessfulSource ? { lastSuccessfulSource } : {})
  }
}

function accountProvider(value: AccountProvider): ProviderRateLimits['provider'] {
  switch (value) {
    case AccountProvider.CLAUDE:
      return 'claude'
    case AccountProvider.CODEX:
      return 'codex'
    case AccountProvider.CURSOR:
      return 'cursor'
    case AccountProvider.GEMINI:
      return 'gemini'
    case AccountProvider.OPEN_CODE_GO:
      return 'opencode-go'
    case AccountProvider.KIMI:
      return 'kimi'
    case AccountProvider.ANTIGRAVITY:
      return 'antigravity'
    case AccountProvider.MINIMAX:
      return 'minimax'
    case AccountProvider.GROK:
      return 'grok'
    case AccountProvider.UNSPECIFIED:
      throw invalid('Rate-limit provider is unspecified')
  }
  throw invalid('Rate-limit provider is unknown')
}

function usageStatus(value: AccountUsageStatus): ProviderRateLimits['status'] {
  switch (value) {
    case AccountUsageStatus.IDLE:
      return 'idle'
    case AccountUsageStatus.FETCHING:
      return 'fetching'
    case AccountUsageStatus.OK:
      return 'ok'
    case AccountUsageStatus.ERROR:
      return 'error'
    case AccountUsageStatus.UNAVAILABLE:
      return 'unavailable'
    case AccountUsageStatus.UNSPECIFIED:
      throw invalid('Rate-limit status is unspecified')
  }
  throw invalid('Rate-limit status is unknown')
}

function usageSource(value: ProtocolSource): UsageRateLimitSource | undefined {
  return value === ProtocolSource.UNSPECIFIED ? undefined : requiredUsageSource(value)
}

function requiredUsageSource(value: ProtocolSource): UsageRateLimitSource {
  switch (value) {
    case ProtocolSource.OAUTH:
      return 'oauth'
    case ProtocolSource.CLI:
      return 'cli'
    case ProtocolSource.WEB:
      return 'web'
    case ProtocolSource.UNSPECIFIED:
      throw invalid('Usage source is unspecified')
  }
  throw invalid('Usage source is unknown')
}

function usageFailure(value: ProtocolFailureKind): UsageRateLimitFailureKind | undefined {
  switch (value) {
    case ProtocolFailureKind.UNSPECIFIED:
      return undefined
    case ProtocolFailureKind.MISSING_CREDENTIALS:
      return 'missing-credentials'
    case ProtocolFailureKind.STALE_TOKEN:
      return 'stale-token'
    case ProtocolFailureKind.REFRESHABLE_CREDENTIALS_WITHOUT_TOKEN:
      return 'refreshable-credentials-without-token'
    case ProtocolFailureKind.DELEGATED_REFRESH_REQUIRED:
      return 'delegated-refresh-required'
    case ProtocolFailureKind.DEFERRED_BY_LIVE_SESSION:
      return 'deferred-by-live-session'
    case ProtocolFailureKind.KEYCHAIN_UNAVAILABLE:
      return 'keychain-unavailable'
    case ProtocolFailureKind.MISSING_SCOPE:
      return 'missing-scope'
    case ProtocolFailureKind.NETWORK:
      return 'network'
    case ProtocolFailureKind.SERVER:
      return 'server'
    case ProtocolFailureKind.PARSE:
      return 'parse'
    case ProtocolFailureKind.RATE_LIMITED:
      return 'rate-limited'
    case ProtocolFailureKind.CLI_UNAVAILABLE:
      return 'cli-unavailable'
    case ProtocolFailureKind.USAGE_UNAVAILABLE:
      return 'usage-unavailable'
    case ProtocolFailureKind.UNKNOWN:
      return 'unknown'
  }
  throw invalid('Usage failure is unknown')
}

function resetOutcome(value: ProtocolResetOutcome): CodexRateLimitResetOutcome {
  switch (value) {
    case ProtocolResetOutcome.RESET:
      return 'reset'
    case ProtocolResetOutcome.NOTHING_TO_RESET:
      return 'nothingToReset'
    case ProtocolResetOutcome.NO_CREDIT:
      return 'noCredit'
    case ProtocolResetOutcome.ALREADY_REDEEMED:
      return 'alreadyRedeemed'
    case ProtocolResetOutcome.UNSPECIFIED:
      throw invalid('Codex reset outcome is unspecified')
  }
  throw invalid('Codex reset outcome is unknown')
}

function managedRuntime(value: ManagedAccountRuntime): 'host' | 'wsl' {
  switch (value) {
    case ManagedAccountRuntime.HOST:
      return 'host'
    case ManagedAccountRuntime.WSL:
      return 'wsl'
    case ManagedAccountRuntime.UNSPECIFIED:
      throw invalid('Managed account runtime is unspecified')
  }
  throw invalid('Managed account runtime is unknown')
}

function safeInteger(value: bigint): number {
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < 0) {
    throw invalid('Rate-limit credit count is invalid')
  }
  return number
}

function finiteTimestamp(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw invalid('Rate-limit timestamp is invalid')
  }
  return value
}

function invalid(message: string): RuntimeProtocolError {
  return new RuntimeProtocolError(StatusCode.DATA_LOSS, message)
}

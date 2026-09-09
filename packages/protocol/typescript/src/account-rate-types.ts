export type RateLimitWindow = {
  usedPercent: number
  windowMinutes: number
  resetsAt: number | null
  resetDescription: string | null
}

export type UsageRateLimitSource = 'oauth' | 'cli' | 'web'

export type UsageRateLimitFailureKind =
  | 'missing-credentials'
  | 'stale-token'
  | 'refreshable-credentials-without-token'
  | 'delegated-refresh-required'
  | 'deferred-by-live-session'
  | 'keychain-unavailable'
  | 'missing-scope'
  | 'network'
  | 'server'
  | 'parse'
  | 'rate-limited'
  | 'cli-unavailable'
  | 'usage-unavailable'
  | 'unknown'

export type UsageRateLimitMetadata = {
  source?: UsageRateLimitSource
  attemptedSources?: UsageRateLimitSource[]
  failureKind?: UsageRateLimitFailureKind
  credentialSource?: string
  authProvenance?: string
  deferredByLiveClaudeSession?: boolean
  lastSuccessfulSource?: UsageRateLimitSource
}

export type ProviderRateLimits = {
  provider:
    | 'claude'
    | 'codex'
    | 'cursor'
    | 'gemini'
    | 'opencode-go'
    | 'kimi'
    | 'minimax'
    | 'grok'
    | 'antigravity'
  session: RateLimitWindow | null
  weekly: RateLimitWindow | null
  fableWeekly?: RateLimitWindow | null
  monthly?: RateLimitWindow | null
  buckets?: (RateLimitWindow & { name: string })[]
  rateLimitResetCredits?: {
    availableCount: number
    totalEarnedCount?: number
    nextExpiresAt?: number | null
    credits?: { status: string; expiresAt: number | null; grantedAt: number | null }[]
  } | null
  planType?: string | null
  updatedAt: number
  error: string | null
  status: 'idle' | 'fetching' | 'ok' | 'error' | 'unavailable'
  usageMetadata?: UsageRateLimitMetadata
}

export type RateLimitRuntimeTarget = {
  runtime: 'host' | 'wsl'
  wslDistro: string | null
}

export type CursorRateLimitRefreshContext = {
  executionHostId: string
  workspaceId: string | null
}

export type InactiveAccountUsage = {
  accountId: string
  rateLimits: ProviderRateLimits | null
  updatedAt: number
  isFetching: boolean
}

export type RateLimitState = {
  claude: ProviderRateLimits | null
  codex: ProviderRateLimits | null
  cursor: ProviderRateLimits | null
  gemini: ProviderRateLimits | null
  opencodeGo: ProviderRateLimits | null
  kimi: ProviderRateLimits | null
  antigravity: ProviderRateLimits | null
  minimax: ProviderRateLimits | null
  grok: ProviderRateLimits | null
  minimaxCookieConfigured: boolean
  grokAuthConfigured: boolean
  claudeTarget: RateLimitRuntimeTarget
  codexTarget: RateLimitRuntimeTarget
  inactiveClaudeAccounts: InactiveAccountUsage[]
  inactiveCodexAccounts: InactiveAccountUsage[]
}

export type CodexRateLimitResetOutcome = 'reset' | 'nothingToReset' | 'noCredit' | 'alreadyRedeemed'

export type CodexRateLimitResetResult = {
  outcome: CodexRateLimitResetOutcome
  state: RateLimitState
}

export type ProviderRateLimitStatus = ProviderRateLimits['status']
export type RateLimitBucket = NonNullable<ProviderRateLimits['buckets']>[number]

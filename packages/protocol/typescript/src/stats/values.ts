import type { AiVaultAgent } from '../ai-vault/providers'
import type { StatsUsageRange } from './range'

export type RuntimeStatsDailyActivity = {
  day: string
  agentStarts: number
  prsCreated: number
}

export type RuntimeStatsDailyTokens = {
  day: string
  tokens: number
}

export type RuntimeStatsDailyValue = {
  day: string
  valueUsd: number
}

export type RuntimeStatsModelUsage = {
  key: string
  label: string
  tokens: number
  valueUsd: number | null
}

export type RuntimeStatsUsageProvider = 'claude' | 'codex' | 'open-code'

export type RuntimeStatsProviderUsage = {
  provider: RuntimeStatsUsageProvider
  tokens: number
  valueUsd: number | null
}

export type RuntimeStatsDailyProviderUsage = {
  day: string
  providers: RuntimeStatsProviderUsage[]
}

export type RuntimeStatsProjectUsage = {
  key: string
  label: string
  sessions: number
  tokens: number
  valueUsd: number | null
  providers: RuntimeStatsProviderUsage[]
}

export type RuntimeStatsSupplementalDailyUsage = RuntimeStatsDailyTokens & {
  valueUsd: number | null
  unpricedTokens: number
}

export type RuntimeStatsSupplementalUsage = {
  dailyTokens: RuntimeStatsSupplementalDailyUsage[]
  modelUsage: RuntimeStatsModelUsage[]
  // Why: Cursor reports plan-metered spend separately from its vendor list-price
  // estimate, so an absent value must remain distinct from an unknown value.
  meteredValueUsd?: number | null
}

export type RuntimeStatsSummary = {
  totalAgentsSpawned: number
  totalPRsCreated: number
  totalAgentTimeMs: number
  firstEventAt: number | null
  // Why: optional fields preserve compatibility with older runtime hosts.
  dailyActivity?: RuntimeStatsDailyActivity[]
  dailyTokens?: RuntimeStatsDailyTokens[]
  // Why: a known-cost day from one host must not hide unpriced tokens from
  // another host when mobile combines several runtime summaries.
  dailyUnpricedTokens?: RuntimeStatsDailyTokens[]
  tokenDataAvailable?: boolean
  tokenUnavailableAgents?: AiVaultAgent[]
  dailyValues?: RuntimeStatsDailyValue[]
  modelUsage?: RuntimeStatsModelUsage[]
  // Why: clients render provider and project breakdowns from this snapshot, and
  // only the host can attribute usage to a provider store or a worktree path.
  dailyProviderUsage?: RuntimeStatsDailyProviderUsage[]
  projectUsage?: RuntimeStatsProjectUsage[]
  // Why: a host that predates ranged reads ignores the requested range, so the
  // answer echoes what it actually measured instead of letting a client label
  // all-time usage as a bounded window.
  usageRange?: StatsUsageRange
  // Why: desktop keeps provider stores live for fast refreshes, while this
  // snapshot carries token-only agents that do not have a dedicated store.
  supplementalUsage?: RuntimeStatsSupplementalUsage
  usageValueAvailable?: boolean
  hasUnpricedUsage?: boolean
}

export type StatsSummaryUnavailable = { [Key in keyof RuntimeStatsSummary]?: never }
export type StatsSummaryResult = RuntimeStatsSummary | StatsSummaryUnavailable

export type StatsSummary = RuntimeStatsSummary

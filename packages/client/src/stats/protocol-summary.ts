// Why: local and routed runtime stats share the same strict domain conversion.
import {
  StatsUnavailableAgent,
  StatsUsageProvider,
  StatsUsageRange,
  type GetSummaryResponse,
  type StatsDailyActivity,
  type StatsDailyProviderUsage,
  type StatsDailyTokens,
  type StatsDailyValue,
  type StatsModelUsage,
  type StatsProjectUsage,
  type StatsProviderUsage,
  type StatsSupplementalDailyUsage,
  type StatsSupplementalUsage
} from '@yiru/protocol'
import type { StatsSummary } from '@yiru/protocol/stats/values'

export function mapProtocolStatsSummary(
  summary: GetSummaryResponse,
  requestedRange?: '7d' | '30d' | '90d' | 'all'
): StatsSummary {
  const mappedUsageRange = usageRange(summary.usageRange, requestedRange)
  return {
    totalAgentsSpawned: safeUint64(summary.totalAgentsSpawned, 'total_agents_spawned'),
    totalPRsCreated: safeUint64(summary.totalPrsCreated, 'total_prs_created'),
    totalAgentTimeMs: safeUint64(summary.totalAgentTimeMs, 'total_agent_time_ms'),
    firstEventAt:
      summary.firstEventAt === undefined ? null : finite(summary.firstEventAt, 'first_event_at'),
    dailyActivity: summary.dailyActivity.map(mapDailyActivity),
    dailyTokens: summary.dailyTokens.map(mapDailyTokens),
    dailyUnpricedTokens: summary.dailyUnpricedTokens.map(mapDailyTokens),
    dailyValues: summary.dailyValues.map(mapDailyValue),
    dailyProviderUsage: summary.dailyProviderUsage.map(mapDailyProviderUsage),
    modelUsage: summary.modelUsage.map(mapModelUsage),
    projectUsage: summary.projectUsage.map(mapProjectUsage),
    tokenDataAvailable: summary.tokenDataAvailable,
    tokenUnavailableAgents: summary.tokenUnavailableAgents.flatMap((agent) => {
      const mapped = unavailableAgent(agent)
      return mapped ? [mapped] : []
    }),
    ...(mappedUsageRange ? { usageRange: mappedUsageRange } : {}),
    supplementalUsage: mapSupplemental(required(summary.supplementalUsage, 'supplemental_usage')),
    usageValueAvailable: summary.usageValueAvailable,
    hasUnpricedUsage: summary.hasUnpricedUsage
  }
}

function mapDailyActivity(
  activity: StatsDailyActivity
): NonNullable<StatsSummary['dailyActivity']>[number] {
  return {
    day: activity.day,
    agentStarts: safeUint64(activity.agentStarts, 'daily_activity.agent_starts'),
    prsCreated: safeUint64(activity.prsCreated, 'daily_activity.prs_created')
  }
}

function mapDailyTokens(
  tokens: StatsDailyTokens
): NonNullable<StatsSummary['dailyTokens']>[number] {
  return {
    day: tokens.day,
    tokens: safeUint64(tokens.tokens, 'daily_tokens.tokens')
  }
}

function mapDailyValue(value: StatsDailyValue): NonNullable<StatsSummary['dailyValues']>[number] {
  return {
    day: value.day,
    valueUsd: finite(required(value.valueUsd, 'daily_values.value_usd'), 'daily_values.value_usd')
  }
}

function mapDailyProviderUsage(
  usage: StatsDailyProviderUsage
): NonNullable<StatsSummary['dailyProviderUsage']>[number] {
  return {
    day: usage.day,
    providers: usage.providers.flatMap((provider) => {
      const mapped = mapProviderUsage(provider)
      return mapped ? [mapped] : []
    })
  }
}

function mapProviderUsage(
  usage: StatsProviderUsage
): NonNullable<StatsSummary['dailyProviderUsage']>[number]['providers'][number] | undefined {
  const provider = usageProvider(usage.provider)
  if (!provider) {
    return undefined
  }
  return {
    provider,
    tokens: safeUint64(usage.tokens, 'provider_usage.tokens'),
    valueUsd: optionalFinite(usage.valueUsd, 'provider_usage.value_usd')
  }
}

function mapModelUsage(usage: StatsModelUsage): NonNullable<StatsSummary['modelUsage']>[number] {
  return {
    key: usage.key,
    label: usage.label,
    tokens: safeUint64(usage.tokens, 'model_usage.tokens'),
    valueUsd: optionalFinite(usage.valueUsd, 'model_usage.value_usd')
  }
}

function mapProjectUsage(
  usage: StatsProjectUsage
): NonNullable<StatsSummary['projectUsage']>[number] {
  return {
    key: usage.key,
    label: usage.label,
    sessions: safeUint64(usage.sessions, 'project_usage.sessions'),
    tokens: safeUint64(usage.tokens, 'project_usage.tokens'),
    valueUsd: optionalFinite(usage.valueUsd, 'project_usage.value_usd'),
    providers: usage.providers.flatMap((provider) => {
      const mapped = mapProviderUsage(provider)
      return mapped ? [mapped] : []
    })
  }
}

function mapSupplemental(
  usage: StatsSupplementalUsage
): NonNullable<StatsSummary['supplementalUsage']> {
  return {
    dailyTokens: usage.dailyTokens.map(mapSupplementalDaily),
    modelUsage: usage.modelUsage.map(mapModelUsage),
    ...(usage.meteredValueUsd === undefined
      ? {}
      : { meteredValueUsd: finite(usage.meteredValueUsd, 'supplemental_usage.metered_value_usd') })
  }
}

function mapSupplementalDaily(
  usage: StatsSupplementalDailyUsage
): NonNullable<StatsSummary['supplementalUsage']>['dailyTokens'][number] {
  return {
    day: usage.day,
    tokens: safeUint64(usage.tokens, 'supplemental_usage.daily_tokens.tokens'),
    valueUsd: optionalFinite(usage.valueUsd, 'supplemental_usage.daily_tokens.value_usd'),
    unpricedTokens: safeUint64(
      usage.unpricedTokens,
      'supplemental_usage.daily_tokens.unpriced_tokens'
    )
  }
}

function usageProvider(
  provider: StatsUsageProvider
):
  | NonNullable<StatsSummary['dailyProviderUsage']>[number]['providers'][number]['provider']
  | undefined {
  switch (provider) {
    case StatsUsageProvider.CLAUDE:
      return 'claude'
    case StatsUsageProvider.CODEX:
      return 'codex'
    case StatsUsageProvider.OPEN_CODE:
      return 'open-code'
    case StatsUsageProvider.UNSPECIFIED:
      throw new Error('Runtime returned an unspecified stats usage provider.')
  }
  return undefined
}

function unavailableAgent(
  agent: StatsUnavailableAgent
): NonNullable<StatsSummary['tokenUnavailableAgents']>[number] | undefined {
  switch (agent) {
    case StatsUnavailableAgent.ANTIGRAVITY:
      return 'antigravity'
    case StatsUnavailableAgent.CURSOR:
      return 'cursor'
    case StatsUnavailableAgent.HERMES:
      return 'hermes'
    case StatsUnavailableAgent.ROVO:
      return 'rovo'
    case StatsUnavailableAgent.UNSPECIFIED:
      throw new Error('Runtime returned an unspecified unavailable stats agent.')
  }
  return undefined
}

function usageRange(
  range: StatsUsageRange,
  fallback: '7d' | '30d' | '90d' | 'all' | undefined
): NonNullable<StatsSummary['usageRange']> | undefined {
  switch (range) {
    case StatsUsageRange.SEVEN_DAYS:
      return '7d'
    case StatsUsageRange.THIRTY_DAYS:
      return '30d'
    case StatsUsageRange.NINETY_DAYS:
      return '90d'
    case StatsUsageRange.ALL:
      return 'all'
    case StatsUsageRange.UNSPECIFIED:
      throw new Error('Runtime returned an unspecified stats usage range.')
  }
  return fallback
}

function required<T>(value: T | undefined, field: string): T {
  if (value === undefined) {
    throw new Error(`Runtime stats response is missing ${field}.`)
  }
  return value
}

function safeUint64(value: bigint, field: string): number {
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error(`Runtime stats ${field} exceeds JavaScript's safe integer range.`)
  }
  return number
}

function optionalFinite(value: number | undefined, field: string): number | null {
  return value === undefined ? null : finite(value, field)
}

function finite(value: number, field: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`Runtime stats ${field} is invalid.`)
  }
  return value
}

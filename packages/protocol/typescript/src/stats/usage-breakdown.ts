import type { ClaudeUsageBreakdownRow, ClaudeUsageDailyPoint } from '../provider-usage/models'
import type { CodexUsageBreakdownRow, CodexUsageDailyPoint } from '../provider-usage/models'
import type { OpenCodeUsageBreakdownRow, OpenCodeUsageDailyPoint } from '../provider-usage/models'
import type {
  RuntimeStatsDailyProviderUsage,
  RuntimeStatsProjectUsage,
  RuntimeStatsProviderUsage,
  RuntimeStatsUsageProvider
} from './values'

export type UsageProvider = RuntimeStatsUsageProvider
export type ProviderUsageValue = RuntimeStatsProviderUsage
export type DailyProviderUsage = RuntimeStatsDailyProviderUsage
export type ProjectUsageValue = RuntimeStatsProjectUsage

export type UsageBreakdownInput = {
  claude: {
    daily: ClaudeUsageDailyPoint[]
    projectBreakdown: ClaudeUsageBreakdownRow[]
  }
  codex: {
    daily: CodexUsageDailyPoint[]
    projectBreakdown: CodexUsageBreakdownRow[]
  }
  openCode: {
    daily: OpenCodeUsageDailyPoint[]
    projectBreakdown: OpenCodeUsageBreakdownRow[]
  }
}

type ProjectUsageInput = {
  key: string
  label: string
  provider: UsageProvider
  sessions: number
  tokens: number
  valueUsd: number | null
}

type ProjectUsageAccumulator = Omit<ProjectUsageValue, 'providers' | 'valueUsd'> & {
  knownValueUsd: number
  providers: ProviderUsageValue[]
  unpricedTokens: number
}

type DailyProviderInput = {
  day: string
  tokens: number
  estimatedCostUsd: number | null
}

export function buildProjectUsage(input: UsageBreakdownInput): ProjectUsageValue[] {
  return mergeProjectUsage([
    ...input.claude.projectBreakdown.map((project): ProjectUsageInput => ({
      key: project.key,
      label: project.label,
      provider: 'claude',
      sessions: project.sessions,
      tokens: claudeTokens(project),
      valueUsd: project.estimatedCostUsd
    })),
    ...input.codex.projectBreakdown.map((project): ProjectUsageInput => ({
      key: project.key,
      label: project.label,
      provider: 'codex',
      sessions: project.sessions,
      tokens: project.totalTokens,
      valueUsd: project.estimatedCostUsd
    })),
    ...input.openCode.projectBreakdown.map((project): ProjectUsageInput => ({
      key: project.key,
      label: project.label,
      provider: 'open-code',
      sessions: project.sessions,
      tokens: project.totalTokens,
      valueUsd: project.estimatedCostUsd
    }))
  ])
}

export function buildDailyProviderUsage(input: UsageBreakdownInput): DailyProviderUsage[] {
  const byDay = new Map<string, ProviderUsageValue[]>()
  addDailyProviderUsage(
    byDay,
    'claude',
    input.claude.daily.map((point) => ({
      day: point.day,
      tokens: claudeTokens(point),
      estimatedCostUsd: point.estimatedCostUsd
    }))
  )
  addDailyProviderUsage(
    byDay,
    'codex',
    input.codex.daily.map((point) => ({
      day: point.day,
      tokens: point.totalTokens,
      estimatedCostUsd: point.estimatedCostUsd
    }))
  )
  addDailyProviderUsage(
    byDay,
    'open-code',
    input.openCode.daily.map((point) => ({
      day: point.day,
      tokens: point.totalTokens,
      estimatedCostUsd: point.estimatedCostUsd
    }))
  )
  return [...byDay.entries()]
    .map(([day, providers]) => ({ day, providers }))
    .sort((left, right) => left.day.localeCompare(right.day))
}

function claudeTokens(
  usage: Pick<
    ClaudeUsageDailyPoint,
    'inputTokens' | 'outputTokens' | 'cacheReadTokens' | 'cacheWriteTokens'
  >
): number {
  return usage.inputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens
}

function addDailyProviderUsage(
  target: Map<string, ProviderUsageValue[]>,
  provider: UsageProvider,
  points: DailyProviderInput[]
): void {
  for (const point of points) {
    const providers = target.get(point.day) ?? []
    providers.push({ provider, tokens: point.tokens, valueUsd: point.estimatedCostUsd })
    target.set(point.day, providers)
  }
}

function mergeProjectUsage(projects: ProjectUsageInput[]): ProjectUsageValue[] {
  const byProject = new Map<string, ProjectUsageAccumulator>()
  for (const project of projects) {
    const current = byProject.get(project.key) ?? {
      key: project.key,
      label: project.label,
      sessions: 0,
      tokens: 0,
      knownValueUsd: 0,
      unpricedTokens: 0,
      providers: []
    }
    current.sessions += project.sessions
    current.tokens += project.tokens
    if (project.valueUsd === null) {
      current.unpricedTokens += project.tokens
    } else {
      current.knownValueUsd += project.valueUsd
    }
    current.providers.push({
      provider: project.provider,
      tokens: project.tokens,
      valueUsd: project.valueUsd
    })
    byProject.set(project.key, current)
  }
  return [...byProject.values()]
    .map((project) => ({
      key: project.key,
      label: project.label,
      sessions: project.sessions,
      tokens: project.tokens,
      valueUsd: project.unpricedTokens === 0 ? project.knownValueUsd : null,
      providers: project.providers
    }))
    .sort((left, right) => right.tokens - left.tokens)
}

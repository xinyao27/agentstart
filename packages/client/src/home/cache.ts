import { isStatsUsageBoundedRange } from '@agentstart/protocol/stats/range'
import type { ProjectUsageValue, UsageProvider } from '@agentstart/protocol/stats/usage-breakdown'
import type { StatsSummary } from '@agentstart/protocol/stats/values'
import type { ContributionPoint } from '~renderer/contribution-heatmap/calendar'

import type { ModelUsageValue, UsageValue } from './usage-value'

const HOME_DATA_CACHE_KEY = 'agentstart.home.data-cache.v1'
const HOME_DATA_CACHE_SCHEMA_VERSION = 4

type HomeCachedUsageValue = Pick<
  UsageValue,
  | 'dailyTokens'
  | 'dailyValues'
  | 'hasUnpricedUsage'
  | 'hasValue'
  | 'models'
  | 'projects'
  | 'range'
  | 'meteredValueUsd'
>

export type HomeDataSnapshot = {
  stats: StatsSummary
  usage: HomeCachedUsageValue
}

export function loadHomeDataSnapshot(): HomeDataSnapshot | null {
  try {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
      return null
    }
    const raw = window.localStorage.getItem(HOME_DATA_CACHE_KEY)
    if (!raw) {
      return null
    }
    return parseHomeDataSnapshot(JSON.parse(raw))
  } catch {
    // Why: storage can be unavailable or corrupt; Home should fall back to its
    // normal live loading path instead of making the landing page unavailable.
    return null
  }
}

export function saveHomeDataSnapshot(stats: StatsSummary, usage: UsageValue): HomeDataSnapshot {
  const snapshot: HomeDataSnapshot = {
    stats: {
      totalAgentsSpawned: stats.totalAgentsSpawned,
      totalPRsCreated: stats.totalPRsCreated,
      totalAgentTimeMs: stats.totalAgentTimeMs,
      firstEventAt: stats.firstEventAt,
      dailyActivity: stats.dailyActivity ?? []
    },
    usage: {
      dailyTokens: usage.dailyTokens,
      dailyValues: usage.dailyValues,
      hasUnpricedUsage: usage.hasUnpricedUsage,
      hasValue: usage.hasValue,
      models: usage.models,
      projects: usage.projects,
      range: usage.range,
      ...(usage.meteredValueUsd === undefined ? {} : { meteredValueUsd: usage.meteredValueUsd })
    }
  }
  try {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
      return snapshot
    }
    const persisted = JSON.stringify({
      schemaVersion: HOME_DATA_CACHE_SCHEMA_VERSION,
      ...snapshot
    })
    if (window.localStorage.getItem(HOME_DATA_CACHE_KEY) !== persisted) {
      window.localStorage.setItem(HOME_DATA_CACHE_KEY, persisted)
    }
  } catch {
    // Why: a failed cache write must not affect the authoritative live data.
  }
  return snapshot
}

function parseHomeDataSnapshot(value: unknown): HomeDataSnapshot | null {
  if (!isRecord(value) || value.schemaVersion !== HOME_DATA_CACHE_SCHEMA_VERSION) {
    return null
  }
  const stats = parseStatsSummary(value.stats)
  const usage = parseUsageValue(value.usage)
  return stats && usage ? { stats, usage } : null
}

function parseStatsSummary(value: unknown): StatsSummary | null {
  if (
    !isRecord(value) ||
    !isFiniteNumber(value.totalAgentsSpawned) ||
    !isFiniteNumber(value.totalPRsCreated) ||
    !isFiniteNumber(value.totalAgentTimeMs) ||
    (value.firstEventAt !== null && !isFiniteNumber(value.firstEventAt))
  ) {
    return null
  }
  const dailyActivity = parseDailyActivity(value.dailyActivity)
  if (!dailyActivity) {
    return null
  }
  return {
    totalAgentsSpawned: value.totalAgentsSpawned,
    totalPRsCreated: value.totalPRsCreated,
    totalAgentTimeMs: value.totalAgentTimeMs,
    firstEventAt: value.firstEventAt,
    dailyActivity
  }
}

function parseUsageValue(value: unknown): HomeCachedUsageValue | null {
  if (
    !isRecord(value) ||
    typeof value.hasUnpricedUsage !== 'boolean' ||
    typeof value.hasValue !== 'boolean' ||
    !isStatsUsageBoundedRange(value.range)
  ) {
    return null
  }
  const dailyTokens = parseContributionPoints(value.dailyTokens)
  const dailyValues = parseContributionPoints(value.dailyValues)
  const models = parseModels(value.models)
  const projects = parseProjects(value.projects)
  if (!dailyTokens || !dailyValues || !models || !projects) {
    return null
  }
  return {
    dailyTokens,
    dailyValues,
    hasUnpricedUsage: value.hasUnpricedUsage,
    hasValue: value.hasValue,
    models,
    projects,
    range: value.range,
    ...(value.meteredValueUsd === undefined
      ? {}
      : {
          meteredValueUsd:
            value.meteredValueUsd === null || isFiniteNumber(value.meteredValueUsd)
              ? value.meteredValueUsd
              : null
        })
  }
}

function parseProjects(value: unknown): ProjectUsageValue[] | null {
  if (!Array.isArray(value)) {
    return null
  }
  const projects: ProjectUsageValue[] = []
  for (const project of value) {
    if (
      !isRecord(project) ||
      typeof project.key !== 'string' ||
      typeof project.label !== 'string' ||
      !isFiniteNumber(project.sessions) ||
      !isFiniteNumber(project.tokens) ||
      (project.valueUsd !== null && !isFiniteNumber(project.valueUsd))
    ) {
      return null
    }
    const providers = parseProjectProviders(project.providers)
    if (!providers) {
      return null
    }
    projects.push({
      key: project.key,
      label: project.label,
      sessions: project.sessions,
      tokens: project.tokens,
      valueUsd: project.valueUsd,
      providers
    })
  }
  return projects
}

function parseProjectProviders(value: unknown): ProjectUsageValue['providers'] | null {
  if (!Array.isArray(value)) {
    return null
  }
  const providers: ProjectUsageValue['providers'] = []
  for (const provider of value) {
    if (
      !isRecord(provider) ||
      !isUsageProvider(provider.provider) ||
      !isFiniteNumber(provider.tokens) ||
      (provider.valueUsd !== null && !isFiniteNumber(provider.valueUsd))
    ) {
      return null
    }
    providers.push({
      provider: provider.provider,
      tokens: provider.tokens,
      valueUsd: provider.valueUsd
    })
  }
  return providers
}

function isUsageProvider(value: unknown): value is UsageProvider {
  return value === 'claude' || value === 'codex' || value === 'open-code'
}

function parseDailyActivity(value: unknown): NonNullable<StatsSummary['dailyActivity']> | null {
  if (!Array.isArray(value)) {
    return null
  }
  const entries: NonNullable<StatsSummary['dailyActivity']> = []
  for (const entry of value) {
    if (
      !isRecord(entry) ||
      typeof entry.day !== 'string' ||
      !isFiniteNumber(entry.agentStarts) ||
      !isFiniteNumber(entry.prsCreated)
    ) {
      return null
    }
    entries.push({
      day: entry.day,
      agentStarts: entry.agentStarts,
      prsCreated: entry.prsCreated
    })
  }
  return entries
}

function parseContributionPoints(value: unknown): ContributionPoint[] | null {
  if (!Array.isArray(value)) {
    return null
  }
  const points: ContributionPoint[] = []
  for (const point of value) {
    if (!isRecord(point) || typeof point.day !== 'string' || !isFiniteNumber(point.value)) {
      return null
    }
    points.push({ day: point.day, value: point.value })
  }
  return points
}

function parseModels(value: unknown): ModelUsageValue[] | null {
  if (!Array.isArray(value)) {
    return null
  }
  const models: ModelUsageValue[] = []
  for (const model of value) {
    if (
      !isRecord(model) ||
      typeof model.key !== 'string' ||
      typeof model.label !== 'string' ||
      !isFiniteNumber(model.tokens) ||
      (model.valueUsd !== null && !isFiniteNumber(model.valueUsd))
    ) {
      return null
    }
    models.push({
      key: model.key,
      label: model.label,
      tokens: model.tokens,
      valueUsd: model.valueUsd
    })
  }
  return models
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

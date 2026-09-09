import type { ClaudeUsageSnapshot } from '../provider-usage/models'
import type { CodexUsageSnapshot } from '../provider-usage/models'
import type { OpenCodeUsageSnapshot } from '../provider-usage/models'

export type UsageValueModel = {
  key: string
  label: string
  tokens: number
  valueUsd: number | null
}

export type UsageValueDay = {
  day: string
  tokens: number
  valueUsd: number | null
  unpricedTokens: number
}

export type UsageValueSnapshot = {
  daily: UsageValueDay[]
  hasUnpricedUsage: boolean
  hasValue: boolean
  models: UsageValueModel[]
  meteredValueUsd?: number | null
}

export type UsageValueSupplementalInput = {
  daily: UsageValueDay[]
  models: UsageValueModel[]
  meteredValueUsd?: number | null
}

export type UsageValueInput = {
  claude: Pick<ClaudeUsageSnapshot, 'daily' | 'modelBreakdown'>
  codex: Pick<CodexUsageSnapshot, 'daily' | 'modelBreakdown'>
  openCode: Pick<OpenCodeUsageSnapshot, 'daily' | 'modelBreakdown'>
  supplemental?: UsageValueSupplementalInput
}

type ModelAccumulator = {
  key: string
  label: string
  tokens: number
  knownValueUsd: number
  hasKnownValue: boolean
  unpricedTokens: number
}

type DailyAccumulator = {
  day: string
  tokens: number
  knownValueUsd: number
  hasKnownValue: boolean
  unpricedTokens: number
}

export function buildUsageValueSnapshot({
  claude,
  codex,
  openCode,
  supplemental
}: UsageValueInput): UsageValueSnapshot {
  const models = mergeModelUsage([
    ...claude.modelBreakdown.map((model) => ({
      key: `claude:${model.key}`,
      label: model.label,
      tokens:
        model.inputTokens + model.outputTokens + model.cacheReadTokens + model.cacheWriteTokens,
      valueUsd: model.estimatedCostUsd
    })),
    ...codex.modelBreakdown.map((model) => ({
      key: `codex:${model.key}`,
      label: model.label,
      tokens: model.totalTokens,
      valueUsd: model.estimatedCostUsd
    })),
    ...openCode.modelBreakdown.map((model) => ({
      key: `opencode:${model.key}`,
      label: model.label,
      tokens: model.totalTokens,
      valueUsd: model.estimatedCostUsd
    })),
    ...(supplemental?.models ?? [])
  ])
  const daily = mergeDailyUsage([
    ...claude.daily.map((point) => ({
      day: point.day,
      tokens:
        point.inputTokens + point.outputTokens + point.cacheReadTokens + point.cacheWriteTokens,
      valueUsd: point.estimatedCostUsd,
      unpricedTokens: point.unpricedTokens
    })),
    ...codex.daily.map((point) => ({
      day: point.day,
      tokens: point.totalTokens,
      valueUsd: point.estimatedCostUsd,
      unpricedTokens: point.unpricedTokens
    })),
    ...openCode.daily.map((point) => ({
      day: point.day,
      tokens: point.totalTokens,
      valueUsd: point.estimatedCostUsd,
      unpricedTokens: point.unpricedTokens
    })),
    ...(supplemental?.daily ?? [])
  ])
  return {
    daily,
    hasUnpricedUsage:
      daily.some((point) => point.unpricedTokens > 0) ||
      models.some((model) => model.tokens > 0 && model.valueUsd === null),
    hasValue:
      daily.some((point) => point.valueUsd !== null) ||
      models.some((model) => model.valueUsd !== null),
    models,
    ...(supplemental?.meteredValueUsd === undefined
      ? {}
      : { meteredValueUsd: supplemental.meteredValueUsd })
  }
}

function mergeDailyUsage(points: UsageValueDay[]): UsageValueDay[] {
  const byDay = new Map<string, DailyAccumulator>()
  for (const point of points) {
    const current = byDay.get(point.day) ?? {
      day: point.day,
      tokens: 0,
      knownValueUsd: 0,
      hasKnownValue: false,
      unpricedTokens: 0
    }
    current.tokens += point.tokens
    current.unpricedTokens += point.unpricedTokens
    if (point.valueUsd !== null) {
      current.knownValueUsd += point.valueUsd
      current.hasKnownValue = true
    }
    byDay.set(point.day, current)
  }
  return [...byDay.values()]
    .map((point) => ({
      day: point.day,
      tokens: point.tokens,
      valueUsd: point.hasKnownValue && point.unpricedTokens === 0 ? point.knownValueUsd : null,
      unpricedTokens: point.unpricedTokens
    }))
    .sort((left, right) => left.day.localeCompare(right.day))
}

function mergeModelUsage(models: UsageValueModel[]): UsageValueModel[] {
  const byModel = new Map<string, ModelAccumulator>()
  for (const model of models) {
    const key = normalizedModelKey(model.label, model.key)
    const current = byModel.get(key) ?? {
      key,
      label: model.label,
      tokens: 0,
      knownValueUsd: 0,
      hasKnownValue: false,
      unpricedTokens: 0
    }
    current.tokens += model.tokens
    if (model.valueUsd !== null) {
      current.knownValueUsd += model.valueUsd
      current.hasKnownValue = true
    } else {
      current.unpricedTokens += model.tokens
    }
    byModel.set(key, current)
  }
  return [...byModel.values()]
    .map((model) => ({
      key: model.key,
      label: model.label,
      tokens: model.tokens,
      valueUsd: model.hasKnownValue && model.unpricedTokens === 0 ? model.knownValueUsd : null
    }))
    .sort((left, right) => right.tokens - left.tokens)
}

function normalizedModelKey(label: string, key: string): string {
  return key.trim().toLowerCase() || label.trim().toLowerCase()
}

import {
  dayIsInStatsUsageRange,
  type StatsUsageBoundedRange
} from '@agentstart/protocol/stats/range'
import {
  buildDailyProviderUsage,
  buildProjectUsage,
  type DailyProviderUsage,
  type ProjectUsageValue
} from '@agentstart/protocol/stats/usage-breakdown'
import {
  buildUsageValueSnapshot,
  type UsageValueModel,
  type UsageValueSupplementalInput
} from '@agentstart/protocol/stats/usage-value'
import type {
  RuntimeStatsDailyProviderUsage,
  RuntimeStatsSupplementalUsage
} from '@agentstart/protocol/stats/values'
import { useEffect } from 'react'
import type { ContributionPoint } from '~renderer/contribution-heatmap/calendar'
import { useProjectCatalog } from '~renderer/project-catalog/provider'
import { useAppStore } from '~renderer/store/state'

import { buildAddedProjectUsage } from './added-project-usage'

export type ModelUsageValue = UsageValueModel

export type UsageValue = {
  dailyByProvider: DailyProviderUsage[]
  dailyTokens: ContributionPoint[]
  dailyValues: ContributionPoint[]
  hasUnpricedUsage: boolean
  hasValue: boolean
  isReady: boolean
  isScanning: boolean
  models: ModelUsageValue[]
  projects: ProjectUsageValue[]
  range: StatsUsageBoundedRange
  meteredValueUsd?: number | null
}

type UsagePreparation = {
  promise: Promise<void>
  range: StatsUsageBoundedRange
}

const USAGE_PREPARATION_RETRY_DELAY_MS = 1_500

let activeUsagePreparation: UsagePreparation | null = null

export function useUsageValue(range: StatsUsageBoundedRange): UsageValue {
  const claudeScanState = useAppStore((state) => state.claudeUsageScanState)
  const claudeRange = useAppStore((state) => state.claudeUsageRange)
  const claudeSnapshotReady = useAppStore((state) => state.claudeUsageSnapshotReady)
  const claudeDaily = useAppStore((state) => state.claudeUsageDaily)
  const claudeModels = useAppStore((state) => state.claudeUsageModelBreakdown)
  const claudeProjects = useAppStore((state) => state.claudeUsageProjectBreakdown)
  const codexScanState = useAppStore((state) => state.codexUsageScanState)
  const codexRange = useAppStore((state) => state.codexUsageRange)
  const codexSnapshotReady = useAppStore((state) => state.codexUsageSnapshotReady)
  const codexDaily = useAppStore((state) => state.codexUsageDaily)
  const codexModels = useAppStore((state) => state.codexUsageModelBreakdown)
  const codexProjects = useAppStore((state) => state.codexUsageProjectBreakdown)
  const openCodeScanState = useAppStore((state) => state.openCodeUsageScanState)
  const openCodeRange = useAppStore((state) => state.openCodeUsageRange)
  const openCodeSnapshotReady = useAppStore((state) => state.openCodeUsageSnapshotReady)
  const openCodeDaily = useAppStore((state) => state.openCodeUsageDaily)
  const openCodeModels = useAppStore((state) => state.openCodeUsageModelBreakdown)
  const openCodeProjects = useAppStore((state) => state.openCodeUsageProjectBreakdown)
  const { repos } = useProjectCatalog()
  const summaryDailyProviderUsage = useAppStore((state) => state.statsSummary?.dailyProviderUsage)
  const supplementalUsage = useAppStore((state) => state.statsSummary?.supplementalUsage)

  useEffect(() => {
    let disposed = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    const prepare = (): void => {
      const scheduleRetry = (): void => {
        if (disposed || usageSnapshotsReady(range)) {
          return
        }
        retryTimer = setTimeout(prepare, USAGE_PREPARATION_RETRY_DELAY_MS)
      }
      void prepareUsageSnapshots(range).then(scheduleRetry, scheduleRetry)
    }

    prepare()
    return () => {
      disposed = true
      if (retryTimer !== null) {
        clearTimeout(retryTimer)
      }
    }
  }, [range])

  const claudeReady = claudeRange === range && claudeSnapshotReady
  const codexReady = codexRange === range && codexSnapshotReady
  const openCodeReady = openCodeRange === range && openCodeSnapshotReady
  const isReady = claudeReady && codexReady && openCodeReady
  const aggregationInput = {
    claude: {
      daily: claudeReady ? claudeDaily : [],
      projectBreakdown: claudeReady ? claudeProjects : []
    },
    codex: {
      daily: codexReady ? codexDaily : [],
      projectBreakdown: codexReady ? codexProjects : []
    },
    openCode: {
      daily: openCodeReady ? openCodeDaily : [],
      projectBreakdown: openCodeReady ? openCodeProjects : []
    }
  }
  const supplemental = (() =>
    supplementalUsage ? mapSupplementalUsage(supplementalUsage, range) : undefined)()
  const usage = (() =>
    buildUsageValueSnapshot({
      claude: {
        daily: claudeReady ? claudeDaily : [],
        modelBreakdown: claudeReady ? claudeModels : []
      },
      codex: {
        daily: codexReady ? codexDaily : [],
        modelBreakdown: codexReady ? codexModels : []
      },
      openCode: {
        daily: openCodeReady ? openCodeDaily : [],
        modelBreakdown: openCodeReady ? openCodeModels : []
      },
      supplemental
    }))()
  const projects = (() => buildAddedProjectUsage(buildProjectUsage(aggregationInput), repos))()
  const liveDailyByProvider = (() => buildDailyProviderUsage(aggregationInput))()
  const summaryDailyByProvider = (() =>
    summaryDailyProviderUsage ? mapDailyProviderUsage(summaryDailyProviderUsage, range) : [])()
  const dailyByProvider =
    isReady && liveDailyByProvider.length > 0
      ? liveDailyByProvider
      : summaryDailyByProvider.length > 0
        ? summaryDailyByProvider
        : liveDailyByProvider

  return (() => ({
    // Why: one provider can be temporarily unavailable while the other stores
    // still have valid data; hiding the whole chart makes a partial runtime
    // failure look like missing usage.
    dailyByProvider,
    dailyTokens: isReady
      ? usage.daily.map((point) => ({ day: point.day, value: point.tokens }))
      : [],
    dailyValues: isReady
      ? usage.daily.flatMap((point) =>
          point.valueUsd === null ? [] : [{ day: point.day, value: point.valueUsd }]
        )
      : [],
    hasUnpricedUsage: isReady && usage.hasUnpricedUsage,
    hasValue: isReady && usage.hasValue,
    isReady,
    isScanning:
      !isReady ||
      claudeScanState?.isScanning === true ||
      codexScanState?.isScanning === true ||
      openCodeScanState?.isScanning === true,
    models: isReady ? usage.models : [],
    projects: isReady ? projects : [],
    range,
    // Why: metered spend is an all-time plan deduction the host reports on its
    // own, so it is read straight from the summary rather than from the ranged
    // aggregate that deliberately excludes undated supplemental totals.
    ...(supplementalUsage?.meteredValueUsd === undefined
      ? {}
      : { meteredValueUsd: supplementalUsage.meteredValueUsd })
  }))()
}

function usageSnapshotsReady(range: StatsUsageBoundedRange): boolean {
  const state = useAppStore.getState()
  return (
    state.claudeUsageRange === range &&
    state.claudeUsageSnapshotReady &&
    state.codexUsageRange === range &&
    state.codexUsageSnapshotReady &&
    state.openCodeUsageRange === range &&
    state.openCodeUsageSnapshotReady
  )
}

function mapDailyProviderUsage(
  usage: RuntimeStatsDailyProviderUsage[],
  range: StatsUsageBoundedRange
): DailyProviderUsage[] {
  const now = new Date()
  return usage.filter((point) => dayIsInStatsUsageRange(point.day, range, now))
}

function mapSupplementalUsage(
  usage: RuntimeStatsSupplementalUsage,
  range: StatsUsageBoundedRange
): UsageValueSupplementalInput {
  const now = new Date()
  return {
    daily: usage.dailyTokens
      .filter((point) => dayIsInStatsUsageRange(point.day, range, now))
      .map((point) => ({
        day: point.day,
        tokens: point.tokens,
        valueUsd: point.valueUsd,
        unpricedTokens: point.unpricedTokens
      })),
    // Why: supplemental model and metered totals have no date attribution, so
    // including them in a bounded range would mix all-time and ranged values.
    models: []
  }
}

function prepareUsageSnapshots(range: StatsUsageBoundedRange): Promise<void> {
  if (activeUsagePreparation?.range === range) {
    return activeUsagePreparation.promise
  }

  const promise = Promise.all([
    prepareClaudeUsage(range),
    prepareCodexUsage(range),
    prepareOpenCodeUsage(range)
  ]).then(() => undefined)
  activeUsagePreparation = { promise, range }
  const clearPreparation = (): void => {
    if (activeUsagePreparation?.promise === promise) {
      activeUsagePreparation = null
    }
  }
  void promise.then(clearPreparation, clearPreparation)
  return promise
}

async function prepareClaudeUsage(range: StatsUsageBoundedRange): Promise<void> {
  let state = useAppStore.getState()
  if (
    state.claudeUsageScope === 'agentstart' &&
    state.claudeUsageRange === range &&
    state.claudeUsageSnapshotReady
  ) {
    return
  }
  if (state.claudeUsageScope !== 'agentstart') {
    await state.setClaudeUsageScope('agentstart')
  }
  state = useAppStore.getState()
  if (state.claudeUsageScanState?.enabled === false) {
    await state.enableClaudeUsage()
  }
  state = useAppStore.getState()
  if (state.claudeUsageRange !== range) {
    await state.setClaudeUsageRange(range)
    return
  }
  if (state.claudeUsageSnapshotReady) {
    return
  }
  await useAppStore.getState().fetchClaudeUsage()
}

async function prepareCodexUsage(range: StatsUsageBoundedRange): Promise<void> {
  let state = useAppStore.getState()
  if (
    state.codexUsageScope === 'agentstart' &&
    state.codexUsageRange === range &&
    state.codexUsageSnapshotReady
  ) {
    return
  }
  if (state.codexUsageScope !== 'agentstart') {
    await state.setCodexUsageScope('agentstart')
  }
  state = useAppStore.getState()
  if (state.codexUsageScanState?.enabled === false) {
    await state.enableCodexUsage()
  }
  state = useAppStore.getState()
  if (state.codexUsageRange !== range) {
    await state.setCodexUsageRange(range)
    return
  }
  if (state.codexUsageSnapshotReady) {
    return
  }
  await useAppStore.getState().fetchCodexUsage()
}

async function prepareOpenCodeUsage(range: StatsUsageBoundedRange): Promise<void> {
  let state = useAppStore.getState()
  if (
    state.openCodeUsageScope === 'agentstart' &&
    state.openCodeUsageRange === range &&
    state.openCodeUsageSnapshotReady
  ) {
    return
  }
  if (state.openCodeUsageScope !== 'agentstart') {
    await state.setOpenCodeUsageScope('agentstart')
  }
  state = useAppStore.getState()
  if (state.openCodeUsageScanState?.enabled === false) {
    await state.enableOpenCodeUsage()
  }
  state = useAppStore.getState()
  if (state.openCodeUsageRange !== range) {
    await state.setOpenCodeUsageRange(range)
    return
  }
  if (state.openCodeUsageSnapshotReady) {
    return
  }
  await useAppStore.getState().fetchOpenCodeUsage()
}

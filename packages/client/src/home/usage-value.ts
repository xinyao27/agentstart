import { dayIsInStatsUsageRange, type StatsUsageBoundedRange } from '@yiru/protocol/stats/range'
import {
  buildDailyProviderUsage,
  buildProjectUsage,
  type DailyProviderUsage,
  type ProjectUsageValue
} from '@yiru/protocol/stats/usage-breakdown'
import {
  buildUsageValueSnapshot,
  type UsageValueModel,
  type UsageValueSupplementalInput
} from '@yiru/protocol/stats/usage-value'
import type { RuntimeStatsSupplementalUsage } from '@yiru/protocol/stats/values'
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
  const supplementalUsage = useAppStore((state) => state.statsSummary?.supplementalUsage)

  useEffect(() => {
    void prepareUsageSnapshots(range)
  }, [range])

  const supplemental = (() =>
    supplementalUsage ? mapSupplementalUsage(supplementalUsage, range) : undefined)()
  const usage = (() =>
    buildUsageValueSnapshot({
      claude: {
        daily: claudeDaily,
        modelBreakdown: claudeModels
      },
      codex: {
        daily: codexDaily,
        modelBreakdown: codexModels
      },
      openCode: {
        daily: openCodeDaily,
        modelBreakdown: openCodeModels
      },
      supplemental
    }))()
  const isReady =
    claudeRange === range &&
    claudeSnapshotReady &&
    codexRange === range &&
    codexSnapshotReady &&
    openCodeRange === range &&
    openCodeSnapshotReady
  const aggregationInput = (() => ({
    claude: { daily: claudeDaily, projectBreakdown: claudeProjects },
    codex: { daily: codexDaily, projectBreakdown: codexProjects },
    openCode: { daily: openCodeDaily, projectBreakdown: openCodeProjects }
  }))()
  const projects = (() => buildAddedProjectUsage(buildProjectUsage(aggregationInput), repos))()
  const dailyByProvider = (() => buildDailyProviderUsage(aggregationInput))()

  return (() => ({
    dailyByProvider: isReady ? dailyByProvider : [],
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
    state.claudeUsageScope === 'yiru' &&
    state.claudeUsageRange === range &&
    state.claudeUsageSnapshotReady
  ) {
    return
  }
  if (state.claudeUsageScope !== 'yiru') {
    await state.setClaudeUsageScope('yiru')
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
    state.codexUsageScope === 'yiru' &&
    state.codexUsageRange === range &&
    state.codexUsageSnapshotReady
  ) {
    return
  }
  if (state.codexUsageScope !== 'yiru') {
    await state.setCodexUsageScope('yiru')
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
    state.openCodeUsageScope === 'yiru' &&
    state.openCodeUsageRange === range &&
    state.openCodeUsageSnapshotReady
  ) {
    return
  }
  if (state.openCodeUsageScope !== 'yiru') {
    await state.setOpenCodeUsageScope('yiru')
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

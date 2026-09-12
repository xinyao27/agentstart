import { useEffect, useState } from 'react'
import { ContributionHeatmap } from '~renderer/contribution-heatmap/heatmap'
import type { TokenValueMetric } from '~renderer/contribution-heatmap/metric'
import {
  loadContributionMetric,
  saveContributionMetric
} from '~renderer/contribution-heatmap/preference'
import { translate } from '~renderer/i18n/i18n'
import { useUiLocale } from '~renderer/i18n/use-ui-locale'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { useAppStore } from '~renderer/store/state'
import { Card, CardContent, CardHeader } from '~renderer/ui/card'

import { loadHomeDataSnapshot, saveHomeDataSnapshot } from './cache'
import { MetricControls } from './metric-controls'
import { UsageBreakdowns } from './project-usage'
import { ProviderUsageChart } from './provider-usage-chart'
import { useUsageValue } from './usage-value'
import { useUsageRangePreference } from './use-usage-range'

type MetricDisclosureProps = {
  hasTokens: boolean
  hasUnpricedUsage: boolean
  hasValue: boolean
  isValueScanning: boolean
  metric: TokenValueMetric
  meteredValueUsd?: number | null
}

type SummaryMetricProps = {
  label: string
  value: string
}

export default function HomePage(): React.JSX.Element {
  useUiLocale()
  const liveStats = useAppStore((state) => state.statsSummary)
  const fetchStatsSummary = useAppStore((state) => state.fetchStatsSummary)
  const [cachedSnapshot] = useState(loadHomeDataSnapshot)
  const [usageRange, setUsageRange] = useUsageRangePreference()
  const [metric, setMetric] = useState<TokenValueMetric>(loadContributionMetric)
  const liveUsageValue = useUsageValue(usageRange)
  const stats = liveStats ?? cachedSnapshot?.stats ?? null
  const cachedUsage = cachedSnapshot?.usage.range === usageRange ? cachedSnapshot.usage : null
  const usageValue = (() =>
    liveUsageValue.isReady || cachedUsage === null
      ? liveUsageValue
      : {
          ...cachedUsage,
          // Why: cached contribution metrics can be displayed while provider
          // snapshots reconnect; keep any live provider series visible during
          // that partial-loading window.
          dailyByProvider: liveUsageValue.dailyByProvider,
          isReady: false,
          isScanning: liveUsageValue.isScanning
        })()

  useEffect(() => {
    void fetchStatsSummary()
  }, [fetchStatsSummary])

  useEffect(() => {
    if (liveStats !== null && liveUsageValue.isReady) {
      saveHomeDataSnapshot(liveStats, liveUsageValue)
    }
  }, [liveStats, liveUsageValue])

  const tokenPoints = usageValue.dailyTokens
  const valuePoints = usageValue.dailyValues
  const points = metric === 'tokens' ? tokenPoints : valuePoints
  const lifetimeTotal = (() => points.reduce((sum, point) => sum + point.value, 0))()
  const hasTokens = tokenPoints.some((point) => point.value > 0)
  const hasValue = usageValue.hasValue

  const selectMetric = (nextMetric: TokenValueMetric): void => {
    setMetric(nextMetric)
    saveContributionMetric(nextMetric)
  }

  return (
    <div className="scrollbar-sleek bg-background h-full overflow-y-auto">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-8 pt-6 pb-10">
        <header className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-foreground text-sm font-semibold">
              {translate('auto.components.home.page.title', 'Activity')}
            </h1>
            <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
              {translate(
                'auto.components.home.page.description',
                'A year of agent work, with today in context.'
              )}
            </p>
          </div>
          {stats === null ? <LoadingIndicator className="mt-1 size-4" /> : null}
        </header>

        <div className="border-border bg-border grid gap-px overflow-hidden rounded-xl border sm:grid-cols-2 lg:grid-cols-4">
          <SummaryMetric
            label={translate(
              'auto.components.home.activitySummary.agentsSpawned',
              'Agents spawned'
            )}
            value={stats?.totalAgentsSpawned.toLocaleString() ?? '—'}
          />
          <SummaryMetric
            label={translate(
              'auto.components.home.activitySummary.agentTime',
              'Time agents worked'
            )}
            value={stats === null ? '—' : formatDuration(stats.totalAgentTimeMs)}
          />
          <SummaryMetric
            label={translate('auto.components.home.activitySummary.prsCreated', 'PRs created')}
            value={stats?.totalPRsCreated.toLocaleString() ?? '—'}
          />
          <SummaryMetric
            label={metricSummaryLabel(metric)}
            value={formatMetricValue(lifetimeTotal, metric, hasValue)}
          />
        </div>

        <Card size="compact">
          <CardHeader className="mb-5 flex flex-row flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-foreground text-sm font-semibold">
                {translate('auto.components.home.page.contributions', 'Contribution history')}
              </h2>
              <p className="text-muted-foreground mt-1 text-xs">{metricDescription(metric)}</p>
            </div>
            <MetricControls
              metric={metric}
              range={usageRange}
              onMetricChange={selectMetric}
              onRangeChange={setUsageRange}
            />
          </CardHeader>

          <CardContent>
            <div className="scrollbar-sleek scrollbar-sleek-lg overflow-x-auto pb-1">
              <ContributionHeatmap points={points} metric={metric} />
            </div>

            <MetricDisclosure
              hasTokens={hasTokens}
              hasUnpricedUsage={usageValue.hasUnpricedUsage}
              hasValue={hasValue}
              isValueScanning={usageValue.isScanning}
              metric={metric}
              meteredValueUsd={usageValue.meteredValueUsd}
            />
          </CardContent>
        </Card>

        <ProviderUsageChart
          daily={usageValue.dailyByProvider}
          isScanning={usageValue.isScanning}
          metric={metric}
          range={usageRange}
        />

        <UsageBreakdowns metric={metric} usage={usageValue} />
      </main>
    </div>
  )
}

function MetricDisclosure({
  hasTokens,
  hasUnpricedUsage,
  hasValue,
  isValueScanning,
  metric,
  meteredValueUsd
}: MetricDisclosureProps): React.JSX.Element | null {
  if (!hasTokens) {
    return (
      <>
        <p className="text-muted-foreground mt-4 text-xs">
          {isValueScanning
            ? translate('auto.components.home.page.calculatingValue', 'Calculating…')
            : translate(
                'auto.components.home.page.tokensUnavailable',
                'No Claude, Codex, or OpenCode token usage attributed to AgentStart worktrees is available yet.'
              )}
        </p>
        <CursorMeteredDisclosure valueUsd={meteredValueUsd} />
      </>
    )
  }
  if (metric === 'value') {
    return (
      <>
        <p className="text-muted-foreground mt-4 text-xs">
          {isValueScanning
            ? translate('auto.components.home.page.calculatingValue', 'Calculating…')
            : hasValue
              ? translate(
                  'auto.components.home.page.valueCoverage',
                  'Standard global API-equivalent value sums authoritative per-request model pricing for usage attributed to AgentStart worktrees. Unpriced token categories and session totals without request attribution are excluded; this is not a bill.'
                )
              : translate(
                  'auto.components.home.page.valueUnavailable',
                  'No known model pricing is available for this estimate yet.'
                )}
        </p>
        <CursorMeteredDisclosure valueUsd={meteredValueUsd} />
      </>
    )
  }
  return (
    <>
      <p className="text-muted-foreground mt-4 text-xs">
        {translate(
          'auto.components.home.page.tokenCoverage',
          'Token totals use request-attributed Claude, Codex, and OpenCode records from AgentStart worktrees; cached input is not counted twice, and session totals without request attribution are excluded.'
        )}
        {hasUnpricedUsage
          ? ` ${translate(
              'auto.components.home.page.unpricedCoverage',
              'Tokens without authoritative pricing details are excluded from value totals.'
            )}`
          : null}
      </p>
      <CursorMeteredDisclosure valueUsd={meteredValueUsd} />
    </>
  )
}

function CursorMeteredDisclosure({
  valueUsd
}: {
  valueUsd?: number | null
}): React.JSX.Element | null {
  if (valueUsd === undefined || valueUsd === null) {
    return null
  }
  return (
    <p className="text-muted-foreground mt-2 text-xs">
      {translate(
        'auto.components.home.page.cursorMeteredValue',
        'Cursor-metered spend: {{value}} (actual plan deduction; API value above is a list-price estimate).',
        { value: formatUsd(valueUsd) }
      )}
    </p>
  )
}

function formatUsd(value: number): string {
  return Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2
  }).format(value)
}

function SummaryMetric({ label, value }: SummaryMetricProps): React.JSX.Element {
  return (
    <section className="bg-card px-4 py-3 text-center">
      <p className="text-foreground text-sm font-semibold tabular-nums">{value}</p>
      <p className="text-muted-foreground mt-1 text-xs">{label}</p>
    </section>
  )
}

function formatDuration(durationMs: number): string {
  if (durationMs <= 0) {
    return translate('auto.components.home.activitySummary.durationMinutes', '{{value0}}m', {
      value0: 0
    })
  }
  const totalMinutes = Math.floor(durationMs / 60_000)
  const totalHours = Math.floor(totalMinutes / 60)
  const totalDays = Math.floor(totalHours / 24)
  const remainingHours = totalHours % 24
  const remainingMinutes = totalMinutes % 60
  if (totalDays > 0) {
    return translate(
      'auto.components.home.activitySummary.durationDaysHours',
      '{{value0}}d {{value1}}h',
      { value0: totalDays, value1: remainingHours }
    )
  }
  if (totalHours > 0) {
    return translate(
      'auto.components.home.activitySummary.durationHoursMinutes',
      '{{value0}}h {{value1}}m',
      { value0: totalHours, value1: remainingMinutes }
    )
  }
  return translate('auto.components.home.activitySummary.durationMinutes', '{{value0}}m', {
    value0: totalMinutes
  })
}

function metricDescription(metric: TokenValueMetric): string {
  switch (metric) {
    case 'tokens':
      return translate(
        'auto.components.home.page.tokenDescription',
        'Provider-reported token usage attributed to AgentStart worktrees.'
      )
    case 'value':
      return translate(
        'auto.components.home.page.valueDescription',
        'Standard global API-equivalent value calculated per request from its model and token categories.'
      )
  }
}

function metricSummaryLabel(metric: TokenValueMetric): string {
  switch (metric) {
    case 'tokens':
      return translate('auto.components.home.page.totalTokens', 'Total tokens')
    case 'value':
      return translate('auto.components.home.page.apiValue', 'API value')
  }
}

function formatMetricValue(value: number, metric: TokenValueMetric, hasValue: boolean): string {
  if (metric === 'value') {
    return hasValue
      ? Intl.NumberFormat(undefined, {
          style: 'currency',
          currency: 'USD',
          notation: 'compact',
          maximumFractionDigits: 1
        }).format(value)
      : translate('auto.components.home.page.valueNotAvailable', 'Not available')
  }
  return Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(
    value
  )
}

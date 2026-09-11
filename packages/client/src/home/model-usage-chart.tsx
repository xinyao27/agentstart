import { useState } from 'react'
import type { TokenValueMetric } from '~renderer/contribution-heatmap/metric'
import { DitherPieChart, type DitherPieChartPoint } from '~renderer/dither-kit/pie-chart'
import { translate } from '~renderer/i18n/i18n'
import { ArrowClockwise as RefreshCw } from '~renderer/icons/hugeicons'
import { useAppStore } from '~renderer/store/state'
import { Button } from '~renderer/ui/button'
import { Card, CardContent, CardHeader } from '~renderer/ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

import type { ModelUsageValue } from './usage-value'

const VISIBLE_MODEL_COUNT = 5

type ModelUsageChartProps = {
  metric: TokenValueMetric
  models: ModelUsageValue[]
}

export function ModelUsageChart({ metric, models }: ModelUsageChartProps): React.JSX.Element {
  const data = (() => buildPieData(models, metric))()
  const formatValue = (value: number): string =>
    metric === 'tokens' ? formatTokens(value) : formatCurrency(value)

  return (
    <Card size="compact">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <h2 className="text-foreground text-sm font-semibold">
            {translate('auto.components.home.modelChart.title', 'Model mix')}
          </h2>
          <p className="text-muted-foreground mt-1 text-xs">
            {metric === 'tokens'
              ? translate(
                  'auto.components.home.modelChart.tokenDescription',
                  'Token usage attributed to AgentStart worktrees, grouped by model.'
                )
              : translate(
                  'auto.components.home.modelChart.valueDescription',
                  'Standard global API-equivalent value for token categories with authoritative pricing.'
                )}
          </p>
        </div>
        <UsageRefreshButton />
      </CardHeader>

      {data.length > 0 ? (
        <CardContent className="mt-3">
          <DitherPieChart
            ariaLabel={
              metric === 'tokens'
                ? translate(
                    'auto.components.home.modelChart.tokenAriaLabel',
                    'Token usage by model'
                  )
                : translate(
                    'auto.components.home.modelChart.valueAriaLabel',
                    'Estimated API value by model'
                  )
            }
            data={data}
            formatValue={formatValue}
            totalLabel={
              metric === 'tokens'
                ? translate('auto.components.home.modelChart.tokensTotal', 'total tokens')
                : translate('auto.components.home.modelChart.valueTotal', 'API value')
            }
          />
        </CardContent>
      ) : (
        <CardContent className="mt-4">
          <div
            role="img"
            aria-label={
              metric === 'tokens'
                ? translate(
                    'auto.components.home.modelChart.tokenAriaLabel',
                    'Token usage by model'
                  )
                : translate(
                    'auto.components.home.modelChart.valueAriaLabel',
                    'Estimated API value by model'
                  )
            }
          >
            <span className="border-border text-muted-foreground block w-full rounded-lg border border-dashed px-4 py-8 text-center text-sm">
              {metric === 'tokens'
                ? translate(
                    'auto.components.home.modelChart.tokenUnavailable',
                    'No model token data is available yet.'
                  )
                : translate(
                    'auto.components.home.modelChart.valueUnavailable',
                    'No known model pricing is available for comparison yet.'
                  )}
            </span>
          </div>
        </CardContent>
      )}
    </Card>
  )
}

function UsageRefreshButton(): React.JSX.Element {
  const claudeScanState = useAppStore((state) => state.claudeUsageScanState)
  const codexScanState = useAppStore((state) => state.codexUsageScanState)
  const openCodeScanState = useAppStore((state) => state.openCodeUsageScanState)
  const fetchClaudeUsage = useAppStore((state) => state.fetchClaudeUsage)
  const fetchCodexUsage = useAppStore((state) => state.fetchCodexUsage)
  const fetchOpenCodeUsage = useAppStore((state) => state.fetchOpenCodeUsage)
  const fetchStatsSummary = useAppStore((state) => state.fetchStatsSummary)
  const recordFeatureInteraction = useAppStore((state) => state.recordFeatureInteraction)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const isScanning =
    isRefreshing ||
    claudeScanState === null ||
    codexScanState === null ||
    openCodeScanState === null ||
    claudeScanState.isScanning ||
    codexScanState.isScanning ||
    openCodeScanState.isScanning

  const refreshUsage = (): void => {
    recordFeatureInteraction('usage-tracking')
    setIsRefreshing(true)
    void fetchStatsSummary(true)
      .then(() => Promise.all([fetchClaudeUsage(), fetchCodexUsage(), fetchOpenCodeUsage()]))
      .finally(() => setIsRefreshing(false))
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="quiet"
            size="icon-xs"
            disabled={isScanning}
            aria-label={translate(
              'auto.components.home.modelChart.refreshAriaLabel',
              'Refresh local usage statistics'
            )}
            onClick={refreshUsage}
          >
            <RefreshCw />
          </Button>
        }
      />
      <TooltipContent>
        {translate('auto.components.home.modelChart.refresh', 'Refresh usage')}
      </TooltipContent>
    </Tooltip>
  )
}

function buildPieData(models: ModelUsageValue[], metric: TokenValueMetric): DitherPieChartPoint[] {
  const ranked = models
    .map((model) => ({
      key: model.key,
      label: model.label,
      value: metric === 'tokens' ? model.tokens : (model.valueUsd ?? 0)
    }))
    .filter((model) => model.value > 0)
    .sort((left, right) => right.value - left.value)
  const visible = ranked.slice(0, VISIBLE_MODEL_COUNT)
  const remainingValue = ranked
    .slice(VISIBLE_MODEL_COUNT)
    .reduce((sum, model) => sum + model.value, 0)
  return remainingValue > 0
    ? [
        ...visible,
        {
          key: 'other',
          label: translate('auto.components.home.modelChart.other', 'Other'),
          value: remainingValue
        }
      ]
    : visible
}

function formatTokens(value: number): string {
  return Intl.NumberFormat(undefined, {
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(value)
}

function formatCurrency(value: number): string {
  return Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(value)
}

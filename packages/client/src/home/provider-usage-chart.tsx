import { type StatsUsageBoundedRange, statsUsageRangeDays } from '@agentstart/protocol/stats/range'
import type {
  DailyProviderUsage,
  ProviderUsageValue,
  UsageProvider
} from '@agentstart/protocol/stats/usage-breakdown'
import { useEffect, useRef, useState } from 'react'
import { localCalendarDayKey } from '~renderer/contribution-heatmap/calendar'
import type { TokenValueMetric } from '~renderer/contribution-heatmap/metric'
import {
  ditherBackingSize,
  ditherThreshold,
  resampleDitherValues
} from '~renderer/dither-kit/dither-paint'
import { ditherColor, MONOCHROME_DITHER_SEED } from '~renderer/dither-kit/palette'
import { useChartDimensions } from '~renderer/dither-kit/use-chart-dimensions'
import { translate } from '~renderer/i18n/i18n'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { Card, CardContent, CardHeader } from '~renderer/ui/card'
import { cn } from '~renderer/ui/class-names'

import { providerClassName, providerLabel } from './provider-presentation'

const PROVIDERS: UsageProvider[] = ['claude', 'codex', 'open-code']

type ProviderUsageChartProps = {
  daily: DailyProviderUsage[]
  isScanning: boolean
  metric: TokenValueMetric
  range: StatsUsageBoundedRange
}

type ProviderTrendPoint = {
  day: string
  label: string
  providers: ProviderUsageValue[]
}

export function ProviderUsageChart({
  daily,
  isScanning,
  metric,
  range
}: ProviderUsageChartProps): React.JSX.Element {
  const trend = (() => buildProviderTrend(daily, range))()

  return (
    <Card size="compact">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-foreground text-sm font-semibold">
              {translate('auto.components.home.providerChart.title', 'Daily usage')}
            </h2>
            {isScanning ? <LoadingIndicator className="size-3" /> : null}
          </div>
          <p className="text-muted-foreground mt-1 text-xs">
            {metric === 'tokens'
              ? translate(
                  'auto.components.home.providerChart.tokenDescription',
                  'Token volume by provider across the selected range.'
                )
              : translate(
                  'auto.components.home.providerChart.valueDescription',
                  'Known API-equivalent value by provider; unpriced usage is excluded.'
                )}
          </p>
        </div>
        <ProviderLegend daily={daily} metric={metric} />
      </CardHeader>
      <CardContent className="mt-4">
        <StackedUsageCanvas metric={metric} points={trend} range={range} />
      </CardContent>
    </Card>
  )
}

function ProviderLegend({
  daily,
  metric
}: {
  daily: DailyProviderUsage[]
  metric: TokenValueMetric
}): React.JSX.Element {
  return (
    <div className="flex flex-wrap justify-end gap-x-4 gap-y-1">
      {PROVIDERS.map((provider) => {
        const value = daily.reduce(
          (sum, point) => sum + providerMetric(findProvider(point.providers, provider), metric),
          0
        )
        return (
          <span key={provider} className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <span className={cn('size-2 shrink-0', providerClassName(provider))} />
            <span>{providerLabel(provider)}</span>
            <span className="text-foreground tabular-nums">{formatMetric(value, metric)}</span>
          </span>
        )
      })}
    </div>
  )
}

function StackedUsageCanvas({
  metric,
  points,
  range
}: {
  metric: TokenValueMetric
  points: ProviderTrendPoint[]
  range: StatsUsageBoundedRange
}): React.JSX.Element {
  const { ref, size } = useChartDimensions<HTMLDivElement>()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!(canvas && context) || size.width <= 0 || size.height <= 0) {
      return
    }
    drawStackedUsage(context, canvas, points, metric, size)
  }, [metric, points, size])

  const hoveredPoint = hoverIndex === null ? null : points[hoverIndex]
  const hoverLeft =
    hoverIndex === null || points.length <= 1 ? 50 : (hoverIndex / (points.length - 1)) * 100

  return (
    <div
      ref={ref}
      className="relative block h-48 w-full"
      role="img"
      aria-label={translate(
        'auto.components.home.providerChart.ariaLabel',
        '{{metric}} by provider over {{days}} days',
        {
          metric: metricLabel(metric),
          days: statsUsageRangeDays(range).toLocaleString()
        }
      )}
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="h-[calc(100%-20px)] w-full [image-rendering:pixelated]"
      />
      <span
        className="absolute inset-0"
        onPointerMove={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect()
          const position = Math.max(0, Math.min(bounds.width, event.clientX - bounds.left))
          setHoverIndex(
            Math.min(points.length - 1, Math.floor((position / bounds.width) * points.length))
          )
        }}
        onPointerLeave={() => setHoverIndex(null)}
      />
      {hoveredPoint ? (
        <ProviderTooltip metric={metric} point={hoveredPoint} left={hoverLeft} />
      ) : null}
      <TrendLabels points={points} />
    </div>
  )
}

function ProviderTooltip({
  left,
  metric,
  point
}: {
  left: number
  metric: TokenValueMetric
  point: ProviderTrendPoint
}): React.JSX.Element {
  const total = point.providers.reduce((sum, usage) => sum + providerMetric(usage, metric), 0)
  const tooltipLeft = Math.min(88, Math.max(12, left))
  return (
    <span
      className="border-border bg-popover text-popover-foreground pointer-events-none absolute top-2 z-10 min-w-36 -translate-x-1/2 rounded-md border px-2 py-1.5"
      style={{ left: `${tooltipLeft}%` }}
    >
      <span className="text-muted-foreground block text-[10px]">{point.label}</span>
      <span className="text-foreground mt-0.5 block text-[11px] font-medium tabular-nums">
        {formatMetric(total, metric)}
      </span>
      {PROVIDERS.map((provider) => (
        <span key={provider} className="mt-1 flex items-center justify-between gap-3 text-[10px]">
          <span className="text-muted-foreground">{providerLabel(provider)}</span>
          <span className="text-foreground tabular-nums">
            {formatMetric(providerMetric(findProvider(point.providers, provider), metric), metric)}
          </span>
        </span>
      ))}
    </span>
  )
}

function TrendLabels({ points }: { points: ProviderTrendPoint[] }): React.JSX.Element {
  const indexes = [0, Math.floor((points.length - 1) / 2), points.length - 1]
  return (
    <span className="text-muted-foreground pointer-events-none absolute inset-x-0 bottom-0 flex justify-between text-[10px]">
      {indexes.map((index) => (
        <span key={points[index]?.day ?? index}>{points[index]?.label}</span>
      ))}
    </span>
  )
}

function buildProviderTrend(
  daily: DailyProviderUsage[],
  range: StatsUsageBoundedRange,
  now = new Date()
): ProviderTrendPoint[] {
  const byDay = new Map(daily.map((point) => [point.day, point.providers]))
  const anchor = new Date(now)
  anchor.setHours(0, 0, 0, 0)
  const points: ProviderTrendPoint[] = []
  for (let offset = statsUsageRangeDays(range) - 1; offset >= 0; offset--) {
    const date = new Date(anchor)
    date.setDate(date.getDate() - offset)
    const day = localCalendarDayKey(date)
    points.push({
      day,
      label: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      providers: byDay.get(day) ?? []
    })
  }
  return points
}

function drawStackedUsage(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  points: ProviderTrendPoint[],
  metric: TokenValueMetric,
  size: { width: number; height: number }
): void {
  const { columns, rows } = ditherBackingSize(size.width, size.height - 20)
  canvas.width = columns
  canvas.height = rows
  context.clearRect(0, 0, columns, rows)
  const series = PROVIDERS.map((provider) =>
    resampleDitherValues(
      points.map((point) => providerMetric(findProvider(point.providers, provider), metric)),
      columns
    )
  )
  const maxValue = Math.max(
    1,
    ...points.map((point) =>
      point.providers.reduce((sum, usage) => sum + providerMetric(usage, metric), 0)
    )
  )
  for (let x = 0; x < columns; x++) {
    let floor = rows - 1
    for (let providerIndex = 0; providerIndex < PROVIDERS.length; providerIndex++) {
      const provider = PROVIDERS[providerIndex]
      const value = series[providerIndex]?.[x] ?? 0
      const top = floor - (Math.max(0, value) / maxValue) * (rows - 4)
      paintProviderColumn(context, provider, x, top, floor)
      floor = top
    }
  }
}

function paintProviderColumn(
  context: CanvasRenderingContext2D,
  provider: UsageProvider,
  x: number,
  top: number,
  floor: number
): void {
  const firstRow = Math.round(top)
  const lastRow = Math.round(floor)
  for (let y = firstRow; y < lastRow; y++) {
    if (!providerPixelIsVisible(provider, x, y)) {
      continue
    }
    context.fillStyle = ditherColor(MONOCHROME_DITHER_SEED.fill, 0.82)
    context.fillRect(x, y, 1, 1)
  }
  if (lastRow > firstRow) {
    context.fillStyle = ditherColor(MONOCHROME_DITHER_SEED.fill, 0.96)
    context.fillRect(x, firstRow, 1, 1)
  }
}

function providerPixelIsVisible(provider: UsageProvider, x: number, y: number): boolean {
  switch (provider) {
    case 'claude':
      return ditherThreshold(x, y) < 0.88
    case 'codex':
      return ditherThreshold(x + 1, y) < 0.58
    case 'open-code':
      return ditherThreshold(x + 2, y) < 0.32
  }
}

function findProvider(
  providers: ProviderUsageValue[],
  provider: UsageProvider
): ProviderUsageValue | undefined {
  return providers.find((usage) => usage.provider === provider)
}

function providerMetric(usage: ProviderUsageValue | undefined, metric: TokenValueMetric): number {
  if (!usage) {
    return 0
  }
  return metric === 'tokens' ? usage.tokens : (usage.valueUsd ?? 0)
}

function metricLabel(metric: TokenValueMetric): string {
  return metric === 'tokens'
    ? translate('auto.components.home.providerChart.tokens', 'Tokens')
    : translate('auto.components.home.providerChart.value', 'API value')
}

function formatMetric(value: number, metric: TokenValueMetric): string {
  return metric === 'tokens'
    ? Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value)
    : Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: 'USD',
        notation: 'compact',
        maximumFractionDigits: 1
      }).format(value)
}

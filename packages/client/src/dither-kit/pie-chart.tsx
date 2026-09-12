import { useEffect, useRef, useState } from 'react'
import { cn } from '~renderer/ui/class-names'

import { ditherBackingSize, ditherThreshold } from './dither-paint'
import { ditherColor, MONOCHROME_DITHER_SEED } from './palette'
import { useChartDimensions } from './use-chart-dimensions'

const FULL_CIRCLE = Math.PI * 2
const LEGEND_SWATCH_SIZE = 8

export type DitherPieChartPoint = {
  key: string
  label: string
  value: number
}

type DitherPieChartProps = {
  ariaLabel: string
  data: readonly DitherPieChartPoint[]
  formatValue: (value: number) => string
  totalLabel: string
}

type DitherLegendSwatchProps = {
  index: number
}

export function DitherPieChart({
  ariaLabel,
  data,
  formatValue,
  totalLabel
}: DitherPieChartProps): React.JSX.Element {
  const chartData = (() =>
    data.filter((point) => Number.isFinite(point.value) && point.value > 0))()
  const { ref, size } = useChartDimensions<HTMLSpanElement>()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const total = chartData.reduce((sum, point) => sum + point.value, 0)

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!(canvas && context) || size.width <= 0 || size.height <= 0) {
      return
    }
    drawPie(context, canvas, chartData, size, hoverIndex)
  }, [chartData, hoverIndex, size])

  const hoveredPoint = hoverIndex === null ? null : chartData[hoverIndex]

  return (
    <div
      className="grid items-center gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(180px,0.8fr)]"
      role="img"
      aria-label={ariaLabel}
    >
      <span
        ref={ref}
        className="relative block h-56 min-w-0"
        onPointerMove={(event) => {
          setHoverIndex(pointedSlice(event, chartData))
        }}
        onPointerLeave={() => setHoverIndex(null)}
      >
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          className="h-full w-full [image-rendering:pixelated]"
        />
        <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-foreground text-sm font-semibold tabular-nums">
            {formatValue(total)}
          </span>
          <span className="text-muted-foreground mt-1 text-[10px] uppercase">{totalLabel}</span>
        </span>
        {hoveredPoint ? (
          <span className="border-border bg-popover text-popover-foreground pointer-events-none absolute top-2 left-1/2 z-10 block -translate-x-1/2 rounded-md border px-2 py-1">
            <span className="text-muted-foreground block max-w-44 truncate text-[10px]">
              {hoveredPoint.label}
            </span>
            <span className="text-foreground block text-[11px] font-medium tabular-nums">
              {formatValue(hoveredPoint.value)}
            </span>
          </span>
        ) : null}
      </span>

      <span className="grid content-center gap-2">
        {chartData.map((point, index) => (
          <span
            key={point.key}
            className={cn(
              'text-muted-foreground flex min-w-0 items-center gap-2 text-xs transition-opacity motion-reduce:transition-none',
              hoverIndex === index && 'text-foreground',
              hoverIndex !== null && hoverIndex !== index && 'opacity-40'
            )}
            onPointerEnter={() => setHoverIndex(index)}
            onPointerLeave={() => setHoverIndex(null)}
          >
            <DitherLegendSwatch index={index} />
            <span className="min-w-0 flex-1 truncate">{point.label}</span>
            <span className="text-foreground shrink-0 tabular-nums">
              {formatValue(point.value)}
            </span>
            <span className="text-muted-foreground w-10 shrink-0 text-right tabular-nums">
              {formatPercentage(point.value, total)}
            </span>
          </span>
        ))}
      </span>
    </div>
  )
}

function DitherLegendSwatch({ index }: DitherLegendSwatchProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const context = canvasRef.current?.getContext('2d')
    if (!context) {
      return
    }
    context.clearRect(0, 0, LEGEND_SWATCH_SIZE, LEGEND_SWATCH_SIZE)
    for (let y = 0; y < LEGEND_SWATCH_SIZE; y++) {
      for (let x = 0; x < LEGEND_SWATCH_SIZE; x++) {
        const isLit = slicePatternIsLit(index, x, y, 0.76, ditherThreshold(x + index, y))
        context.fillStyle = ditherColor(MONOCHROME_DITHER_SEED.fill, isLit ? 0.9 : 0.1)
        context.fillRect(x, y, 1, 1)
      }
    }
  }, [index])

  return (
    <canvas
      ref={canvasRef}
      width={LEGEND_SWATCH_SIZE}
      height={LEGEND_SWATCH_SIZE}
      className="border-border size-3.5 shrink-0 border [image-rendering:pixelated]"
      aria-hidden="true"
    />
  )
}

function pointedSlice(
  event: React.PointerEvent<HTMLSpanElement>,
  data: readonly DitherPieChartPoint[]
): number | null {
  const bounds = event.currentTarget.getBoundingClientRect()
  const x = event.clientX - bounds.left - bounds.width / 2
  const y = event.clientY - bounds.top - bounds.height / 2
  const outerRadius = Math.min(bounds.width, bounds.height) * 0.45
  const distance = Math.hypot(x, y)
  if (distance < outerRadius * 0.52 || distance > outerRadius) {
    return null
  }
  let angle = Math.atan2(y, x) + Math.PI / 2
  if (angle < 0) {
    angle += FULL_CIRCLE
  }
  const total = data.reduce((sum, point) => sum + point.value, 0)
  return sliceAtFraction(data, total, angle / FULL_CIRCLE)
}

function drawPie(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  data: readonly DitherPieChartPoint[],
  size: { width: number; height: number },
  hoverIndex: number | null
): void {
  const { columns, rows } = ditherBackingSize(size.width, size.height)
  canvas.width = columns
  canvas.height = rows
  context.clearRect(0, 0, columns, rows)
  const total = data.reduce((sum, point) => sum + point.value, 0)
  if (total <= 0) {
    return
  }
  const centerX = columns / 2
  const centerY = rows / 2
  const outerRadius = Math.min(columns, rows) * 0.45
  const innerRadius = outerRadius * 0.52

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      paintPiePixel(context, x, y, {
        centerX,
        centerY,
        data,
        total,
        innerRadius,
        outerRadius,
        hoverIndex
      })
    }
  }
}

type PiePaintState = {
  centerX: number
  centerY: number
  data: readonly DitherPieChartPoint[]
  total: number
  innerRadius: number
  outerRadius: number
  hoverIndex: number | null
}

function paintPiePixel(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  state: PiePaintState
): void {
  const deltaX = x + 0.5 - state.centerX
  const deltaY = y + 0.5 - state.centerY
  const distance = Math.hypot(deltaX, deltaY)
  if (distance < state.innerRadius || distance > state.outerRadius + 2) {
    return
  }
  let angle = Math.atan2(deltaY, deltaX) + Math.PI / 2
  if (angle < 0) {
    angle += FULL_CIRCLE
  }
  const sliceIndex = sliceAtFraction(state.data, state.total, angle / FULL_CIRCLE)
  if (sliceIndex === null) {
    return
  }
  if (isSliceBoundary(state.data, state.total, angle / FULL_CIRCLE, distance, sliceIndex)) {
    return
  }
  const localOuterRadius =
    sliceIndex === state.hoverIndex ? state.outerRadius + 2 : state.outerRadius
  if (distance > localOuterRadius) {
    return
  }
  const density = (distance - state.innerRadius) / (localOuterRadius - state.innerRadius)
  const threshold = ditherThreshold(x + sliceIndex, y)
  const isLit = slicePatternIsLit(sliceIndex, x, y, density, threshold)
  const isRim = localOuterRadius - distance < 1.2 || distance - state.innerRadius < 1
  const hoverOpacity = state.hoverIndex === null || sliceIndex === state.hoverIndex ? 1 : 0.18
  const alpha = (isRim ? 0.9 : isLit ? 0.86 : 0.08) * hoverOpacity
  context.fillStyle = ditherColor(MONOCHROME_DITHER_SEED.fill, alpha)
  context.fillRect(x, y, 1, 1)
}

function isSliceBoundary(
  data: readonly DitherPieChartPoint[],
  total: number,
  fraction: number,
  distance: number,
  sliceIndex: number
): boolean {
  const halfGap = 0.4 / (FULL_CIRCLE * Math.max(distance, 1))
  return (
    sliceAtFraction(data, total, normalizeFraction(fraction - halfGap)) !== sliceIndex ||
    sliceAtFraction(data, total, normalizeFraction(fraction + halfGap)) !== sliceIndex
  )
}

function normalizeFraction(fraction: number): number {
  if (fraction < 0) {
    return fraction + 1
  }
  return fraction >= 1 ? fraction - 1 : fraction
}

function sliceAtFraction(
  data: readonly DitherPieChartPoint[],
  total: number,
  fraction: number
): number | null {
  let boundary = 0
  for (let index = 0; index < data.length; index++) {
    boundary += (data[index]?.value ?? 0) / total
    if (fraction <= boundary) {
      return index
    }
  }
  return data.length > 0 ? data.length - 1 : null
}

function slicePatternIsLit(
  index: number,
  x: number,
  y: number,
  density: number,
  threshold: number
): boolean {
  if (density <= threshold - 0.16) {
    return false
  }
  const pattern = index % 6
  if (pattern === 0) {
    return true
  }
  if (pattern === 1) {
    return ((x + y) & 3) < 2
  }
  if (pattern === 2) {
    return ((x - y) & 3) < 2
  }
  if (pattern === 3) {
    return (x & 3) < 2
  }
  if (pattern === 4) {
    return (y & 3) < 2
  }
  return (((x >> 1) + (y >> 1)) & 1) === 0
}

function formatPercentage(value: number, total: number): string {
  return Intl.NumberFormat(undefined, {
    style: 'percent',
    maximumFractionDigits: 1
  }).format(total > 0 ? value / total : 0)
}

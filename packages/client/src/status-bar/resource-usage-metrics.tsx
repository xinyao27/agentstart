import type { AppMemory, UsageValues } from '@agentstart/protocol/diagnostics/memory-values'
import React from 'react'
import { translate } from '~renderer/i18n/i18n'
import { CaretDown as ChevronDown, CaretRight as ChevronRight } from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'
import { cn } from '~renderer/ui/class-names'

import type { Metric, UnifiedProjectGroup, UnifiedWorktreeRow } from './resource-usage-merge-types'

export type SortOption = 'memory' | 'cpu' | 'name'

export const METRIC_COLUMNS_CLS = 'flex items-center shrink-0 tabular-nums'
export const CPU_COLUMN_CLS = 'w-12 text-right'
export const MEM_COLUMN_CLS = 'w-16 text-right'
// Why: every row (session, worktree, repo, app) AND the column header
// reserve this same trailing gutter so the CPU/Memory columns line up
// regardless of whether a row carries a kill-X. The X button sits inside
// this gutter for session rows; other rows leave it blank.
export const ROW_TRAILING_GUTTER_CLS = 'w-5 shrink-0 flex items-center justify-end'

// ─── Formatters ─────────────────────────────────────────────────────

export function formatMemory(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function formatCpu(percent: number): string {
  return `${percent.toFixed(1)}%`
}

export function formatPercent(value: number): string {
  return `${value.toFixed(0)}%`
}

function formatMetricCpu(value: Metric): string {
  return value === null ? '—' : formatCpu(value)
}

function formatMetricMemory(value: Metric): string {
  return value === null ? '—' : formatMemory(value)
}

// ─── Sparkline ──────────────────────────────────────────────────────

type SparklineProps = {
  samples: number[]
  width?: number
  height?: number
}

function SparklineImpl({ samples, width = 48, height = 14 }: SparklineProps): React.JSX.Element {
  const points = (() => {
    const safe = Array.isArray(samples) ? samples : []
    if (safe.length < 2) {
      const midY = (height / 2).toFixed(1)
      return `0,${midY} ${width},${midY}`
    }

    let min = safe[0]
    let max = safe[0]
    for (const v of safe) {
      if (v < min) {
        min = v
      }
      if (v > max) {
        max = v
      }
    }
    const range = max - min || 1
    const stepX = width / (safe.length - 1)

    const out: string[] = []
    for (let i = 0; i < safe.length; i++) {
      const x = (i * stepX).toFixed(1)
      const y = (height - ((safe[i] - min) / range) * height).toFixed(1)
      out.push(`${x},${y}`)
    }
    return out.join(' ')
  })()

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden
      preserveAspectRatio="none"
    >
      <polyline
        points={points}
        fill="none"
        strokeWidth={1}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-muted-foreground/70"
      />
    </svg>
  )
}

export const Sparkline = SparklineImpl

// ─── Leaf UI: metric row ────────────────────────────────────────────

export function MetricPair({
  cpu,
  memory,
  size = 'base'
}: {
  cpu: Metric
  memory: Metric
  size?: 'base' | 'small'
}): React.JSX.Element {
  const textCls = size === 'small' ? 'text-[11px]' : 'text-xs'
  const muted = cpu === null && memory === null
  return (
    <div
      className={cn(
        METRIC_COLUMNS_CLS,
        textCls,
        muted ? 'text-muted-foreground/50' : 'text-muted-foreground'
      )}
    >
      <span className={CPU_COLUMN_CLS}>{formatMetricCpu(cpu)}</span>
      <span className={MEM_COLUMN_CLS}>{formatMetricMemory(memory)}</span>
    </div>
  )
}

function AppSubRow({ label, values }: { label: string; values: UsageValues }): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-1.5 pl-6">
      <span className="text-muted-foreground truncate text-[11px]">{label}</span>
      <div className="flex shrink-0 items-center gap-2">
        <MetricPair cpu={values.cpu} memory={values.memory} size="small" />
        <span className={ROW_TRAILING_GUTTER_CLS} aria-hidden />
      </div>
    </div>
  )
}

export function AppSection({
  app,
  isCollapsed,
  onToggle
}: {
  app: AppMemory
  isCollapsed: boolean
  onToggle: () => void
}): React.JSX.Element {
  return (
    <div className="border-border/50 border-t">
      <div className="flex items-center">
        <Button
          variant="ghost"
          size="xs"
          type="button"
          onClick={onToggle}
          className="hover:bg-muted/50 focus-visible:bg-muted/50 h-auto gap-0 border-0 py-2 pr-0.5 pl-2 font-normal transition-colors"
          aria-label={
            isCollapsed
              ? translate(
                  'auto.components.status.bar.ResourceUsageStatusSegment.e419d27083',
                  'Expand AgentStart'
                )
              : translate(
                  'auto.components.status.bar.ResourceUsageStatusSegment.53dd5560ae',
                  'Collapse AgentStart'
                )
          }
          aria-expanded={!isCollapsed}
        >
          {isCollapsed ? (
            <ChevronRight className="text-muted-foreground h-3 w-3" />
          ) : (
            <ChevronDown className="text-muted-foreground h-3 w-3" />
          )}
        </Button>
        <div className="flex min-w-0 flex-1 items-center justify-between py-2 pr-3">
          <span className="text-muted-foreground truncate text-[11px] font-semibold tracking-wide uppercase">
            {translate(
              'auto.components.status.bar.ResourceUsageStatusSegment.288a4dd177',
              'AgentStart'
            )}
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <Sparkline samples={app.history} />
            <MetricPair cpu={app.cpu} memory={app.memory} />
            <span className={ROW_TRAILING_GUTTER_CLS} aria-hidden />
          </div>
        </div>
      </div>
      {!isCollapsed && (
        <div className="border-border/30 border-t">
          <AppSubRow
            label={translate(
              'auto.components.status.bar.ResourceUsageStatusSegment.74e3c11c6f',
              'Daemon'
            )}
            values={app.daemon}
          />
          {(app.other.cpu > 0 || app.other.memory > 0) && (
            <AppSubRow
              label={translate(
                'auto.components.status.bar.ResourceUsageStatusSegment.0f9e50eb07',
                'Other'
              )}
              values={app.other}
            />
          )}
        </div>
      )}
    </div>
  )
}

// ─── Sorting ────────────────────────────────────────────────────────

function compareMetricDesc(a: Metric, b: Metric): number {
  // Why: null metrics (remote rows) sort last regardless of direction so
  // they don't pollute the "biggest CPU/memory consumers" view.
  if (a === null && b === null) {
    return 0
  }
  if (a === null) {
    return 1
  }
  if (b === null) {
    return -1
  }
  return b - a
}

export function sortWorktrees(list: UnifiedWorktreeRow[], sort: SortOption): UnifiedWorktreeRow[] {
  const copy = [...list]
  if (sort === 'memory') {
    copy.sort((a, b) => compareMetricDesc(a.memory, b.memory))
  } else if (sort === 'cpu') {
    copy.sort((a, b) => compareMetricDesc(a.cpu, b.cpu))
  } else {
    copy.sort((a, b) => a.worktreeName.localeCompare(b.worktreeName))
  }
  return copy
}

export function sortProjectGroups(
  groups: UnifiedProjectGroup[],
  sort: SortOption
): UnifiedProjectGroup[] {
  const copy = [...groups]
  if (sort === 'memory') {
    copy.sort((a, b) => compareMetricDesc(a.memory, b.memory))
  } else if (sort === 'cpu') {
    copy.sort((a, b) => compareMetricDesc(a.cpu, b.cpu))
  } else {
    copy.sort((a, b) => a.repoName.localeCompare(b.repoName))
  }
  return copy
}

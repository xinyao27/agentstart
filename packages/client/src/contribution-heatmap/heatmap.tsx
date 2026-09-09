import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { useState } from 'react'
import type {
  ContributionCalendarDay,
  ContributionPoint
} from '~renderer/contribution-heatmap/calendar'
import { buildContributionCalendar } from '~renderer/contribution-heatmap/calendar'
import { translate } from '~renderer/i18n/i18n'
import { useUiLocale } from '~renderer/i18n/use-ui-locale'
import { cn } from '~renderer/ui/class-names'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

import type { ContributionDisplayMetric } from './metric'

const INTENSITY_CLASS: Record<ContributionCalendarDay['intensity'], string> = {
  0: 'border-border/60 bg-muted/40',
  1: 'border-border/70 bg-muted-foreground/20',
  2: 'border-border/80 bg-muted-foreground/35',
  3: 'border-border bg-muted-foreground/55',
  4: 'border-border bg-foreground/80'
}
const INTENSITY_LEVELS = [0, 1, 2, 3, 4] as const
const CELL_STEP_PX = 14

type ContributionHeatmapProps = {
  points: readonly ContributionPoint[]
  metric: ContributionDisplayMetric
  anchorDate?: Date
}

export function ContributionHeatmap({
  points,
  metric,
  anchorDate
}: ContributionHeatmapProps): React.JSX.Element {
  useUiLocale()
  const calendar = (() => buildContributionCalendar(points, anchorDate))()
  const days = calendar.weeks.flatMap((week) => week.days)
  const [activeDayIndex, setActiveDayIndex] = useState<number | null>(null)
  const activeDay = activeDayIndex === null ? null : (days[activeDayIndex] ?? null)
  const activeTriggerStyle: CSSProperties =
    activeDayIndex === null
      ? { visibility: 'hidden' }
      : {
          left: Math.floor(activeDayIndex / 7) * CELL_STEP_PX,
          top: (activeDayIndex % 7) * CELL_STEP_PX
        }
  const weekdayLabels = [
    { day: 'sunday', label: '' },
    {
      day: 'monday',
      label: translate('auto.components.contribution.heatmap.monday', 'Mon')
    },
    { day: 'tuesday', label: '' },
    {
      day: 'wednesday',
      label: translate('auto.components.contribution.heatmap.wednesday', 'Wed')
    },
    { day: 'thursday', label: '' },
    {
      day: 'friday',
      label: translate('auto.components.contribution.heatmap.friday', 'Fri')
    },
    { day: 'saturday', label: '' }
  ]
  const cells = days.map((day, index) => (
    <span
      key={day.day}
      data-contribution-index={index}
      className={cn(
        'size-2.5 border',
        day.isFuture ? 'border-transparent bg-transparent' : INTENSITY_CLASS[day.intensity]
      )}
      role="gridcell"
      aria-label={day.isFuture ? undefined : formatCellLabel(day, metric)}
    />
  ))
  const handlePointerMove = (event: ReactPointerEvent<HTMLElement>): void => {
    const nextIndex = contributionIndexFromTarget(event.target)
    if (nextIndex !== null && !days[nextIndex]?.isFuture) {
      setActiveDayIndex(nextIndex)
    } else {
      setActiveDayIndex(null)
    }
  }
  const clearActiveDay = (): void => setActiveDayIndex(null)

  return (
    <div className="mx-auto w-max min-w-[610px]">
      <div className="text-muted-foreground mb-1 grid grid-cols-[24px_repeat(53,10px)] gap-x-1 text-[11px]">
        <span />
        {calendar.monthLabels.map((label) => (
          <span
            key={`${label.date.getFullYear()}-${label.date.getMonth()}`}
            className="whitespace-nowrap"
            style={{ gridColumnStart: label.weekIndex + 2 }}
          >
            {label.date.toLocaleDateString(undefined, { month: 'short' })}
          </span>
        ))}
      </div>

      <div className="flex gap-2">
        <div className="text-muted-foreground grid grid-rows-[repeat(7,10px)] gap-1 text-[10px] leading-[10px]">
          {weekdayLabels.map((entry) => (
            <span key={entry.day}>{entry.label}</span>
          ))}
        </div>
        <Tooltip open={activeDay !== null}>
          <div className="relative">
            <div
              className="grid auto-cols-[10px] grid-flow-col grid-rows-[repeat(7,10px)] gap-1"
              role="grid"
              aria-label={formatGridLabel(metric)}
              onPointerMove={handlePointerMove}
              onPointerLeave={clearActiveDay}
            >
              {cells}
            </div>
            <TooltipTrigger
              render={
                <span
                  aria-hidden
                  className="pointer-events-none absolute size-2.5"
                  style={activeTriggerStyle}
                />
              }
            />
          </div>
          {activeDay ? (
            <TooltipContent side="top" sideOffset={4}>
              {formatCellLabel(activeDay, metric)}
            </TooltipContent>
          ) : null}
        </Tooltip>
      </div>

      <div className="text-muted-foreground mt-3 flex items-center justify-center gap-2 text-[11px]">
        <span>{translate('auto.components.contribution.heatmap.less', 'Less')}</span>
        <div className="flex items-center gap-1" aria-hidden>
          {INTENSITY_LEVELS.map((intensity) => (
            <span key={intensity} className={cn('size-2.5 border', INTENSITY_CLASS[intensity])} />
          ))}
        </div>
        <span>{translate('auto.components.contribution.heatmap.more', 'More')}</span>
      </div>
    </div>
  )
}

function contributionIndexFromTarget(target: EventTarget): number | null {
  if (!(target instanceof HTMLElement)) {
    return null
  }
  const value = target.closest<HTMLElement>('[data-contribution-index]')?.dataset.contributionIndex
  if (value === undefined) {
    return null
  }
  const index = Number(value)
  return Number.isSafeInteger(index) ? index : null
}

function formatGridLabel(metric: ContributionDisplayMetric): string {
  switch (metric) {
    case 'tokens':
      return translate(
        'auto.components.contribution.heatmap.tokensLabel',
        'Daily token usage over the past year'
      )
    case 'value':
      return translate(
        'auto.components.contribution.heatmap.valueLabel',
        'Daily estimated API value over the past year'
      )
  }
}

function formatCellLabel(day: ContributionCalendarDay, metric: ContributionDisplayMetric): string {
  const date = day.date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
  switch (metric) {
    case 'tokens':
      return translate(
        'auto.components.contribution.heatmap.tokenCell',
        '{{value0}}: {{value1}} tokens',
        {
          value0: date,
          value1: day.value.toLocaleString()
        }
      )
    case 'value':
      return translate(
        'auto.components.contribution.heatmap.valueCell',
        '{{value0}}: {{value1}} estimated API value',
        { value0: date, value1: formatCurrency(day.value) }
      )
  }
}

function formatCurrency(value: number): string {
  return Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(value)
}

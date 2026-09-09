// Why: desktop and mobile bound usage reads to the same calendar-day windows,
// so the range union and its day math live on the wire contract instead of
// being re-derived per client and drifting by a day at the boundary.

export const BOUNDED_STATS_USAGE_RANGES = ['7d', '30d', '90d'] as const
export const STATS_USAGE_RANGES = [...BOUNDED_STATS_USAGE_RANGES, 'all'] as const

export type StatsUsageBoundedRange = (typeof BOUNDED_STATS_USAGE_RANGES)[number]
export type StatsUsageRange = (typeof STATS_USAGE_RANGES)[number]

export function isStatsUsageBoundedRange(value: unknown): value is StatsUsageBoundedRange {
  return typeof value === 'string' && BOUNDED_STATS_USAGE_RANGES.some((range) => range === value)
}

export function isStatsUsageRange(value: unknown): value is StatsUsageRange {
  return typeof value === 'string' && STATS_USAGE_RANGES.some((range) => range === value)
}

export function statsUsageRangeDays(range: StatsUsageBoundedRange): number {
  switch (range) {
    case '7d':
      return 7
    case '30d':
      return 30
    case '90d':
      return 90
  }
}

export function statsUsageRangeStartDay(range: StatsUsageRange, now: Date): string | null {
  if (range === 'all') {
    return null
  }
  const cutoff = new Date(now)
  cutoff.setHours(0, 0, 0, 0)
  cutoff.setDate(cutoff.getDate() - (statsUsageRangeDays(range) - 1))
  return localUsageDayKey(cutoff)
}

export function dayIsInStatsUsageRange(day: string, range: StatsUsageRange, now: Date): boolean {
  const startDay = statsUsageRangeStartDay(range, now)
  return startDay === null || day >= startDay
}

// Why: usage days are local calendar keys, so a UTC-based format would shift a
// day for every host east or west of UTC.
export function localUsageDayKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

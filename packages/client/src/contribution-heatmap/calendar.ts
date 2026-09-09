export type ContributionMetric = 'activity' | 'tokens'

export type ContributionPoint = {
  day: string
  value: number
}

export type ContributionCalendarDay = ContributionPoint & {
  intensity: 0 | 1 | 2 | 3 | 4
  isFuture: boolean
  date: Date
}

export type ContributionCalendarWeek = {
  startDay: string
  days: ContributionCalendarDay[]
}

export type ContributionMonthLabel = {
  date: Date
  weekIndex: number
}

export type ContributionCalendar = {
  weeks: ContributionCalendarWeek[]
  monthLabels: ContributionMonthLabel[]
  maxValue: number
}

export type ContributionTotals = {
  today: number
  currentStreak: number
  longestStreak: number
  visibleTotal: number
}

const CALENDAR_WEEK_COUNT = 53
const DAYS_PER_WEEK = 7

export function buildContributionCalendar(
  points: readonly ContributionPoint[],
  anchorDate = new Date()
): ContributionCalendar {
  const valuesByDay = mergeContributionPoints(points)
  const anchor = startOfLocalDay(anchorDate)
  const currentWeekStart = addLocalDays(anchor, -anchor.getDay())
  const gridStart = addLocalDays(currentWeekStart, -(CALENDAR_WEEK_COUNT - 1) * DAYS_PER_WEEK)
  const firstVisibleDay = localCalendarDayKey(gridStart)
  const lastVisibleDay = localCalendarDayKey(anchor)
  let maxValue = 0
  for (const [day, value] of valuesByDay) {
    if (day >= firstVisibleDay && day <= lastVisibleDay) {
      maxValue = Math.max(maxValue, value)
    }
  }
  const weeks: ContributionCalendarWeek[] = []

  for (let weekIndex = 0; weekIndex < CALENDAR_WEEK_COUNT; weekIndex++) {
    const days: ContributionCalendarDay[] = []
    for (let weekday = 0; weekday < DAYS_PER_WEEK; weekday++) {
      const date = addLocalDays(gridStart, weekIndex * DAYS_PER_WEEK + weekday)
      const day = localCalendarDayKey(date)
      const value = Math.max(0, valuesByDay.get(day) ?? 0)
      days.push({
        day,
        value,
        intensity: contributionIntensity(value, maxValue),
        isFuture: date.getTime() > anchor.getTime(),
        date
      })
    }
    weeks.push({ startDay: days[0]?.day ?? localCalendarDayKey(gridStart), days })
  }

  return {
    weeks,
    monthLabels: buildMonthLabels(weeks),
    maxValue
  }
}

export function getContributionTotals(
  points: readonly ContributionPoint[],
  anchorDate = new Date()
): ContributionTotals {
  const valuesByDay = mergeContributionPoints(points)
  const anchor = startOfLocalDay(anchorDate)
  const today = valuesByDay.get(localCalendarDayKey(anchor)) ?? 0
  let currentStreak = 0
  let longestStreak = 0
  let runningStreak = 0
  let visibleTotal = 0

  for (let offset = 365; offset >= 0; offset--) {
    const value = valuesByDay.get(localCalendarDayKey(addLocalDays(anchor, -offset))) ?? 0
    visibleTotal += value
    if (value > 0) {
      runningStreak++
      longestStreak = Math.max(longestStreak, runningStreak)
    } else {
      runningStreak = 0
    }
  }

  const streakAnchor = today > 0 ? anchor : addLocalDays(anchor, -1)
  for (let offset = 0; offset <= 365; offset++) {
    const value = valuesByDay.get(localCalendarDayKey(addLocalDays(streakAnchor, -offset))) ?? 0
    if (value <= 0) {
      break
    }
    currentStreak++
  }

  return { today, currentStreak, longestStreak, visibleTotal }
}

function buildMonthLabels(weeks: ContributionCalendarWeek[]): ContributionMonthLabel[] {
  const labels: ContributionMonthLabel[] = []
  for (let weekIndex = 0; weekIndex < weeks.length; weekIndex++) {
    const firstOfMonth = weeks[weekIndex]?.days.find(
      (day) => day.date.getDate() === 1 && !day.isFuture
    )
    if (firstOfMonth) {
      labels.push({ date: firstOfMonth.date, weekIndex })
    }
  }
  if (labels[0]?.weekIndex !== 0) {
    const firstDay = weeks[0]?.days.find((day) => !day.isFuture)
    if (firstDay) {
      labels.unshift({ date: firstDay.date, weekIndex: 0 })
    }
  }
  return labels
}

function mergeContributionPoints(points: readonly ContributionPoint[]): Map<string, number> {
  const valuesByDay = new Map<string, number>()
  for (const point of points) {
    if (!Number.isFinite(point.value) || point.value <= 0) {
      continue
    }
    valuesByDay.set(point.day, (valuesByDay.get(point.day) ?? 0) + point.value)
  }
  return valuesByDay
}

function contributionIntensity(value: number, maxValue: number): 0 | 1 | 2 | 3 | 4 {
  if (value <= 0 || maxValue <= 0) {
    return 0
  }
  const scaled = Math.ceil((Math.log1p(value) / Math.log1p(maxValue)) * 4)
  if (scaled <= 1) {
    return 1
  }
  if (scaled === 2) {
    return 2
  }
  if (scaled === 3) {
    return 3
  }
  return 4
}

function startOfLocalDay(value: Date): Date {
  const date = new Date(value)
  date.setHours(0, 0, 0, 0)
  return date
}

function addLocalDays(value: Date, amount: number): Date {
  const date = new Date(value)
  date.setDate(date.getDate() + amount)
  return date
}

export function localCalendarDayKey(value: Date | number): string {
  const date = typeof value === 'number' ? new Date(value) : value
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

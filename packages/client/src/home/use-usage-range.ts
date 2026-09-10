import {
  isStatsUsageBoundedRange,
  type StatsUsageBoundedRange
} from '@agentstart/protocol/stats/range'
import { useState } from 'react'

const USAGE_RANGE_STORAGE_KEY = 'agentstart.home.usage-range.v1'

type UsageRangePreference = [StatsUsageBoundedRange, (range: StatsUsageBoundedRange) => void]

export function useUsageRangePreference(): UsageRangePreference {
  const [range, setRange] = useState<StatsUsageBoundedRange>(loadUsageRange)
  const selectRange = (nextRange: StatsUsageBoundedRange): void => {
    setRange(nextRange)
    try {
      window.localStorage.setItem(USAGE_RANGE_STORAGE_KEY, nextRange)
    } catch {
      // Why: storage can be unavailable; the in-memory range still works.
    }
  }
  return [range, selectRange]
}

function loadUsageRange(): StatsUsageBoundedRange {
  try {
    const stored = window.localStorage.getItem(USAGE_RANGE_STORAGE_KEY)
    return isStatsUsageBoundedRange(stored) ? stored : '30d'
  } catch {
    return '30d'
  }
}

import type { StatsSummaryResult } from '@yiru/protocol/stats/values'
import type { StatsSummary } from '@yiru/protocol/stats/values'
import type { StateCreator } from 'zustand'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'
import type { AppState } from '~renderer/store/types'

import { readStatsSummary } from './summary-reader'

export type StatsSlice = {
  statsSummary: StatsSummary | null
  fetchStatsSummary: (refreshUsage?: boolean) => Promise<void>
}

function isStatsSummaryAvailable(result: StatsSummaryResult): result is StatsSummary {
  return Object.keys(result).length > 0
}

export const createStatsSlice: StateCreator<AppState, [], [], StatsSlice> = (set, get) => ({
  statsSummary: null,

  fetchStatsSummary: async (refreshUsage = false) => {
    try {
      const summary = await readStatsSummary(getActiveRuntimeTarget(get().settings), {
        refreshUsage
      })
      // Why: the runtime models "stats unavailable" as an all-optional variant
      // rather than an error, so an empty payload must clear the panel instead
      // of being stored as a summary with undefined fields.
      set({ statsSummary: isStatsSummaryAvailable(summary) ? summary : null })
    } catch (err) {
      console.error('Failed to fetch stats summary:', err)
    }
  }
})

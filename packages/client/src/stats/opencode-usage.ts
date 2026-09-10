import type {
  OpenCodeUsageBreakdownRow,
  OpenCodeUsageDailyPoint,
  OpenCodeUsageRange,
  OpenCodeUsageScanState,
  OpenCodeUsageScope,
  OpenCodeUsageSessionRow,
  OpenCodeUsageSummary
} from '@agentstart/protocol/provider-usage/models'
import type { StateCreator } from 'zustand'
import { openCodeProviderUsageClient } from '~renderer/runtime/provider-usage-client'
import type { AppState } from '~renderer/store/types'

export type OpenCodeUsageSlice = {
  openCodeUsageScope: OpenCodeUsageScope
  openCodeUsageRange: OpenCodeUsageRange
  openCodeUsageScanState: OpenCodeUsageScanState | null
  openCodeUsageSnapshotReady: boolean
  openCodeUsageSummary: OpenCodeUsageSummary | null
  openCodeUsageDaily: OpenCodeUsageDailyPoint[]
  openCodeUsageModelBreakdown: OpenCodeUsageBreakdownRow[]
  openCodeUsageProjectBreakdown: OpenCodeUsageBreakdownRow[]
  openCodeUsageRecentSessions: OpenCodeUsageSessionRow[]
  setOpenCodeUsageEnabled: (enabled: boolean) => Promise<void>
  setOpenCodeUsageScope: (scope: OpenCodeUsageScope) => Promise<void>
  setOpenCodeUsageRange: (range: OpenCodeUsageRange) => Promise<void>
  fetchOpenCodeUsage: (opts?: { forceRefresh?: boolean }) => Promise<void>
  enableOpenCodeUsage: () => Promise<void>
  refreshOpenCodeUsage: () => Promise<void>
}

export const createOpenCodeUsageSlice: StateCreator<AppState, [], [], OpenCodeUsageSlice> = (
  set,
  get
) => ({
  openCodeUsageScope: 'agentstart',
  openCodeUsageRange: 'all',
  openCodeUsageScanState: null,
  openCodeUsageSnapshotReady: false,
  openCodeUsageSummary: null,
  openCodeUsageDaily: [],
  openCodeUsageModelBreakdown: [],
  openCodeUsageProjectBreakdown: [],
  openCodeUsageRecentSessions: [],

  setOpenCodeUsageEnabled: async (enabled) => {
    try {
      const nextScanState = await openCodeProviderUsageClient.setEnabled({
        enabled
      })
      set({
        openCodeUsageScanState: enabled
          ? {
              ...nextScanState,
              isScanning: true,
              lastScanCompletedAt: null,
              lastScanError: null
            }
          : nextScanState,
        openCodeUsageSnapshotReady: false,
        openCodeUsageSummary: null,
        openCodeUsageDaily: [],
        openCodeUsageModelBreakdown: [],
        openCodeUsageProjectBreakdown: [],
        openCodeUsageRecentSessions: []
      })
      if (enabled) {
        await get().fetchOpenCodeUsage({ forceRefresh: true })
      }
    } catch (error) {
      console.error('Failed to update OpenCode usage setting:', error)
    }
  },

  setOpenCodeUsageScope: async (scope) => {
    set({ openCodeUsageScope: scope })
    await get().fetchOpenCodeUsage()
  },

  setOpenCodeUsageRange: async (range) => {
    set({ openCodeUsageRange: range })
    await get().fetchOpenCodeUsage()
  },

  fetchOpenCodeUsage: async (opts) => {
    set({ openCodeUsageSnapshotReady: false })
    try {
      const scanState = await openCodeProviderUsageClient.getScanState()
      const currentScanState = get().openCodeUsageScanState
      const shouldPreserveLoadingState =
        opts?.forceRefresh === true &&
        currentScanState?.enabled === true &&
        get().openCodeUsageSummary === null
      set({
        openCodeUsageScanState: shouldPreserveLoadingState
          ? {
              ...scanState,
              isScanning: true,
              lastScanCompletedAt: null,
              lastScanError: null
            }
          : scanState
      })
      if (!scanState.enabled) {
        return
      }

      const { openCodeUsageScope, openCodeUsageRange } = get()
      const snapshot = await openCodeProviderUsageClient.getSnapshot({
        scope: openCodeUsageScope,
        range: openCodeUsageRange,
        limit: 10
      })
      const hasCachedSnapshot =
        snapshot.scanState.lastScanCompletedAt !== null || snapshot.scanState.hasAnyOpenCodeData

      if (hasCachedSnapshot) {
        set({
          openCodeUsageScanState:
            opts?.forceRefresh === true
              ? { ...snapshot.scanState, isScanning: true }
              : snapshot.scanState,
          openCodeUsageSnapshotReady: opts?.forceRefresh !== true,
          openCodeUsageSummary: snapshot.summary,
          openCodeUsageDaily: snapshot.daily,
          openCodeUsageModelBreakdown: snapshot.modelBreakdown,
          openCodeUsageProjectBreakdown: snapshot.projectBreakdown,
          openCodeUsageRecentSessions: snapshot.recentSessions
        })
        // Why: entering Home should restore persisted analytics without
        // turning navigation into a transcript scan. The refresh action owns
        // explicit rescans once a usable snapshot exists.
        if (opts?.forceRefresh !== true) {
          return
        }
      } else {
        set({
          openCodeUsageScanState: {
            ...scanState,
            isScanning: true,
            lastScanError: null
          }
        })
      }

      await openCodeProviderUsageClient.refresh({
        force: opts?.forceRefresh ?? false
      })
      const { openCodeUsageScope: refreshedScope, openCodeUsageRange: refreshedRange } = get()
      const refreshedSnapshot = await openCodeProviderUsageClient.getSnapshot({
        scope: refreshedScope,
        range: refreshedRange,
        limit: 10
      })

      set({
        openCodeUsageScanState: refreshedSnapshot.scanState,
        openCodeUsageSnapshotReady: refreshedSnapshot.scanState.lastScanError === null,
        openCodeUsageSummary: refreshedSnapshot.summary,
        openCodeUsageDaily: refreshedSnapshot.daily,
        openCodeUsageModelBreakdown: refreshedSnapshot.modelBreakdown,
        openCodeUsageProjectBreakdown: refreshedSnapshot.projectBreakdown,
        openCodeUsageRecentSessions: refreshedSnapshot.recentSessions
      })
    } catch (error) {
      set({ openCodeUsageSnapshotReady: false })
      console.error('Failed to fetch OpenCode usage:', error)
    }
  },

  enableOpenCodeUsage: async () => {
    await get().setOpenCodeUsageEnabled(true)
  },

  refreshOpenCodeUsage: async () => {
    await get().fetchOpenCodeUsage({ forceRefresh: true })
  }
})

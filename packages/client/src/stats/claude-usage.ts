import type {
  ClaudeUsageBreakdownRow,
  ClaudeUsageDailyPoint,
  ClaudeUsageRange,
  ClaudeUsageScanState,
  ClaudeUsageScope,
  ClaudeUsageSessionRow,
  ClaudeUsageSummary
} from '@agentstart/protocol/provider-usage/models'
import type { StateCreator } from 'zustand'
import { claudeProviderUsageClient } from '~renderer/runtime/provider-usage-client'
import type { AppState } from '~renderer/store/types'

export type ClaudeUsageSlice = {
  claudeUsageScope: ClaudeUsageScope
  claudeUsageRange: ClaudeUsageRange
  claudeUsageScanState: ClaudeUsageScanState | null
  claudeUsageSnapshotReady: boolean
  claudeUsageSummary: ClaudeUsageSummary | null
  claudeUsageDaily: ClaudeUsageDailyPoint[]
  claudeUsageModelBreakdown: ClaudeUsageBreakdownRow[]
  claudeUsageProjectBreakdown: ClaudeUsageBreakdownRow[]
  claudeUsageRecentSessions: ClaudeUsageSessionRow[]
  setClaudeUsageEnabled: (enabled: boolean) => Promise<void>
  setClaudeUsageScope: (scope: ClaudeUsageScope) => Promise<void>
  setClaudeUsageRange: (range: ClaudeUsageRange) => Promise<void>
  fetchClaudeUsage: (opts?: { forceRefresh?: boolean }) => Promise<void>
  enableClaudeUsage: () => Promise<void>
  refreshClaudeUsage: () => Promise<void>
}

export const createClaudeUsageSlice: StateCreator<AppState, [], [], ClaudeUsageSlice> = (
  set,
  get
) => ({
  claudeUsageScope: 'agentstart',
  claudeUsageRange: 'all',
  claudeUsageScanState: null,
  claudeUsageSnapshotReady: false,
  claudeUsageSummary: null,
  claudeUsageDaily: [],
  claudeUsageModelBreakdown: [],
  claudeUsageProjectBreakdown: [],
  claudeUsageRecentSessions: [],

  setClaudeUsageEnabled: async (enabled) => {
    try {
      const nextScanState = await claudeProviderUsageClient.setEnabled({
        enabled
      })
      set({
        // Why: every enable should look like a fresh scan cycle in the UI.
        // Reusing the last completed timestamp makes repeated toggles skip the
        // loading skeleton and briefly render an empty analytics pane.
        claudeUsageScanState: enabled
          ? {
              ...nextScanState,
              isScanning: true,
              lastScanCompletedAt: null,
              lastScanError: null
            }
          : nextScanState,
        claudeUsageSnapshotReady: false,
        claudeUsageSummary: null,
        claudeUsageDaily: [],
        claudeUsageModelBreakdown: [],
        claudeUsageProjectBreakdown: [],
        claudeUsageRecentSessions: []
      })
      if (enabled) {
        await get().fetchClaudeUsage({ forceRefresh: true })
      }
    } catch (error) {
      console.error('Failed to update Claude usage setting:', error)
    }
  },

  setClaudeUsageScope: async (scope) => {
    set({ claudeUsageScope: scope })
    await get().fetchClaudeUsage()
  },

  setClaudeUsageRange: async (range) => {
    set({ claudeUsageRange: range })
    await get().fetchClaudeUsage()
  },

  fetchClaudeUsage: async (opts) => {
    set({ claudeUsageSnapshotReady: false })
    try {
      const scanState = await claudeProviderUsageClient.getScanState()
      const currentScanState = get().claudeUsageScanState
      const shouldPreserveLoadingState =
        opts?.forceRefresh === true &&
        currentScanState?.enabled === true &&
        get().claudeUsageSummary === null
      set({
        claudeUsageScanState: shouldPreserveLoadingState
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

      const { claudeUsageScope, claudeUsageRange } = get()
      const snapshot = await claudeProviderUsageClient.getSnapshot({
        scope: claudeUsageScope,
        range: claudeUsageRange,
        limit: 10
      })
      const hasCachedSnapshot =
        snapshot.scanState.lastScanCompletedAt !== null || snapshot.scanState.hasAnyClaudeData

      if (hasCachedSnapshot) {
        set({
          claudeUsageScanState:
            opts?.forceRefresh === true
              ? { ...snapshot.scanState, isScanning: true }
              : snapshot.scanState,
          claudeUsageSnapshotReady: opts?.forceRefresh !== true,
          claudeUsageSummary: snapshot.summary,
          claudeUsageDaily: snapshot.daily,
          claudeUsageModelBreakdown: snapshot.modelBreakdown,
          claudeUsageProjectBreakdown: snapshot.projectBreakdown,
          claudeUsageRecentSessions: snapshot.recentSessions
        })
        // Why: entering Home should restore persisted analytics without
        // turning navigation into a transcript scan. The refresh action owns
        // explicit rescans once a usable snapshot exists.
        if (opts?.forceRefresh !== true) {
          return
        }
      } else {
        set({
          claudeUsageScanState: {
            ...scanState,
            isScanning: true,
            lastScanError: null
          }
        })
      }

      await claudeProviderUsageClient.refresh({
        force: opts?.forceRefresh ?? false
      })
      const { claudeUsageScope: refreshedScope, claudeUsageRange: refreshedRange } = get()
      const refreshedSnapshot = await claudeProviderUsageClient.getSnapshot({
        scope: refreshedScope,
        range: refreshedRange,
        limit: 10
      })

      set({
        claudeUsageScanState: refreshedSnapshot.scanState,
        claudeUsageSnapshotReady: refreshedSnapshot.scanState.lastScanError === null,
        claudeUsageSummary: refreshedSnapshot.summary,
        claudeUsageDaily: refreshedSnapshot.daily,
        claudeUsageModelBreakdown: refreshedSnapshot.modelBreakdown,
        claudeUsageProjectBreakdown: refreshedSnapshot.projectBreakdown,
        claudeUsageRecentSessions: refreshedSnapshot.recentSessions
      })
    } catch (error) {
      set({ claudeUsageSnapshotReady: false })
      console.error('Failed to fetch Claude usage:', error)
    }
  },

  enableClaudeUsage: async () => {
    await get().setClaudeUsageEnabled(true)
  },

  refreshClaudeUsage: async () => {
    await get().fetchClaudeUsage({ forceRefresh: true })
  }
})

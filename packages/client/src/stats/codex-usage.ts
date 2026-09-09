import type {
  CodexUsageBreakdownRow,
  CodexUsageDailyPoint,
  CodexUsageRange,
  CodexUsageScanState,
  CodexUsageScope,
  CodexUsageSessionRow,
  CodexUsageSummary
} from '@yiru/protocol/provider-usage/models'
import type { StateCreator } from 'zustand'
import { codexProviderUsageClient } from '~renderer/runtime/provider-usage-client'
import type { AppState } from '~renderer/store/types'

export type CodexUsageSlice = {
  codexUsageScope: CodexUsageScope
  codexUsageRange: CodexUsageRange
  codexUsageScanState: CodexUsageScanState | null
  codexUsageSnapshotReady: boolean
  codexUsageSummary: CodexUsageSummary | null
  codexUsageDaily: CodexUsageDailyPoint[]
  codexUsageModelBreakdown: CodexUsageBreakdownRow[]
  codexUsageProjectBreakdown: CodexUsageBreakdownRow[]
  codexUsageRecentSessions: CodexUsageSessionRow[]
  setCodexUsageEnabled: (enabled: boolean) => Promise<void>
  setCodexUsageScope: (scope: CodexUsageScope) => Promise<void>
  setCodexUsageRange: (range: CodexUsageRange) => Promise<void>
  fetchCodexUsage: (opts?: { forceRefresh?: boolean }) => Promise<void>
  enableCodexUsage: () => Promise<void>
  refreshCodexUsage: () => Promise<void>
}

export const createCodexUsageSlice: StateCreator<AppState, [], [], CodexUsageSlice> = (
  set,
  get
) => ({
  codexUsageScope: 'yiru',
  codexUsageRange: 'all',
  codexUsageScanState: null,
  codexUsageSnapshotReady: false,
  codexUsageSummary: null,
  codexUsageDaily: [],
  codexUsageModelBreakdown: [],
  codexUsageProjectBreakdown: [],
  codexUsageRecentSessions: [],

  setCodexUsageEnabled: async (enabled) => {
    try {
      const nextScanState = await codexProviderUsageClient.setEnabled({
        enabled
      })
      set({
        codexUsageScanState: enabled
          ? {
              ...nextScanState,
              isScanning: true,
              lastScanCompletedAt: null,
              lastScanError: null
            }
          : nextScanState,
        codexUsageSnapshotReady: false,
        codexUsageSummary: null,
        codexUsageDaily: [],
        codexUsageModelBreakdown: [],
        codexUsageProjectBreakdown: [],
        codexUsageRecentSessions: []
      })
      if (enabled) {
        await get().fetchCodexUsage({ forceRefresh: true })
      }
    } catch (error) {
      console.error('Failed to update Codex usage setting:', error)
    }
  },

  setCodexUsageScope: async (scope) => {
    set({ codexUsageScope: scope })
    await get().fetchCodexUsage()
  },

  setCodexUsageRange: async (range) => {
    set({ codexUsageRange: range })
    await get().fetchCodexUsage()
  },

  fetchCodexUsage: async (opts) => {
    set({ codexUsageSnapshotReady: false })
    try {
      const scanState = await codexProviderUsageClient.getScanState()
      const currentScanState = get().codexUsageScanState
      const shouldPreserveLoadingState =
        opts?.forceRefresh === true &&
        currentScanState?.enabled === true &&
        get().codexUsageSummary === null
      set({
        codexUsageScanState: shouldPreserveLoadingState
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

      const { codexUsageScope, codexUsageRange } = get()
      const snapshot = await codexProviderUsageClient.getSnapshot({
        scope: codexUsageScope,
        range: codexUsageRange,
        limit: 10
      })
      const hasCachedSnapshot =
        snapshot.scanState.lastScanCompletedAt !== null || snapshot.scanState.hasAnyCodexData

      if (hasCachedSnapshot) {
        set({
          codexUsageScanState:
            opts?.forceRefresh === true
              ? { ...snapshot.scanState, isScanning: true }
              : snapshot.scanState,
          codexUsageSnapshotReady: opts?.forceRefresh !== true,
          codexUsageSummary: snapshot.summary,
          codexUsageDaily: snapshot.daily,
          codexUsageModelBreakdown: snapshot.modelBreakdown,
          codexUsageProjectBreakdown: snapshot.projectBreakdown,
          codexUsageRecentSessions: snapshot.recentSessions
        })
        // Why: entering Home should restore persisted analytics without
        // turning navigation into a transcript scan. The refresh action owns
        // explicit rescans once a usable snapshot exists.
        if (opts?.forceRefresh !== true) {
          return
        }
      } else {
        set({
          codexUsageScanState: {
            ...scanState,
            isScanning: true,
            lastScanError: null
          }
        })
      }

      await codexProviderUsageClient.refresh({
        force: opts?.forceRefresh ?? false
      })
      const { codexUsageScope: refreshedScope, codexUsageRange: refreshedRange } = get()
      const refreshedSnapshot = await codexProviderUsageClient.getSnapshot({
        scope: refreshedScope,
        range: refreshedRange,
        limit: 10
      })

      set({
        codexUsageScanState: refreshedSnapshot.scanState,
        codexUsageSnapshotReady: refreshedSnapshot.scanState.lastScanError === null,
        codexUsageSummary: refreshedSnapshot.summary,
        codexUsageDaily: refreshedSnapshot.daily,
        codexUsageModelBreakdown: refreshedSnapshot.modelBreakdown,
        codexUsageProjectBreakdown: refreshedSnapshot.projectBreakdown,
        codexUsageRecentSessions: refreshedSnapshot.recentSessions
      })
    } catch (error) {
      set({ codexUsageSnapshotReady: false })
      console.error('Failed to fetch Codex usage:', error)
    }
  },

  enableCodexUsage: async () => {
    await get().setCodexUsageEnabled(true)
  },

  refreshCodexUsage: async () => {
    await get().fetchCodexUsage({ forceRefresh: true })
  }
})

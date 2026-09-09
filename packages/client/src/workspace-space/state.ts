import type { WorkspaceSpaceAnalysisValue as WorkspaceSpaceAnalysis } from '@yiru/protocol'
import type { StateCreator } from 'zustand'
import {
  analyzeWorkspaceSpace as analyzeRuntimeWorkspaceSpace,
  cancelWorkspaceSpaceScan as cancelRuntimeWorkspaceSpaceScan
} from '~renderer/runtime/workspace-space-client'
import type { AppState } from '~renderer/store/types'

import {
  removeDeletedWorktreesFromAnalysis,
  errorMessage,
  isWorkspaceSpaceScanCancelled
} from './analysis-state'

let inFlightScan: Promise<WorkspaceSpaceAnalysis> | null = null

export type WorkspaceSpaceSlice = {
  workspaceSpaceAnalysis: WorkspaceSpaceAnalysis | null
  workspaceSpaceScanError: string | null
  workspaceSpaceScanning: boolean
  cancelWorkspaceSpaceScan: () => Promise<boolean>
  refreshWorkspaceSpace: () => Promise<WorkspaceSpaceAnalysis>
  removeWorkspaceSpaceWorktrees: (worktreeIds: readonly string[]) => void
}

export const createWorkspaceSpaceSlice: StateCreator<AppState, [], [], WorkspaceSpaceSlice> = (
  set,
  get
) => ({
  workspaceSpaceAnalysis: null,
  workspaceSpaceScanError: null,
  workspaceSpaceScanning: false,
  cancelWorkspaceSpaceScan: async () => {
    const cancelled = await cancelRuntimeWorkspaceSpaceScan()
    if (cancelled) {
      get().recordFeatureInteraction?.('workspace-cleanup')
    }
    return cancelled
  },
  refreshWorkspaceSpace: async () => {
    if (inFlightScan) {
      return inFlightScan
    }
    get().recordFeatureInteraction?.('workspace-cleanup')
    set({
      workspaceSpaceScanning: true,

      workspaceSpaceScanError: null
    })
    // Why: the compact Resource Manager card and the full Space page share
    // one manual scan result; duplicate button presses should join the same IO.
    inFlightScan = analyzeRuntimeWorkspaceSpace()
      .then((result) => {
        if (!result.ok) {
          throw new Error('Workspace space scan cancelled')
        }
        const analysis = result.analysis
        set({
          workspaceSpaceAnalysis: analysis,
          workspaceSpaceScanning: false
        })
        return analysis
      })
      .catch((error: unknown) => {
        set({
          workspaceSpaceScanError: isWorkspaceSpaceScanCancelled(error)
            ? null
            : errorMessage(error),
          workspaceSpaceScanning: false
        })
        throw error
      })
      .finally(() => {
        inFlightScan = null
      })
    return inFlightScan
  },
  removeWorkspaceSpaceWorktrees: (worktreeIds) => {
    if (worktreeIds.length > 0) {
      get().recordFeatureInteraction?.('workspace-cleanup')
    }
    set((state) =>
      state.workspaceSpaceAnalysis
        ? {
            workspaceSpaceAnalysis: removeDeletedWorktreesFromAnalysis(
              state.workspaceSpaceAnalysis,
              worktreeIds
            )
          }
        : state
    )
  }
})

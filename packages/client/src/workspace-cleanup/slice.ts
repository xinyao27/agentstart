import type { WorkspaceCleanupCandidate } from '@yiru/protocol'
import {
  WORKSPACE_CLEANUP_CLASSIFIER_VERSION,
  applyWorkspaceCleanupPolicy,
  canSelectWorkspaceCleanupCandidate,
  shouldForceWorkspaceCleanupRemoval
} from '@yiru/protocol/workspace/cleanup-policy'
import type { StateCreator } from 'zustand'
import { mapWithConcurrency } from '~renderer/map-with-concurrency'
import {
  clearWorkspaceCleanupDismissals as clearRuntimeWorkspaceCleanupDismissals,
  dismissWorkspaceCleanupCandidates as dismissRuntimeWorkspaceCleanupCandidates
} from '~renderer/runtime/workspace-cleanup-client'
import type { AppState } from '~renderer/store/types'

import { applyDismissal } from './enrichment'
import { preflightWorkspaceCleanupCandidate } from './preflight'
import { invalidateWorkspaceCleanupScanProgress, scanWorkspaceCleanup } from './scan'
import type { WorkspaceCleanupFailure, WorkspaceCleanupSlice } from './types'

const WORKSPACE_CLEANUP_PREFLIGHT_CONCURRENCY = 4

export const createWorkspaceCleanupSlice: StateCreator<AppState, [], [], WorkspaceCleanupSlice> = (
  set,
  get
) => ({
  workspaceCleanupScan: null,
  workspaceCleanupProgress: null,
  workspaceCleanupLoading: false,
  workspaceCleanupError: null,
  workspaceCleanupDismissals: {},
  workspaceCleanupViewedCandidates: {},

  scanWorkspaceCleanup: (args) => scanWorkspaceCleanup(args, get, set),

  markWorkspaceCleanupCandidateViewed: (candidate) => {
    set((state) => ({
      workspaceCleanupViewedCandidates: {
        ...state.workspaceCleanupViewedCandidates,
        [candidate.worktreeId]: {
          viewedAt: Date.now(),
          fingerprint: candidate.fingerprint,
          wasSuggested: candidate.tier === 'ready' && canSelectWorkspaceCleanupCandidate(candidate)
        }
      }
    }))
  },

  dismissWorkspaceCleanupCandidates: async (candidates) => {
    const now = Date.now()
    const dismissals = candidates.map((candidate) => ({
      worktreeId: candidate.worktreeId,
      dismissedAt: now,
      fingerprint: candidate.fingerprint,
      classifierVersion: WORKSPACE_CLEANUP_CLASSIFIER_VERSION
    }))

    set((state) => {
      const nextDismissals = { ...state.workspaceCleanupDismissals }
      for (const dismissal of dismissals) {
        nextDismissals[dismissal.worktreeId] = dismissal
      }
      const nextScan = state.workspaceCleanupScan
        ? {
            ...state.workspaceCleanupScan,
            candidates: state.workspaceCleanupScan.candidates.map((candidate) =>
              applyDismissal(candidate, nextDismissals)
            )
          }
        : state.workspaceCleanupScan
      return {
        workspaceCleanupDismissals: nextDismissals,
        workspaceCleanupScan: nextScan
      }
    })

    await dismissRuntimeWorkspaceCleanupCandidates(dismissals)
  },

  resetWorkspaceCleanupDismissals: async () => {
    set((state) => ({
      workspaceCleanupDismissals: {},
      workspaceCleanupScan: state.workspaceCleanupScan
        ? {
            ...state.workspaceCleanupScan,
            candidates: state.workspaceCleanupScan.candidates.map((candidate) =>
              applyWorkspaceCleanupPolicy({
                ...candidate,
                blockers: candidate.blockers.filter((blocker) => blocker !== 'dismissed')
              })
            )
          }
        : state.workspaceCleanupScan
    }))
    await clearRuntimeWorkspaceCleanupDismissals()
  },

  removeWorkspaceCleanupCandidates: async (worktreeIds, options) => {
    const removedIds: string[] = []
    const failures: WorkspaceCleanupFailure[] = []
    const approvedCandidatesByWorktreeId = new Map(
      (options?.approvedCandidates ?? []).map((candidate) => [candidate.worktreeId, candidate])
    )

    const preflights = await mapWithConcurrency(
      worktreeIds,
      WORKSPACE_CLEANUP_PREFLIGHT_CONCURRENCY,
      (worktreeId) =>
        preflightWorkspaceCleanupCandidate(
          worktreeId,
          get,
          approvedCandidatesByWorktreeId.get(worktreeId)
        )
    )
    const candidatesToRemove: WorkspaceCleanupCandidate[] = []

    for (const preflight of preflights) {
      if (!preflight.ok) {
        failures.push(preflight.failure)
        continue
      }
      candidatesToRemove.push(preflight.candidate)
    }

    // Why: nested workspaces can belong to different repos; parent removal must
    // not race child cleanup hooks, PTY teardown, or metadata deletion.
    for (const candidate of [...candidatesToRemove].sort((a, b) => b.path.length - a.path.length)) {
      const result = await get().removeWorktree(
        candidate.worktreeId,
        shouldForceWorkspaceCleanupRemoval(candidate),
        // Why: cleanup reports outcomes in its own summary toasts; per-row
        // preserved-branch warnings would stack one toast per removed row.
        { suppressPreservedBranchToast: true }
      )
      if (result.ok) {
        removedIds.push(candidate.worktreeId)
      } else {
        failures.push({
          worktreeId: candidate.worktreeId,
          displayName: candidate.displayName,
          message: result.error
        })
      }
    }

    if (removedIds.length > 0) {
      invalidateWorkspaceCleanupScanProgress()
      const removedIdSet = new Set(removedIds)
      set((state) => ({
        workspaceCleanupLoading: false,
        workspaceCleanupScan: state.workspaceCleanupScan
          ? {
              ...state.workspaceCleanupScan,
              candidates: state.workspaceCleanupScan.candidates.filter(
                (candidate) => !removedIdSet.has(candidate.worktreeId)
              )
            }
          : state.workspaceCleanupScan
      }))
    }

    return { removedIds, failures }
  }
})

import type {
  WorkspaceCleanupCandidate,
  WorkspaceCleanupDismissal,
  WorkspaceCleanupScanArgs,
  WorkspaceCleanupScanProgress,
  WorkspaceCleanupScanResult
} from '@agentstart/protocol'
import type { StateCreator } from 'zustand'
import type { AppState } from '~renderer/store/types'

export type WorkspaceCleanupFailure = {
  worktreeId: string
  displayName: string
  message: string
}

export type WorkspaceCleanupRemoveResult = {
  removedIds: string[]
  failures: WorkspaceCleanupFailure[]
}

export type WorkspaceCleanupRemoveOptions = {
  // Why: rows are removed long after the confirm click; the confirm-time
  // candidate records how much git risk the user actually approved.
  approvedCandidates?: readonly WorkspaceCleanupCandidate[]
}

type WorkspaceCleanupViewedCandidate = {
  viewedAt: number
  fingerprint: string
  wasSuggested: boolean
}

export type WorkspaceCleanupSlice = {
  workspaceCleanupScan: WorkspaceCleanupScanResult | null
  workspaceCleanupProgress: WorkspaceCleanupScanProgress | null
  workspaceCleanupLoading: boolean
  workspaceCleanupError: string | null
  workspaceCleanupDismissals: Record<string, WorkspaceCleanupDismissal>
  workspaceCleanupViewedCandidates: Record<string, WorkspaceCleanupViewedCandidate>
  scanWorkspaceCleanup: (args?: WorkspaceCleanupScanArgs) => Promise<WorkspaceCleanupScanResult>
  markWorkspaceCleanupCandidateViewed: (candidate: WorkspaceCleanupCandidate) => void
  dismissWorkspaceCleanupCandidates: (
    candidates: readonly WorkspaceCleanupCandidate[]
  ) => Promise<void>
  resetWorkspaceCleanupDismissals: () => Promise<void>
  removeWorkspaceCleanupCandidates: (
    worktreeIds: readonly string[],
    options?: WorkspaceCleanupRemoveOptions
  ) => Promise<WorkspaceCleanupRemoveResult>
}

export type EnrichOptions = {
  applyDismissals?: boolean
}

export type WorkspaceCleanupEnrichmentCacheEntry = {
  inputSignature: string
  localSignature: string
  candidate: WorkspaceCleanupCandidate
}

export type WorkspaceCleanupGetState = () => AppState
export type WorkspaceCleanupSetState = Parameters<
  StateCreator<AppState, [], [], WorkspaceCleanupSlice>
>[0]

import type {
  WorkspaceCleanupCandidate,
  WorkspaceCleanupScanArgs,
  WorkspaceCleanupScanProgress,
  WorkspaceCleanupScanResult
} from '@yiru/protocol'
import { scanWorkspaceCleanup as scanRuntimeWorkspaceCleanup } from '~renderer/runtime/workspace-cleanup-client'
import type { AppState } from '~renderer/store/types'

import {
  enrichWorkspaceCleanupCandidates,
  enrichWorkspaceCleanupCandidatesWithCache
} from './enrichment'
import { getInitialWorkspaceCleanupGitDeferrals } from './local-evidence'
import {
  mergeWorkspaceCleanupProgressCandidates,
  resetWorkspaceCleanupProgressCandidateIndex
} from './progress-merge'
import type {
  WorkspaceCleanupEnrichmentCacheEntry,
  WorkspaceCleanupGetState,
  WorkspaceCleanupSetState
} from './types'

let inFlightWorkspaceCleanupScan: {
  key: string
  promise: Promise<WorkspaceCleanupScanResult>
} | null = null
let latestWorkspaceCleanupScanToken = 0
let finalizedWorkspaceCleanupScanToken = 0
let workspaceCleanupProgressQueue: {
  scanToken: number
  promise: Promise<void>
} | null = null
let workspaceCleanupEnrichmentCache: {
  scanToken: number
  entries: Map<string, WorkspaceCleanupEnrichmentCacheEntry>
} | null = null

export async function scanWorkspaceCleanup(
  args: WorkspaceCleanupScanArgs | undefined,
  get: WorkspaceCleanupGetState,
  set: WorkspaceCleanupSetState
): Promise<WorkspaceCleanupScanResult> {
  if (args?.worktreeId !== undefined) {
    const scan = await scanRuntimeWorkspaceCleanup(args)
    const enriched = await enrichWorkspaceCleanupCandidates(scan.candidates, get(), {
      applyDismissals: false
    })
    return { ...scan, candidates: enriched }
  }

  const scanArgs = {
    ...args,
    skipGitWorktreeIds: [
      ...new Set([
        ...(args?.skipGitWorktreeIds ?? []),
        ...getInitialWorkspaceCleanupGitDeferrals(get())
      ])
    ]
  }
  const scanKey = getWorkspaceCleanupScanKey(scanArgs)

  if (inFlightWorkspaceCleanupScan?.key === scanKey) {
    set({ workspaceCleanupLoading: true, workspaceCleanupError: null })
    try {
      return await inFlightWorkspaceCleanupScan.promise
    } finally {
      if (!inFlightWorkspaceCleanupScan) {
        set({ workspaceCleanupLoading: false })
      }
    }
  }

  set({
    workspaceCleanupLoading: true,
    workspaceCleanupProgress: null,
    workspaceCleanupError: null
  })
  const scanToken = ++latestWorkspaceCleanupScanToken
  finalizedWorkspaceCleanupScanToken = 0
  workspaceCleanupProgressQueue = null
  workspaceCleanupEnrichmentCache = { scanToken, entries: new Map() }
  resetWorkspaceCleanupProgressCandidateIndex()
  const promise = (async () => {
    const scan = await scanRuntimeWorkspaceCleanup(scanArgs, (progress) => {
      enqueueWorkspaceCleanupProgress(progress, scanToken, get, set)
    })
    const enriched = await enrichWorkspaceCleanupCandidatesForScan(
      scan.candidates,
      get(),
      scanToken
    )
    const result = { ...scan, candidates: enriched }
    if (scanToken === latestWorkspaceCleanupScanToken) {
      finalizedWorkspaceCleanupScanToken = scanToken
      workspaceCleanupEnrichmentCache = null
      resetWorkspaceCleanupProgressCandidateIndex()
      set({
        workspaceCleanupScan: result,
        workspaceCleanupProgress: {
          scanId: get().workspaceCleanupProgress?.scanId ?? scanArgs.scanId ?? '',
          scannedAt: result.scannedAt,
          scannedWorktreeCount: result.candidates.length,
          totalWorktreeCount: result.candidates.length,
          candidates: result.candidates,
          errors: result.errors
        },
        workspaceCleanupLoading: false
      })
    }
    return result
  })()
  inFlightWorkspaceCleanupScan = { key: scanKey, promise }

  try {
    return await promise
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (scanToken === latestWorkspaceCleanupScanToken) {
      set({ workspaceCleanupError: message, workspaceCleanupLoading: false })
    }
    throw error
  } finally {
    if (inFlightWorkspaceCleanupScan?.promise === promise) {
      inFlightWorkspaceCleanupScan = null
    }
  }
}

function getWorkspaceCleanupScanKey(args: WorkspaceCleanupScanArgs): string {
  return JSON.stringify({
    skipGitWorktreeIds: [...new Set(args.skipGitWorktreeIds ?? [])].sort()
  })
}

export function invalidateWorkspaceCleanupScanProgress(): void {
  latestWorkspaceCleanupScanToken += 1
  finalizedWorkspaceCleanupScanToken = 0
  inFlightWorkspaceCleanupScan = null
  workspaceCleanupProgressQueue = null
  workspaceCleanupEnrichmentCache = null
  resetWorkspaceCleanupProgressCandidateIndex()
}

function enqueueWorkspaceCleanupProgress(
  progress: WorkspaceCleanupScanProgress,
  scanToken: number,
  getState: () => AppState,
  setState: (
    partial: Partial<AppState> | ((state: AppState) => Partial<AppState>),
    replace?: false
  ) => void
): void {
  if (
    scanToken !== latestWorkspaceCleanupScanToken ||
    scanToken === finalizedWorkspaceCleanupScanToken
  ) {
    return
  }
  const previous =
    workspaceCleanupProgressQueue?.scanToken === scanToken
      ? workspaceCleanupProgressQueue.promise
      : Promise.resolve()
  const promise = previous
    .catch(() => undefined)
    .then(() => applyWorkspaceCleanupProgress(progress, scanToken, getState, setState))
    .catch((error: unknown) => {
      console.error('Workspace cleanup progress update failed', error)
    })
  workspaceCleanupProgressQueue = { scanToken, promise }
}

async function applyWorkspaceCleanupProgress(
  progress: WorkspaceCleanupScanProgress,
  scanToken: number,
  getState: () => AppState,
  setState: (
    partial: Partial<AppState> | ((state: AppState) => Partial<AppState>),
    replace?: false
  ) => void
): Promise<void> {
  if (
    scanToken !== latestWorkspaceCleanupScanToken ||
    scanToken === finalizedWorkspaceCleanupScanToken
  ) {
    return
  }
  const state = getState()
  const previousCandidates =
    progress.candidateMode === 'append' &&
    state.workspaceCleanupProgress?.scanId === progress.scanId
      ? state.workspaceCleanupProgress.candidates
      : []
  const enrichedProgressCandidates = await enrichWorkspaceCleanupCandidatesForScan(
    progress.candidates,
    state,
    scanToken
  )
  if (
    scanToken !== latestWorkspaceCleanupScanToken ||
    scanToken === finalizedWorkspaceCleanupScanToken
  ) {
    return
  }
  const candidates = mergeWorkspaceCleanupProgressCandidates({
    previousCandidates,
    nextCandidates: enrichedProgressCandidates,
    progress,
    scanToken
  })
  if (
    scanToken !== latestWorkspaceCleanupScanToken ||
    scanToken === finalizedWorkspaceCleanupScanToken
  ) {
    resetWorkspaceCleanupProgressCandidateIndex()
    return
  }
  setState((state) => {
    if (
      state.workspaceCleanupProgress?.scanId === progress.scanId &&
      state.workspaceCleanupProgress.scannedWorktreeCount > progress.scannedWorktreeCount
    ) {
      return {}
    }
    return {
      workspaceCleanupScan: {
        scannedAt: progress.scannedAt,
        candidates,
        errors: progress.errors
      },
      workspaceCleanupProgress: { ...progress, candidates }
    }
  })
}

async function enrichWorkspaceCleanupCandidatesForScan(
  candidates: readonly WorkspaceCleanupCandidate[],
  state: AppState,
  scanToken: number
): Promise<WorkspaceCleanupCandidate[]> {
  if (workspaceCleanupEnrichmentCache?.scanToken !== scanToken) {
    workspaceCleanupEnrichmentCache = { scanToken, entries: new Map() }
  }
  return enrichWorkspaceCleanupCandidatesWithCache(
    candidates,
    state,
    workspaceCleanupEnrichmentCache.entries
  )
}

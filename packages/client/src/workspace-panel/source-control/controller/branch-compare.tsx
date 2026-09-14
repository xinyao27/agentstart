import { useEffect } from 'react'
import { installWindowVisibilityInterval } from '~renderer/application-shell/window-visibility-interval'
import { useEventCallback } from '~renderer/react/use-event-callback'
import { getConnectionId } from '~renderer/runtime/connection-context'
import { getRuntimeGitBranchCompare } from '~renderer/runtime/git-client'
import { useAppStore } from '~renderer/store/state'
import { shouldClearBranchCompareForMissingBase } from '~renderer/workspace-panel/source-control/review/base-ref'
import {
  shouldRefreshBranchCompareForRemoteStatus,
  shouldRefreshBranchCompareForStatusHead
} from '~renderer/workspace-panel/source-control/review/compare-summary'

import { BRANCH_REFRESH_INTERVAL_MS } from '../panel-constants'
import type { SourceControlBulkActionsController } from './bulk-actions'

export function useSourceControlBranchCompare(scope: SourceControlBulkActionsController) {
  const {
    activeGitStatusHead,
    activeRepoSettings,
    activeWorktreeId,
    beginGitBranchCompareRequest,
    branchCompareInFlightRef,
    branchCompareRemoteStatusRef,
    branchCompareRerunRef,
    branchCompareRunPromiseRef,
    branchCompareStatusHeadRef,
    branchName,
    clearGitBranchCompare,
    compareBaseRef,
    isBranchVisible,
    isFolder,
    refreshBranchCompareRef,
    remoteStatus,
    setGitBranchCompareResult,
    worktreePath
  } = scope
  const runBranchCompare = useEventCallback(async () => {
    if (!activeWorktreeId || !worktreePath || !compareBaseRef || isFolder) {
      return
    }

    const requestKey = `${activeWorktreeId}:${compareBaseRef}:${Date.now()}`
    const existingSummary =
      useAppStore.getState().gitBranchCompareSummaryByWorktree[activeWorktreeId]

    // Why: only initial or base-changing requests should replace the current
    // result with a spinner; polling retries must not flicker loading/error.
    const baseRefChanged = existingSummary && existingSummary.baseRef !== compareBaseRef
    const shouldResetToLoading = !existingSummary || baseRefChanged
    if (shouldResetToLoading) {
      beginGitBranchCompareRequest(activeWorktreeId, requestKey, compareBaseRef)
    } else {
      beginGitBranchCompareRequest(activeWorktreeId, requestKey, compareBaseRef, {
        preserveExistingSummary: true
      })
    }

    try {
      const connectionId = getConnectionId(activeWorktreeId ?? null) ?? undefined
      const result = await getRuntimeGitBranchCompare(
        {
          // Why: route the branch compare by the repo OWNER host, not the focused runtime.
          settings: activeRepoSettings,
          worktreeId: activeWorktreeId,
          worktreePath,
          connectionId
        },
        compareBaseRef
      )
      setGitBranchCompareResult(activeWorktreeId, requestKey, result)
    } catch (error) {
      setGitBranchCompareResult(activeWorktreeId, requestKey, {
        summary: {
          baseRef: compareBaseRef,
          baseOid: null,
          compareRef: branchName,
          headOid: null,
          mergeBase: null,
          changedFiles: 0,
          status: 'error',
          errorMessage: error instanceof Error ? error.message : 'Branch compare failed'
        },
        entries: []
      })
    }
  })
  const refreshBranchCompare = useEventCallback(async () => {
    if (branchCompareInFlightRef.current) {
      branchCompareRerunRef.current = true
      return branchCompareRunPromiseRef.current ?? undefined
    }

    branchCompareInFlightRef.current = true
    const runPromise = (async (): Promise<void> => {
      // Why: event and timer refreshes share one Git subprocess chain, with
      // concurrent requests collapsed into one trailing refresh.
      try {
        await runBranchCompare()
      } finally {
        branchCompareInFlightRef.current = false
        if (branchCompareRerunRef.current) {
          branchCompareRerunRef.current = false
          await refreshBranchCompareRef.current()
        }
      }
    })()
    branchCompareRunPromiseRef.current = runPromise
    try {
      await runPromise
    } finally {
      if (branchCompareRunPromiseRef.current === runPromise) {
        branchCompareRunPromiseRef.current = null
      }
    }
  })
  useEffect(() => {
    refreshBranchCompareRef.current = refreshBranchCompare
  }, [refreshBranchCompare, refreshBranchCompareRef])
  useEffect(() => {
    if (!activeWorktreeId || !worktreePath || !isBranchVisible || !compareBaseRef || isFolder) {
      branchCompareStatusHeadRef.current = null
      return
    }

    const current = {
      baseRef: compareBaseRef,
      statusHead: activeGitStatusHead,
      worktreeId: activeWorktreeId
    }
    const previous = branchCompareStatusHeadRef.current
    branchCompareStatusHeadRef.current = current
    if (shouldRefreshBranchCompareForStatusHead(previous, current)) {
      void refreshBranchCompareRef.current()
    }
  }, [
    activeGitStatusHead,
    activeWorktreeId,
    compareBaseRef,
    isBranchVisible,
    isFolder,
    branchCompareStatusHeadRef,
    refreshBranchCompareRef,
    worktreePath
  ])
  useEffect(() => {
    if (!activeWorktreeId || !worktreePath || !isBranchVisible || !compareBaseRef || isFolder) {
      branchCompareRemoteStatusRef.current = null
      return
    }

    // Why: pushing a branch can move its remote-tracking base and ahead count
    // without changing local HEAD, so the HEAD-change effect alone misses it.
    const current = {
      ahead: remoteStatus?.ahead ?? null,
      baseRef: compareBaseRef,
      behind: remoteStatus?.behind ?? null,
      hasUpstream: remoteStatus?.hasUpstream ?? null,
      upstreamName: remoteStatus?.upstreamName ?? null,
      worktreeId: activeWorktreeId
    }
    const previous = branchCompareRemoteStatusRef.current
    branchCompareRemoteStatusRef.current = current
    if (shouldRefreshBranchCompareForRemoteStatus(previous, current)) {
      void refreshBranchCompareRef.current()
    }
  }, [
    activeWorktreeId,
    compareBaseRef,
    branchCompareRemoteStatusRef,
    isBranchVisible,
    isFolder,
    remoteStatus?.ahead,
    remoteStatus?.behind,
    remoteStatus?.hasUpstream,
    remoteStatus?.upstreamName,
    refreshBranchCompareRef,
    worktreePath
  ])
  useEffect(() => {
    if (!activeWorktreeId || !worktreePath || !isBranchVisible || !compareBaseRef || isFolder) {
      return
    }

    // Why: git-status HEAD changes refresh branch compare immediately. Keep a
    // visible-window fallback for base refs or remote updates that do not move HEAD.
    return installWindowVisibilityInterval({
      run: () => void refreshBranchCompareRef.current(),
      intervalMs: BRANCH_REFRESH_INTERVAL_MS
    })
  }, [
    activeWorktreeId,
    compareBaseRef,
    isBranchVisible,
    isFolder,
    refreshBranchCompareRef,
    worktreePath
  ])
  useEffect(() => {
    // Why: clear a stale summary only after upstream status confirms there is no
    // compare base; clearing earlier makes the committed section flicker.
    if (
      !activeWorktreeId ||
      !shouldClearBranchCompareForMissingBase({ isFolder, compareBaseRef, remoteStatus })
    ) {
      return
    }
    clearGitBranchCompare(activeWorktreeId)
  }, [activeWorktreeId, clearGitBranchCompare, compareBaseRef, isFolder, remoteStatus])
  return { ...scope, runBranchCompare, refreshBranchCompare }
}

export type SourceControlBranchCompareController = ReturnType<typeof useSourceControlBranchCompare>

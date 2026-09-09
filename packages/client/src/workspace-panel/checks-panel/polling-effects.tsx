import { useEffect } from 'react'

import type { useChecksPanelStatusEffectsState } from './status-effects'

export function useChecksPanelPollingEffects(context: useChecksPanelStatusEffectsState) {
  const {
    activeWorktreeId,
    activeWorktreePath,
    branch,
    conflictSummaryRefreshKeyRef,
    fallbackGitHubPRNumber,
    fetchPRForBranch,
    getHostedReviewCreationEligibility,
    gitStatusReadyForPanelContext,
    hasUncommittedChanges,
    hostedReviewCreationRequestKey,
    isFolder,
    isPanelVisible,
    linkedPR,
    pr,
    prCacheKey,
    remoteStatus,
    repo,
    setConflictDetailsRefreshing,
    setHostedReviewCreationSnapshot
  } = context

  useEffect(() => {
    if (!repo || isFolder || !branch) {
      setHostedReviewCreationSnapshot(null)
      return
    }
    if (!isPanelVisible || !gitStatusReadyForPanelContext) {
      return
    }
    let stale = false
    void getHostedReviewCreationEligibility({
      repoPath: repo.path,
      repoId: repo.id,
      ...(activeWorktreePath ? { worktreePath: activeWorktreePath } : {}),
      branch,
      base: repo.worktreeBaseRef ?? null,
      hasUncommittedChanges,
      hasUpstream: remoteStatus?.hasUpstream,
      ahead: remoteStatus?.ahead,
      behind: remoteStatus?.behind,
      linkedGitHubPR: linkedPR,
      fallbackGitHubPR: fallbackGitHubPRNumber
    })
      .then((result) => {
        if (!stale) {
          setHostedReviewCreationSnapshot({
            requestKey: hostedReviewCreationRequestKey,
            repoId: repo.id,
            worktreeId: activeWorktreeId,
            branch,
            data: result
          })
        }
      })
      .catch(() => {
        if (!stale) {
          setHostedReviewCreationSnapshot(null)
        }
      })
    return () => {
      stale = true
    }
  }, [
    activeWorktreeId,
    activeWorktreePath,
    branch,
    getHostedReviewCreationEligibility,
    gitStatusReadyForPanelContext,
    hasUncommittedChanges,
    hostedReviewCreationRequestKey,
    isFolder,
    isPanelVisible,
    linkedPR,
    fallbackGitHubPRNumber,
    remoteStatus?.ahead,
    remoteStatus?.behind,
    remoteStatus?.hasUpstream,
    repo,
    setHostedReviewCreationSnapshot
  ])

  useEffect(() => {
    if (
      !repo ||
      isFolder ||
      !branch ||
      !pr ||
      pr.mergeable !== 'CONFLICTING' ||
      !activeWorktreeId
    ) {
      conflictSummaryRefreshKeyRef.current = null
      setConflictDetailsRefreshing(false)
      return
    }

    const refreshKey = `${prCacheKey}::${branch}::${pr.number}`
    if (conflictSummaryRefreshKeyRef.current === refreshKey) {
      return
    }

    // Why: refresh a conflicting review once so stale summaries or missing file
    // lists are not presented as current.
    conflictSummaryRefreshKeyRef.current = refreshKey
    setConflictDetailsRefreshing(true)
    void fetchPRForBranch(repo.path, branch, {
      force: true,
      repoId: repo.id,
      worktreeId: activeWorktreeId ?? undefined,
      linkedPRNumber: linkedPR,
      fallbackPRNumber: fallbackGitHubPRNumber ?? pr.number
    }).finally(() => {
      // Why: cache updates can rerun this effect before resolution, so only the
      // current key may clear the spinner.
      if (conflictSummaryRefreshKeyRef.current === refreshKey) {
        setConflictDetailsRefreshing(false)
      }
    })
  }, [
    repo,
    isFolder,
    branch,
    pr,
    prCacheKey,
    activeWorktreeId,
    linkedPR,
    fallbackGitHubPRNumber,
    fetchPRForBranch,
    conflictSummaryRefreshKeyRef,
    setConflictDetailsRefreshing
  ])

  return { ...context }
}

export type useChecksPanelPollingEffectsState = ReturnType<typeof useChecksPanelPollingEffects>

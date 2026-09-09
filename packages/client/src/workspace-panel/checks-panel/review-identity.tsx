import type { PRInfo } from '@yiru/protocol/hosted-review/pull-request-types'
import { isFolderRepo } from '@yiru/protocol/project/repository'
import { useEffect, useState } from 'react'
import { useNow } from '~renderer/dashboard/use-now'
import { getGitHubPRCacheKey } from '~renderer/github/cache-key'
import {
  buildGitHubPRRefreshStateClearToken,
  getGitHubPRRefreshStateExpiryAt
} from '~renderer/github/state'
import { getHostedReviewCacheKey } from '~renderer/source-control/hosted-review-state/slice'
import { useAppStore } from '~renderer/store/state'

import { selectReviewCacheEntry } from '../review-cache-entry-selection'
import { hasAmbiguousGitHubHostedReviewForChecksPanel } from './ambiguous-github-review'
import { recordChecksPanelPRRefreshBreadcrumb } from './pr-refresh-breadcrumb'
import { type ChecksPanelReview, selectChecksPanelReview } from './review'
import type { useChecksPanelStateCoreState } from './state-core'

export function useChecksPanelReviewIdentity(context: useChecksPanelStateCoreState) {
  const {
    activeWorktree,
    activeWorktreeId,
    branch,
    clearTitleInputFocusTimer,
    conflictSummaryRefreshKeyRef,
    createPrInFlightRef,
    gitStatusSnapshotRetryTimerRef,
    isPanelVisible,
    panelContextKey,
    panelVisibleSinceRef,
    pollIntervalRef,
    prevChecksRef,
    refreshContextKeyRef,
    refreshInFlightRef,
    refreshRequestKeyRef,
    repo,
    setAgentComposerState,
    setChecks,
    setChecksLoading,
    setComments,
    setCommentsLoading,
    setConflictDetailsRefreshing,
    setCreatePrError,
    setEditingTitle,
    setEmptyRefreshing,
    setGitStatusRefreshNonce,
    setGitStatusSnapshot,
    setHostedReviewCreationSnapshot,
    setIsCreatingPr,
    setIsPublishingBranch,
    setIsRefreshing,
    setTitleDraft,
    setTitleSaving,
    settings
  } = context

  const [prevPanelContextKey, setPrevPanelContextKey] = useState(panelContextKey)
  const prRefreshStateNow = useNow(30_000)
  if (panelContextKey !== prevPanelContextKey) {
    setPrevPanelContextKey(panelContextKey)
    setEditingTitle(false)
    setTitleDraft('')
    setTitleSaving(false)
    setChecks([])
    setChecksLoading(false)
    setComments([])
    setCommentsLoading(false)
    setIsRefreshing(false)
    setEmptyRefreshing(false)
    setConflictDetailsRefreshing(false)
    setIsCreatingPr(false)
    setCreatePrError(null)
    setIsPublishingBranch(false)
    setAgentComposerState(null)
    setHostedReviewCreationSnapshot(null)
    setGitStatusSnapshot(null)
    setGitStatusRefreshNonce((value) => value + 1)
  }

  useEffect(() => {
    clearTitleInputFocusTimer()
    createPrInFlightRef.current = null
    pollIntervalRef.current = 30_000
    prevChecksRef.current = ''
    conflictSummaryRefreshKeyRef.current = null
    refreshInFlightRef.current = false
    refreshRequestKeyRef.current = null
    if (gitStatusSnapshotRetryTimerRef.current) {
      clearTimeout(gitStatusSnapshotRetryTimerRef.current)
      gitStatusSnapshotRetryTimerRef.current = null
    }
  }, [
    clearTitleInputFocusTimer,
    conflictSummaryRefreshKeyRef,
    createPrInFlightRef,
    gitStatusSnapshotRetryTimerRef,
    panelContextKey,
    pollIntervalRef,
    prevChecksRef,
    refreshInFlightRef,
    refreshRequestKeyRef
  ])

  // Find active worktree and repo
  const isFolder = repo ? isFolderRepo(repo) : false
  const prCacheKey =
    repo && branch
      ? getGitHubPRCacheKey(repo.path, repo.id, branch, settings, repo.executionHostId, true)
      : ''
  const hostedReviewCacheKey =
    repo && branch
      ? getHostedReviewCacheKey(repo.path, branch, settings, repo.id, repo.executionHostId, true)
      : ''
  const refreshContextKey = `${activeWorktreeId ?? ''}::${prCacheKey}::${branch}`
  useEffect(() => {
    refreshContextKeyRef.current = refreshContextKey
    refreshRequestKeyRef.current = null
  }, [refreshContextKey, refreshContextKeyRef, refreshRequestKeyRef])
  // Why: background PR refreshes replace the cache map; Checks only renders
  // the entry for the active repo and branch.
  const prCacheEntry = useAppStore((s) => selectReviewCacheEntry(s.prCache, prCacheKey || null))
  const pr: PRInfo | null = prCacheEntry?.data ?? null
  const prCachedHasPR = prCacheEntry ? prCacheEntry.data !== null : null
  const hostedReview = useAppStore((s) =>
    hostedReviewCacheKey ? (s.hostedReviewCache[hostedReviewCacheKey]?.data ?? null) : null
  )
  const hasAmbiguousGitHubHostedReview = hasAmbiguousGitHubHostedReviewForChecksPanel({
    hostedReview,
    prCacheEntry,
    prCacheKey
  })
  // Why: branch lookup is lossy for fork or deleted-head reviews, so prefer a
  // known review number from metadata or the visible cache.
  const linkedPR = activeWorktree?.linkedPR ?? null
  const fallbackGitHubPRNumber = linkedPR == null ? (pr?.number ?? null) : null
  const activeReview: ChecksPanelReview | null = selectChecksPanelReview({
    hostedReview,
    pr
  })
  const activeConflictReview = activeReview?.mergeable === 'CONFLICTING' ? activeReview : null
  const prRefreshState = useAppStore((s) =>
    prCacheKey ? s.getEffectiveGitHubPRRefreshState(prCacheKey, prRefreshStateNow) : undefined
  )
  const rawPRRefreshState = useAppStore((s) =>
    prCacheKey ? s.prRefreshStates[prCacheKey] : undefined
  )
  const prNumber = pr?.number ?? null

  useEffect(() => {
    const expiryAt = getGitHubPRRefreshStateExpiryAt(rawPRRefreshState)
    if (!prCacheKey || expiryAt === null) {
      return
    }
    const timeout = window.setTimeout(
      () => {
        const storeState = useAppStore.getState()
        const rawState = storeState.prRefreshStates[prCacheKey]
        const token = buildGitHubPRRefreshStateClearToken(
          rawState,
          storeState.prRefreshSequences,
          prCacheKey
        )
        if (!token) {
          return
        }
        // Why: time alone does not publish Zustand updates; this timeout clears
        // abandoned active refresh UI without treating expiry as no-PR evidence.
        recordChecksPanelPRRefreshBreadcrumb({
          event: 'stale_cleared',
          provider: 'github',
          repoId: repo?.id,
          worktreeId: activeWorktreeId,
          branch,
          prCacheKey,
          prNumber,
          prState: pr?.state,
          prChecksStatus: pr?.checksStatus,
          refreshState: rawState
        })
        storeState.expireGitHubPRRefreshState(prCacheKey, token)
      },
      Math.max(0, expiryAt - Date.now() + 1)
    )
    return () => window.clearTimeout(timeout)
  }, [
    activeWorktreeId,
    branch,
    pr?.checksStatus,
    pr?.state,
    prCacheKey,
    prNumber,
    rawPRRefreshState,
    repo?.id
  ])

  useEffect(() => {
    if (!isPanelVisible) {
      panelVisibleSinceRef.current = null
      return
    }
    panelVisibleSinceRef.current = Date.now()
  }, [isPanelVisible, panelContextKey, panelVisibleSinceRef])

  return {
    ...context,
    prevPanelContextKey,
    setPrevPanelContextKey,
    prRefreshStateNow,
    isFolder,
    prCacheKey,
    hostedReviewCacheKey,
    refreshContextKey,
    prCacheEntry,
    pr,
    prCachedHasPR,
    hostedReview,
    hasAmbiguousGitHubHostedReview,
    linkedPR,
    fallbackGitHubPRNumber,
    activeReview,
    activeConflictReview,
    prRefreshState,
    rawPRRefreshState,
    prNumber
  }
}

export type useChecksPanelReviewIdentityState = ReturnType<typeof useChecksPanelReviewIdentity>

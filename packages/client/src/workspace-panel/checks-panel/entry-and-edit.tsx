import React, { useEffect, useRef } from 'react'
import { useEventCallback } from '~renderer/react/use-event-callback'
import { runtimeCallDestination } from '~renderer/runtime/github-runtime-destination'
import { openGitHubTarget } from '~renderer/runtime/github-target'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'
import { refreshHostedReviewCard } from '~renderer/source-control/hosted-review-state/slice'
import { useAppStore } from '~renderer/store/state'

import { ENTRY_REFRESH_GRACE_MS, shouldEntryRefresh } from '../checks-entry-refresh'
import type { useChecksPanelRefreshActionState } from './refresh-action'

export function useChecksPanelEntryAndEdit(context: useChecksPanelRefreshActionState) {
  const {
    activeReview,
    activeWorktreeId,
    branch,
    checksFetchedAt,
    clearTitleInputFocusTimer,
    commentsFetchedAt,
    enqueueGitHubPRRefresh,
    fallbackGitHubPRNumber,
    fetchChecks,
    fetchComments,
    fetchHostedReviewForBranch,
    fetchPRForBranch,
    isFolder,
    isPanelVisible,
    linkedPR,
    mountedRef,
    pollIntervalRef,
    pr,
    prCacheKey,
    prFetchedAt,
    prNumber,
    prevChecksRef,
    repo,
    setEditingTitle,
    setTitleDraft,
    setTitleSaving,
    titleDraft,
    titleInputFocusTimerRef,
    titleInputRef
  } = context

  const handleEntryRefresh = useEventCallback(
    (options: { refreshChecks: boolean; refreshComments: boolean }) => {
      if (!repo || !branch || !activeWorktreeId) {
        return
      }
      // Why: automatic tab entry must retain coordinator rate limits and only
      // force detail panes already proven stale.
      enqueueGitHubPRRefresh(activeWorktreeId, 'active', 80)
      if (options.refreshChecks) {
        void fetchChecks({ force: true })
      }
      if (options.refreshComments) {
        void fetchComments({ force: true })
      }
    }
  )

  // Why: entry refresh catches external review changes before cache expiry, while
  // the grace window suppresses duplicate fetches from rapid visibility changes.
  const entryKey =
    isPanelVisible && repo && !isFolder && branch ? `${activeWorktreeId ?? ''}::${prCacheKey}` : ''
  const lastEntryKeyRef = useRef<string>('')
  useEffect(() => {
    if (!entryKey) {
      // Why: clearing on hide makes reopening the same review re-evaluate freshness;
      // comparing keys alone cannot detect that transition.
      lastEntryKeyRef.current = ''
      return
    }
    if (lastEntryKeyRef.current === entryKey) {
      return
    }
    lastEntryKeyRef.current = entryKey

    const now = Date.now()
    const stale = shouldEntryRefresh({
      prFetchedAt,
      checksFetchedAt,
      commentsFetchedAt,
      prNumber,
      now,
      graceMs: ENTRY_REFRESH_GRACE_MS
    })
    if (!stale) {
      return
    }
    const cutoff = now - ENTRY_REFRESH_GRACE_MS
    const refreshChecks =
      prNumber !== null && (checksFetchedAt === undefined || checksFetchedAt < cutoff)
    const refreshComments =
      prNumber !== null && (commentsFetchedAt === undefined || commentsFetchedAt < cutoff)

    // Reset polling attention state so the forced fetch's signature establishes
    // a fresh baseline rather than colliding with the previous PR's backoff.
    pollIntervalRef.current = 30_000
    prevChecksRef.current = ''
    handleEntryRefresh({ refreshChecks, refreshComments })
  }, [
    entryKey,
    prFetchedAt,
    checksFetchedAt,
    commentsFetchedAt,
    prNumber,
    handleEntryRefresh,
    pollIntervalRef,
    prevChecksRef
  ])

  const refreshHostedReviewAfterMutation = async () => {
    if (!repo || !branch) {
      return
    }
    const refreshedPR = await fetchPRForBranch(repo.path, branch, {
      force: true,
      repoId: repo.id,
      worktreeId: activeWorktreeId ?? undefined,
      linkedPRNumber: linkedPR,
      fallbackPRNumber: fallbackGitHubPRNumber
    })
    await refreshHostedReviewCard(fetchHostedReviewForBranch, {
      repoPath: repo.path,
      repoId: repo.id,
      branch,
      linkedGitHubPR: linkedPR,
      fallbackGitHubPR: refreshedPR?.number ?? fallbackGitHubPRNumber
    })
  }

  const handleStartEdit = () => {
    if (!activeReview) {
      return
    }
    setTitleDraft(activeReview.title)
    setEditingTitle(true)
    clearTitleInputFocusTimer()
    titleInputFocusTimerRef.current = setTimeout(() => {
      titleInputFocusTimerRef.current = null
      titleInputRef.current?.focus()
    }, 0)
  }

  const handleCancelEdit = () => {
    clearTitleInputFocusTimer()
    setEditingTitle(false)
    setTitleDraft('')
  }

  const handleSaveTitle = async () => {
    const nextTitle = titleDraft.trim()
    if (!repo || !activeReview || !nextTitle || nextTitle === activeReview.title) {
      clearTitleInputFocusTimer()
      setEditingTitle(false)
      return
    }
    setTitleSaving(true)
    try {
      if (!pr) {
        return
      }
      const target = getActiveRuntimeTarget(useAppStore.getState().settings)
      const client = await openGitHubTarget()
      if (!client) {
        throw new Error('GitHub protocol capability is unavailable')
      }
      const ok = await client.updatePrTitle(
        {
          repo: repo.id,
          prNumber: pr.number,
          title: nextTitle,
          prRepo: pr.prRepo ?? undefined
        },
        { timeoutMs: 30_000, ...runtimeCallDestination(target) }
      )
      if (ok) {
        await refreshHostedReviewAfterMutation()
      }
    } finally {
      clearTitleInputFocusTimer()
      if (mountedRef.current) {
        setTitleSaving(false)
        setEditingTitle(false)
      }
    }
  }

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      void handleSaveTitle()
    } else if (e.key === 'Escape') {
      handleCancelEdit()
    }
  }

  return {
    ...context,
    handleEntryRefresh,
    entryKey,
    lastEntryKeyRef,
    refreshHostedReviewAfterMutation,
    handleStartEdit,
    handleCancelEdit,
    handleSaveTitle,
    handleTitleKeyDown
  }
}

export type useChecksPanelEntryAndEditState = ReturnType<typeof useChecksPanelEntryAndEdit>

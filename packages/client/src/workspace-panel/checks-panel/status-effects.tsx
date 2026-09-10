import { useEffect } from 'react'
import { getRuntimeGitStatus, getRuntimeGitUpstreamStatus } from '~renderer/runtime/git-client'

import { GIT_STATUS_FAILURE_RETRY_MS } from './controller-types'
import type { useChecksPanelGenerationFieldsState } from './generation-fields'
import {
  shouldClearChecksPanelGitStatusSnapshot,
  shouldCoalesceChecksPanelGitStatusSnapshotRefresh,
  shouldCommitChecksPanelGitStatusSnapshot
} from './git-status-snapshot'
import { resolveChecksPanelPRRefreshRequest } from './pr-refresh-request'

export function useChecksPanelStatusEffects(context: useChecksPanelGenerationFieldsState) {
  const {
    activeConnectionId,
    activeWorktree,
    activeWorktreeId,
    activeWorktreePath,
    activeWorktreePushTarget,
    agentComposerState,
    branch,
    enqueueGitHubPRRefresh,
    fallbackGitHubPRNumber,
    fetchHostedReviewForBranch,
    gitStatusInvalidation,
    gitStatusRefreshNonce,
    gitStatusSnapshotInFlightContextRef,
    gitStatusSnapshotRerunContextRef,
    gitStatusSnapshotRetryTimerRef,
    isFolder,
    isPanelVisible,
    linkedPR,
    ownerSettings,
    panelContextKey,
    panelContextKeyRef,
    panelVisibleSinceRef,
    prCachedHasPR,
    prFetchedAt,
    remoteStatusInvalidation,
    repo,
    setAgentComposerState,
    setGitStatusRefreshNonce,
    setGitStatusSnapshot,
    stateRequestKey,
    updateWorktreeGitIdentity
  } = context

  useEffect(() => {
    if (
      agentComposerState?.commentResolution &&
      agentComposerState.commentResolution.reviewContextKey !== stateRequestKey
    ) {
      setAgentComposerState(null)
    }
  }, [agentComposerState?.commentResolution, stateRequestKey, setAgentComposerState])

  useEffect(() => {
    if (isPanelVisible && repo && !isFolder && branch) {
      void fetchHostedReviewForBranch(repo.path, branch, {
        repoId: repo.id,
        linkedGitHubPR: linkedPR,
        fallbackGitHubPR: fallbackGitHubPRNumber,
        currentHeadOid: activeWorktree?.head ?? null,
        staleWhileRevalidate: true
      })
      if (activeWorktreeId) {
        const refreshRequest = resolveChecksPanelPRRefreshRequest({
          cachedHasPR: prCachedHasPR,
          cachedFetchedAt: prFetchedAt ?? null,
          panelVisibleSince: panelVisibleSinceRef.current
        })
        enqueueGitHubPRRefresh(activeWorktreeId, refreshRequest.reason, refreshRequest.priority)
      }
    }
  }, [
    activeWorktreeId,
    branch,
    enqueueGitHubPRRefresh,
    fallbackGitHubPRNumber,
    fetchHostedReviewForBranch,
    isFolder,
    isPanelVisible,
    activeWorktree?.head,
    linkedPR,
    prCachedHasPR,
    prFetchedAt,
    repo,
    panelVisibleSinceRef
  ])

  useEffect(() => {
    if (
      !repo ||
      isFolder ||
      !branch ||
      !isPanelVisible ||
      !activeWorktreeId ||
      !activeWorktreePath ||
      activeWorktree?.prunable === true
    ) {
      if (gitStatusSnapshotRetryTimerRef.current) {
        clearTimeout(gitStatusSnapshotRetryTimerRef.current)
        gitStatusSnapshotRetryTimerRef.current = null
      }
      // Why: hiding the panel stops new work, not erase same-context Create PR
      // eligibility that can still be retried.
      return
    }
    let stale = false
    const requestContextKey = panelContextKey
    const connectionId = activeConnectionId ?? undefined
    if (
      shouldCoalesceChecksPanelGitStatusSnapshotRefresh(
        gitStatusSnapshotInFlightContextRef.current,
        requestContextKey
      )
    ) {
      gitStatusSnapshotRerunContextRef.current = requestContextKey
      return () => {
        stale = true
      }
    }
    gitStatusSnapshotInFlightContextRef.current = requestContextKey
    // Why: global status maps are keyed only by worktree. Use their changes as
    // invalidation signals, then fetch a local snapshot for the active boundary.
    if (gitStatusSnapshotRetryTimerRef.current) {
      clearTimeout(gitStatusSnapshotRetryTimerRef.current)
      gitStatusSnapshotRetryTimerRef.current = null
    }
    setGitStatusSnapshot((snapshot) =>
      shouldClearChecksPanelGitStatusSnapshot(snapshot, requestContextKey) ? null : snapshot
    )
    const context = {
      settings: ownerSettings,
      worktreeId: activeWorktreeId,
      worktreePath: activeWorktreePath,
      connectionId
    }
    void (async () => {
      const status = await getRuntimeGitStatus(context)
      if (
        !stale &&
        shouldCommitChecksPanelGitStatusSnapshot(panelContextKeyRef.current, requestContextKey)
      ) {
        // Why: the Review view can be the only visible git surface; commit
        // branch identity before branch-scoped upstream refresh can fail.
        updateWorktreeGitIdentity(activeWorktreeId, {
          head: status.head,
          branch: status.branch ?? (status.head ? null : undefined)
        })
      }
      let freshRemoteStatus = status.upstreamStatus
      if (activeWorktreePushTarget) {
        freshRemoteStatus = await getRuntimeGitUpstreamStatus(context, activeWorktreePushTarget)
      } else if (
        !freshRemoteStatus ||
        (freshRemoteStatus.ahead > 0 &&
          freshRemoteStatus.behind > 0 &&
          freshRemoteStatus.behindCommitsArePatchEquivalent === undefined)
      ) {
        freshRemoteStatus = await getRuntimeGitUpstreamStatus(context)
      }
      return { status, remoteStatus: freshRemoteStatus }
    })()
      .then(({ status, remoteStatus }) => {
        if (
          !stale &&
          shouldCommitChecksPanelGitStatusSnapshot(panelContextKeyRef.current, requestContextKey)
        ) {
          setGitStatusSnapshot({
            contextKey: requestContextKey,
            hasUncommittedChanges: status.entries.length > 0,
            remoteStatus,
            gitIdentity: {
              head: status.head,
              branch: status.branch ?? (status.head ? null : undefined)
            }
          })
        }
      })
      .catch((error) => {
        console.warn('[ChecksPanel] git status refresh before eligibility failed', error)
        if (!stale) {
          // Why: transient SSH/runtime flakes should not hide an already-valid
          // Create PR state for this same branch; retry while the panel stays visible.
          setGitStatusSnapshot((snapshot) =>
            shouldClearChecksPanelGitStatusSnapshot(snapshot, requestContextKey) ? null : snapshot
          )
          gitStatusSnapshotRetryTimerRef.current = setTimeout(() => {
            gitStatusSnapshotRetryTimerRef.current = null
            if (
              shouldCommitChecksPanelGitStatusSnapshot(
                panelContextKeyRef.current,
                requestContextKey
              )
            ) {
              setGitStatusRefreshNonce((value) => value + 1)
            }
          }, GIT_STATUS_FAILURE_RETRY_MS)
        }
      })
      .finally(() => {
        if (gitStatusSnapshotInFlightContextRef.current === requestContextKey) {
          gitStatusSnapshotInFlightContextRef.current = null
        }
        if (gitStatusSnapshotRerunContextRef.current === requestContextKey) {
          gitStatusSnapshotRerunContextRef.current = null
          if (
            shouldCommitChecksPanelGitStatusSnapshot(panelContextKeyRef.current, requestContextKey)
          ) {
            setGitStatusRefreshNonce((value) => value + 1)
          }
        }
      })
    return () => {
      stale = true
      if (gitStatusSnapshotRetryTimerRef.current) {
        clearTimeout(gitStatusSnapshotRetryTimerRef.current)
        gitStatusSnapshotRetryTimerRef.current = null
      }
    }
  }, [
    activeWorktreePushTarget,
    activeWorktreeId,
    activeWorktreePath,
    activeWorktree?.prunable,
    activeConnectionId,
    branch,
    gitStatusInvalidation,
    gitStatusRefreshNonce,
    isFolder,
    isPanelVisible,
    ownerSettings,
    panelContextKey,
    repo,
    remoteStatusInvalidation,
    updateWorktreeGitIdentity,
    setGitStatusSnapshot,
    setGitStatusRefreshNonce,
    gitStatusSnapshotInFlightContextRef,
    gitStatusSnapshotRetryTimerRef,
    gitStatusSnapshotRerunContextRef,
    panelContextKeyRef
  ])

  return { ...context }
}

export type useChecksPanelStatusEffectsState = ReturnType<typeof useChecksPanelStatusEffects>

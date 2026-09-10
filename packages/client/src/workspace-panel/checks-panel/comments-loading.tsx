import type { PRInfo } from '@agentstart/protocol/hosted-review/pull-request-types'
import type { PRCheckDetail } from '@agentstart/protocol/hosted-review/review-types'
import { useEffect } from 'react'
import { useEventCallback } from '~renderer/react/use-event-callback'
import { subscribeGitHubWorkItemMutations } from '~renderer/runtime/github-events-client'

import { checksPanelAsyncResultKey } from './async-result-key'
import type { useChecksPanelChecksLoadingState } from './checks-loading'

export function useChecksPanelCommentsLoading(context: useChecksPanelChecksLoadingState) {
  const {
    branch,
    fetchPRCheckDetails,
    fetchPRComments,
    isCurrentAsyncResult,
    isPanelVisible,
    pr,
    prCacheKey,
    prNumber,
    repo,
    setComments,
    setCommentsLoading
  } = context

  const fetchComments = useEventCallback(
    async ({
      force = false,
      prNumberOverride,
      prRepoOverride
    }: {
      force?: boolean
      prNumberOverride?: number | null
      prRepoOverride?: PRInfo['prRepo'] | null
    } = {}) => {
      const targetPRNumber = prNumberOverride ?? prNumber
      const targetPRRepo = prRepoOverride ?? pr?.prRepo
      if (!repo || !targetPRNumber) {
        return
      }
      setCommentsLoading(true)
      try {
        const requestKey = checksPanelAsyncResultKey(
          prCacheKey,
          branch,
          targetPRNumber,
          targetPRRepo,
          pr?.headSha
        )
        const result = await fetchPRComments(repo.path, targetPRNumber, {
          force,
          repoId: repo.id,
          prRepo: targetPRRepo
        })
        if (!isCurrentAsyncResult(requestKey)) {
          return
        }
        setComments(result)
      } catch (err) {
        if (
          !isCurrentAsyncResult(
            checksPanelAsyncResultKey(prCacheKey, branch, targetPRNumber, targetPRRepo, pr?.headSha)
          )
        ) {
          return
        }
        console.warn('Failed to fetch PR comments:', err)
        setComments([])
      } finally {
        if (
          isCurrentAsyncResult(
            checksPanelAsyncResultKey(prCacheKey, branch, targetPRNumber, targetPRRepo, pr?.headSha)
          )
        ) {
          setCommentsLoading(false)
        }
      }
    }
  )

  const handleLoadCheckDetails = (check: PRCheckDetail) => {
    if (!repo) {
      return Promise.resolve(null)
    }
    return fetchPRCheckDetails(
      repo.path,
      {
        checkRunId: check.checkRunId,
        workflowRunId: check.workflowRunId,
        checkName: check.name,
        url: check.url,
        prRepo: pr?.prRepo ?? null
      },
      { repoId: repo.id }
    )
  }

  useEffect(() => {
    if (!repo || !prNumber || !isPanelVisible) {
      setComments([])
      return
    }
    let cancelled = false
    const requestKey = checksPanelAsyncResultKey(
      prCacheKey,
      branch,
      prNumber,
      pr?.prRepo,
      pr?.headSha
    )
    setCommentsLoading(true)
    void fetchPRComments(repo.path, prNumber, { repoId: repo.id, prRepo: pr?.prRepo }).then(
      (result) => {
        if (!cancelled && isCurrentAsyncResult(requestKey)) {
          setComments(result)
          setCommentsLoading(false)
        }
      },
      () => {
        if (!cancelled && isCurrentAsyncResult(requestKey)) {
          setComments([])
          setCommentsLoading(false)
        }
      }
    )
    return () => {
      cancelled = true
    }
  }, [
    repo,
    prNumber,
    pr?.headSha,
    pr?.prRepo,
    prCacheKey,
    branch,
    isPanelVisible,
    fetchPRComments,
    isCurrentAsyncResult,
    setCommentsLoading,
    setComments
  ])

  useEffect(() => {
    if (!repo || !prNumber || !isPanelVisible) {
      return undefined
    }
    return subscribeGitHubWorkItemMutations(repo, (payload) => {
      const sameRepo =
        payload.repoId != null ? payload.repoId === repo.id : payload.repoPath === repo.path
      if (!sameRepo || payload.type !== 'pr' || payload.number !== prNumber) {
        return
      }
      void fetchComments({ force: true })
    })
  }, [fetchComments, isPanelVisible, prNumber, repo])

  return { ...context, fetchComments, handleLoadCheckDetails }
}

export type useChecksPanelCommentsLoadingState = ReturnType<typeof useChecksPanelCommentsLoading>

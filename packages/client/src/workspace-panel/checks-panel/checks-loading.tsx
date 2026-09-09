import { useEffect } from 'react'
import { useEventCallback } from '~renderer/react/use-event-callback'

import { installWindowVisibilityTimeoutPoller } from '../window-visibility-timeout-poller'
import { checksPanelAsyncResultKey } from './async-result-key'
import type { useChecksPanelPollingEffectsState } from './polling-effects'

export function useChecksPanelChecksLoading(context: useChecksPanelPollingEffectsState) {
  const {
    branch,
    fetchPRChecks,
    isCurrentAsyncResult,
    isPanelVisible,
    pollIntervalRef,
    pr,
    prCacheKey,
    prNumber,
    prevChecksRef,
    repo,
    setChecks,
    setChecksLoading
  } = context

  const fetchChecks = useEventCallback(
    async ({
      force = false,
      prNumberOverride
    }: { force?: boolean; prNumberOverride?: number | null } = {}) => {
      const targetPRNumber = prNumberOverride ?? prNumber
      if (!repo || !targetPRNumber) {
        return
      }
      setChecksLoading(true)
      try {
        const requestKey = checksPanelAsyncResultKey(
          prCacheKey,
          branch,
          targetPRNumber,
          pr?.prRepo,
          pr?.headSha
        )
        const result = await fetchPRChecks(
          repo.path,
          targetPRNumber,
          branch,
          pr?.headSha,
          pr?.prRepo,
          {
            force,
            repoId: repo.id
          }
        )
        if (!isCurrentAsyncResult(requestKey)) {
          return
        }
        setChecks(result)

        // Exponential backoff: if checks haven't changed, double the interval (cap 120s).
        // If they changed, reset to 30s.
        const signature = JSON.stringify(result.map((c) => `${c.name}:${c.status}:${c.conclusion}`))
        pollIntervalRef.current =
          signature === prevChecksRef.current
            ? Math.min(pollIntervalRef.current * 2, 120_000)
            : 30_000
        prevChecksRef.current = signature
      } catch (err) {
        if (
          !isCurrentAsyncResult(
            checksPanelAsyncResultKey(prCacheKey, branch, targetPRNumber, pr?.prRepo, pr?.headSha)
          )
        ) {
          return
        }
        console.warn('Failed to fetch PR checks:', err)
        setChecks([])
      } finally {
        if (
          isCurrentAsyncResult(
            checksPanelAsyncResultKey(prCacheKey, branch, targetPRNumber, pr?.prRepo, pr?.headSha)
          )
        ) {
          setChecksLoading(false)
        }
      }
    }
  )

  // Fetch checks on mount + poll with exponential backoff
  useEffect(() => {
    if (!prNumber || !isPanelVisible) {
      setChecks([])
      return
    }

    // Reset backoff state on PR change
    pollIntervalRef.current = 30_000
    prevChecksRef.current = ''
    // Why: PR check status is user-visible when the panel is open. Keep visible
    // unfocused windows fresh, but stop timers and API work while hidden.
    return installWindowVisibilityTimeoutPoller({
      run: () => fetchChecks(),
      getDelayMs: () => pollIntervalRef.current
    })
  }, [fetchChecks, isPanelVisible, prNumber, prevChecksRef, pollIntervalRef, setChecks])

  return { ...context, fetchChecks }
}

export type useChecksPanelChecksLoadingState = ReturnType<typeof useChecksPanelChecksLoading>

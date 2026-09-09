import type { PRInfo } from '@yiru/protocol/hosted-review/pull-request-types'
import type { GitHubPRMergeMethod } from '@yiru/protocol/hosted-review/pull-request-types'
import type { HostedReviewInfo } from '@yiru/protocol/hosted-review/types'
import type { Repo } from '@yiru/protocol/project/repository'
import { useState } from 'react'
import { toast } from 'sonner'
import type { GitHubPRAutoMergeAction } from '~renderer/github/pr-merge-state'
import { translate } from '~renderer/i18n/i18n'
import { useConfirmationDialog } from '~renderer/ui/confirmation-dialog'

import {
  mergeGitHubHostedReview,
  setGitHubHostedReviewAutoMerge,
  updateGitHubHostedReviewState
} from './hosted-review-github-actions'

export type HostedReviewActionInfo = Pick<
  HostedReviewInfo,
  'provider' | 'number' | 'state' | 'status' | 'mergeable'
> &
  Partial<
    Pick<
      HostedReviewInfo,
      | 'reviewDecision'
      | 'autoMergeEnabled'
      | 'autoMergeAllowed'
      | 'mergeQueueRequired'
      | 'mergeStateStatus'
    >
  >

export function useHostedReviewActions({
  review,
  githubPR,
  repo,
  defaultMergeMethod,
  autoMergeAction,
  onRefreshReview
}: {
  review: HostedReviewActionInfo
  githubPR?: PRInfo | null
  repo: Repo
  defaultMergeMethod: GitHubPRMergeMethod
  autoMergeAction: GitHubPRAutoMergeAction | null
  onRefreshReview: () => Promise<void>
}): {
  merging: boolean
  stateUpdating: 'open' | 'closed' | null
  actionError: string | null
  handleMerge: (method?: GitHubPRMergeMethod) => Promise<void>
  handleAutoMerge: () => Promise<void>
  handleCloseReview: () => Promise<void>
  handleReopenReview: () => Promise<void>
} {
  const confirm = useConfirmationDialog()
  const [merging, setMerging] = useState(false)
  const [stateUpdating, setStateUpdating] = useState<'open' | 'closed' | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const handleMerge = async (method: GitHubPRMergeMethod = defaultMergeMethod) => {
    setMerging(true)
    setActionError(null)
    try {
      const result = await mergeGitHubHostedReview({
        repo,
        prNumber: review.number,
        method,
        prRepo: githubPR?.prRepo ?? null
      })
      if (!result.ok) {
        setActionError(result.error)
      } else {
        await onRefreshReview()
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Merge failed')
    } finally {
      setMerging(false)
    }
  }

  const handleAutoMerge = async () => {
    if (!autoMergeAction) {
      return
    }
    const enabled = autoMergeAction.kind === 'enable'
    setMerging(true)
    setActionError(null)
    try {
      const result = await setGitHubHostedReviewAutoMerge({
        repo,
        prNumber: review.number,
        enabled,
        method: enabled ? defaultMergeMethod : undefined,
        prRepo: githubPR?.prRepo ?? null
      })
      if (!result.ok) {
        setActionError(result.error)
      } else {
        await onRefreshReview()
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Auto-merge update failed')
    } finally {
      setMerging(false)
    }
  }

  const handleReviewStateChange = async (nextState: 'open' | 'closed') => {
    if (stateUpdating) {
      return
    }
    const isClosing = nextState === 'closed'
    const label = isClosing ? 'Close' : 'Reopen'
    const confirmed = await confirm({
      title: `${label} PR #${review.number}?`,
      description: isClosing
        ? translate(
            'auto.components.right.sidebar.HostedReviewActions.a3d572a4de',
            'This will close the {{value0}}.',
            { value0: 'pull request' }
          )
        : translate(
            'auto.components.right.sidebar.HostedReviewActions.78f5ff294c',
            'This will reopen the {{value0}}.',
            { value0: 'pull request' }
          ),
      confirmLabel: label,
      confirmVariant: isClosing ? 'destructive' : 'default'
    })
    if (!confirmed) {
      return
    }
    setStateUpdating(nextState)
    setActionError(null)
    try {
      const result = await updateGitHubHostedReviewState({
        repo,
        prNumber: review.number,
        nextState
      })
      if (!result.ok) {
        setActionError(result.error)
        toast.error(result.error)
      } else {
        toast.success(
          isClosing
            ? translate(
                'auto.components.right.sidebar.HostedReviewActions.fa3ee9a515',
                '{{value0}} closed',
                { value0: 'PR' }
              )
            : translate(
                'auto.components.right.sidebar.HostedReviewActions.377269db6f',
                '{{value0}} reopened',
                { value0: 'PR' }
              )
        )
        await onRefreshReview()
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : `Failed to ${label.toLowerCase()} pull request`
      setActionError(message)
      toast.error(message)
    } finally {
      setStateUpdating(null)
    }
  }

  const handleCloseReview = async () => {
    await handleReviewStateChange('closed')
  }

  const handleReopenReview = async () => {
    await handleReviewStateChange('open')
  }

  return {
    merging,
    stateUpdating,
    actionError,
    handleMerge,
    handleAutoMerge,
    handleCloseReview,
    handleReopenReview
  }
}

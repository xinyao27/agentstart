import type { GitConflictOperation } from '@agentstart/protocol/git/status-types'
import { toast } from 'sonner'
import { openHttpLink } from '~renderer/editor/http-link-routing'
import { localizedHostedReviewCopy } from '~renderer/i18n/hosted-review-localized-copy'
import { translate } from '~renderer/i18n/i18n'
import { getConnectionId } from '~renderer/runtime/connection-context'
import { abortRuntimeGitMerge, abortRuntimeGitRebase } from '~renderer/runtime/git-client'
import { shouldForcePushWithLeaseForUpstream } from '~renderer/source-control/workflow/operation'
import { useAppStore } from '~renderer/store/state'
import { showWorkspaceSidebar } from '~renderer/workspace-panel/show-sidebar'

import type {
  AbortConflictOperation,
  CreatedHostedReview,
  HostedReviewCreatedContext
} from '../panel-types'
import { refreshSourceControlAfterRemoteAction } from '../remote-action-state'
import type { SourceControlRemoteActionsController } from './remote-actions'

export function useSourceControlConflictActions(scope: SourceControlRemoteActionsController) {
  const {
    activeRepo,
    activeRepoSettings,
    activeWorktreeId,
    branchName,
    confirmAction,
    conflictOperation,
    fallbackGitHubPRNumber,
    fetchHostedReviewForBranch,
    fetchPRForBranch,
    handleCommit,
    isAbortingOperation,
    linkedGitHubPR,
    refreshActiveGitStatusAfterMutation,
    refreshBranchCompareRef,
    remoteStatus,
    remoteStatusForActions,
    runRemoteAction,
    setAbortOperationInFlightByWorktree,
    setRemoteActionErrors,
    updateWorktreeMeta,
    worktreePath
  } = scope
  const handleAbortOperation = async (
    requestedOperation: AbortConflictOperation
  ): Promise<void> => {
    if (
      !activeWorktreeId ||
      !worktreePath ||
      conflictOperation !== requestedOperation ||
      isAbortingOperation
    ) {
      return
    }

    const isRebase = requestedOperation === 'rebase'
    const label = isRebase ? 'rebase' : 'merge'
    const title = isRebase ? 'Abort rebase?' : 'Abort merge?'
    const description = isRebase
      ? 'This cancels the rebase in progress and can discard conflict resolutions made during this rebase.'
      : 'This cancels the merge in progress and can discard conflict resolutions made during this merge.'
    const confirmed = await confirmAction({
      title,
      description,
      confirmLabel: `Abort ${label}`,
      confirmVariant: 'destructive'
    })
    if (!confirmed) {
      return
    }

    const connectionId = getConnectionId(activeWorktreeId) ?? undefined
    setAbortOperationInFlightByWorktree((prev) => ({ ...prev, [activeWorktreeId]: true }))
    setRemoteActionErrors((prev) => ({ ...prev, [activeWorktreeId]: null }))
    try {
      const context = {
        // Why: route the abort by the repo OWNER host, not the focused runtime.
        settings: activeRepoSettings,
        worktreeId: activeWorktreeId,
        worktreePath,
        connectionId
      }
      const abortGitOperation = isRebase ? abortRuntimeGitRebase : abortRuntimeGitMerge
      await abortGitOperation(context)
    } catch (error) {
      const message = error instanceof Error ? error.message : `Failed to abort ${label}`
      toast.error(
        translate(
          'auto.components.right.sidebar.SourceControl.f99560ab29',
          'Abort {{value0}} failed',
          { value0: label }
        ),
        { description: message }
      )
      setRemoteActionErrors((prev) => ({
        ...prev,
        [activeWorktreeId]: {
          kind: isRebase ? 'abort_rebase' : 'abort_merge',
          message,
          rawError: message
        }
      }))
    } finally {
      setAbortOperationInFlightByWorktree((prev) => ({ ...prev, [activeWorktreeId]: false }))
      refreshSourceControlAfterRemoteAction({
        refreshGitStatus: refreshActiveGitStatusAfterMutation,
        refreshBranchCompare: refreshBranchCompareRef.current,
        refreshGitHistory: () => useAppStore.getState().refreshGitGraph(activeWorktreeId)
      })
    }
  }
  const handleAbortMerge = async (): Promise<void> => {
    await handleAbortOperation('merge')
  }
  const handleAbortRebase = async (): Promise<void> => {
    await handleAbortOperation('rebase')
  }
  const handleAbortOperationForConflict = (operation: GitConflictOperation): void => {
    if (operation === 'merge') {
      void handleAbortMerge()
      return
    }
    if (operation === 'rebase') {
      void handleAbortRebase()
    }
  }
  const runCompoundCommitAction = async (remoteKind: 'push' | 'sync'): Promise<void> => {
    const ok = await handleCommit()
    if (!ok) {
      return
    }
    // Why: compound Commit & Force Push maps to `push`; upgrade only this
    // compound path so the explicit dropdown Push remains non-force.
    if (
      remoteKind === 'push' &&
      shouldForcePushWithLeaseForUpstream(remoteStatusForActions ?? remoteStatus)
    ) {
      await runRemoteAction('force_push')
      return
    }
    await runRemoteAction(remoteKind)
  }
  const handlePullRequestCreated = async (
    result: CreatedHostedReview,
    context?: HostedReviewCreatedContext
  ): Promise<void> => {
    const repoPath = context?.repoPath ?? activeRepo?.path
    const repoId = context?.repoId ?? activeRepo?.id
    const branch = context?.branch ?? branchName
    const worktreeId = context?.worktreeId ?? activeWorktreeId ?? null
    const openChecks = context?.openChecks ?? true
    if (!repoPath || !repoId || !branch) {
      return
    }
    const copy = localizedHostedReviewCopy('github')
    if (openChecks) {
      showWorkspaceSidebar({
        view: 'source-control',
        worktreeId,
        sourceControlView: 'review'
      })
    }
    try {
      if (worktreeId) {
        await updateWorktreeMeta(worktreeId, { linkedPR: result.number })
      }
      const linkedReviewNumbers = {
        linkedGitHubPR: result.number,
        fallbackGitHubPR: fallbackGitHubPRNumber ?? linkedGitHubPR
      }
      await Promise.all([
        fetchHostedReviewForBranch(repoPath, branch, {
          force: true,
          repoId,
          ...linkedReviewNumbers
        }),
        fetchPRForBranch(repoPath, branch, {
          force: true,
          repoId,
          worktreeId: worktreeId ?? undefined,
          linkedPRNumber: result.number
        })
      ])
    } catch {
      toast.warning(
        translate(
          'auto.components.right.sidebar.SourceControl.0453ca3a9a',
          '{{value0}} created, but AgentStart could not refresh it yet.',
          { value0: copy.titleLabel }
        ),
        {
          action: {
            label: translate(
              'auto.components.right.sidebar.SourceControl.812cb992ee',
              'Open on {{value0}}',
              { value0: copy.providerName }
            ),
            onClick: (event) => openHttpLink(result.url, { event, worktreeId: activeWorktreeId })
          }
        }
      )
    }
  }
  const handleBranchChangedByPullRequestGeneration = async (): Promise<void> => {
    // Why: AI PR detail generation may rebase before summarizing; if HEAD moved,
    // refresh status before letting the user submit the generated draft.
    await refreshActiveGitStatusAfterMutation()
  }
  return {
    ...scope,
    handleAbortOperation,
    handleAbortMerge,
    handleAbortRebase,
    handleAbortOperationForConflict,
    runCompoundCommitAction,
    handlePullRequestCreated,
    handleBranchChangedByPullRequestGeneration
  }
}

export type SourceControlConflictActionsController = ReturnType<
  typeof useSourceControlConflictActions
>

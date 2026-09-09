import { useEffect } from 'react'
import { markCommitMessageGenerationHydrated } from '~renderer/workspace-panel/commit-message-generation-state'
import { shouldHydratePullRequestGenerationResult } from '~renderer/workspace-panel/pull-request-generation-state'

import { writeCommitDraftForWorktree } from '../panel-state'
import { hasConfiguredSourceControlTextGenerationDefaults } from '../text-generation-defaults'
import type { SourceControlReviewGenerationController } from './review-generation'

export function useSourceControlReviewDialog(scope: SourceControlReviewGenerationController) {
  const {
    activeCommitMessageGenerationKey,
    activeCommitMessageGenerationRecord,
    activePullRequestGenerationKey,
    activePullRequestGenerationRecord,
    activeRepo,
    activeWorktreeId,
    applyGeneratedPullRequestFields,
    branchName,
    effectiveBaseRef,
    fallbackGitHubPRNumber,
    getHostedReviewCreationEligibility,
    handleGeneratePullRequestFields,
    hasUncommittedEntries,
    isBranchVisible,
    isCreatePrIntentInFlight,
    isCreatingPr,
    isFolder,
    linkedGitHubPR,
    openPullRequestGenerationDialog,
    prGenerating,
    pullRequestFieldsInitialized,
    remoteStatus,
    setHostedReviewCreationRequestState,
    setHostedReviewCreationState,
    settings,
    sourceControlAiActionsVisible,
    updateCommitDrafts,
    updateCommitMessageGenerationRecord,
    updatePullRequestGenerationRecord,
    worktreePath
  } = scope
  const handleGeneratePullRequestFieldsClick = (): void => {
    if (!sourceControlAiActionsVisible) {
      return
    }
    if (
      hasConfiguredSourceControlTextGenerationDefaults({
        actionId: 'pullRequest',
        settings,
        repo: activeRepo ?? null
      })
    ) {
      void handleGeneratePullRequestFields()
      return
    }
    openPullRequestGenerationDialog()
  }
  useEffect(() => {
    // Why: on Source Control remount, the PR fields hook seeds eligibility
    // defaults in an effect; hydrating before that effect runs gets overwritten.
    if (
      !activePullRequestGenerationKey ||
      !activePullRequestGenerationRecord ||
      activePullRequestGenerationRecord.status !== 'succeeded' ||
      !activePullRequestGenerationRecord.result ||
      activePullRequestGenerationRecord.hydrated ||
      !pullRequestFieldsInitialized
    ) {
      return
    }
    if (
      !shouldHydratePullRequestGenerationResult({
        record: activePullRequestGenerationRecord
      })
    ) {
      return
    }
    const result = activePullRequestGenerationRecord.result
    applyGeneratedPullRequestFields(result, activePullRequestGenerationRecord.seedFieldRevisions)
    updatePullRequestGenerationRecord(activePullRequestGenerationKey, (record) => {
      if (
        !record ||
        record.context.requestId !== activePullRequestGenerationRecord.context.requestId
      ) {
        return null
      }
      return {
        ...record,
        hydrated: true
      }
    })
  }, [
    activePullRequestGenerationKey,
    activePullRequestGenerationRecord,
    applyGeneratedPullRequestFields,
    pullRequestFieldsInitialized,
    updatePullRequestGenerationRecord
  ])
  useEffect(() => {
    // Why: direct commit-message generation can finish after Source Control
    // unmounts; the store record lets the remounted textarea consume it once.
    if (
      !activeCommitMessageGenerationKey ||
      !activeWorktreeId ||
      !activeCommitMessageGenerationRecord ||
      activeCommitMessageGenerationRecord.status !== 'succeeded' ||
      !activeCommitMessageGenerationRecord.message ||
      activeCommitMessageGenerationRecord.hydrated
    ) {
      return
    }
    updateCommitDrafts((prev) => {
      const current = prev[activeWorktreeId]
      return current && current.length > 0
        ? prev
        : writeCommitDraftForWorktree(
            prev,
            activeWorktreeId,
            activeCommitMessageGenerationRecord.message ?? ''
          )
    })
    updateCommitMessageGenerationRecord(activeCommitMessageGenerationKey, (record) =>
      markCommitMessageGenerationHydrated(record)
    )
  }, [
    activeCommitMessageGenerationKey,
    activeCommitMessageGenerationRecord,
    activeWorktreeId,
    updateCommitDrafts,
    updateCommitMessageGenerationRecord
  ])
  useEffect(() => {
    if (!isBranchVisible || !activeRepo || isFolder || !branchName || !activeWorktreeId) {
      setHostedReviewCreationState(null)
      setHostedReviewCreationRequestState(null)
      return
    }
    // Why: transient Git state during generation/submission can invalidate
    // eligibility and tear down the active review composer.
    if (prGenerating || isCreatingPr || isCreatePrIntentInFlight) {
      setHostedReviewCreationRequestState(null)
      return
    }
    let stale = false
    setHostedReviewCreationRequestState({
      repoId: activeRepo.id,
      worktreeId: activeWorktreeId,
      branch: branchName,
      status: 'loading'
    })
    // Why: upstream/status changes can make the previous eligibility unsafe
    // to click while the new preflight is still resolving.
    setHostedReviewCreationState(null)
    void getHostedReviewCreationEligibility({
      repoPath: activeRepo.path,
      repoId: activeRepo.id,
      ...(worktreePath ? { worktreePath } : {}),
      branch: branchName,
      base: effectiveBaseRef ?? null,
      hasUncommittedChanges: hasUncommittedEntries,
      hasUpstream: remoteStatus?.hasUpstream,
      ahead: remoteStatus?.ahead,
      behind: remoteStatus?.behind,
      linkedGitHubPR,
      fallbackGitHubPR: fallbackGitHubPRNumber
    })
      .then((result) => {
        if (!stale) {
          setHostedReviewCreationState({
            repoId: activeRepo.id,
            worktreeId: activeWorktreeId,
            branch: branchName,
            data: result
          })
          setHostedReviewCreationRequestState(null)
        }
      })
      .catch((error) => {
        console.warn('[SourceControl] hosted review creation eligibility failed', error)
        if (!stale) {
          setHostedReviewCreationState(null)
          setHostedReviewCreationRequestState({
            repoId: activeRepo.id,
            worktreeId: activeWorktreeId,
            branch: branchName,
            status: 'failed'
          })
        }
      })
    return () => {
      stale = true
    }
  }, [
    activeRepo,
    branchName,
    effectiveBaseRef,
    getHostedReviewCreationEligibility,
    hasUncommittedEntries,
    setHostedReviewCreationRequestState,
    isBranchVisible,
    isCreatingPr,
    isCreatePrIntentInFlight,
    isFolder,
    linkedGitHubPR,
    fallbackGitHubPRNumber,
    prGenerating,
    remoteStatus?.ahead,
    remoteStatus?.behind,
    remoteStatus?.hasUpstream,
    setHostedReviewCreationState,
    activeWorktreeId,
    worktreePath
  ])
  return { ...scope, handleGeneratePullRequestFieldsClick }
}

export type SourceControlReviewDialogController = ReturnType<typeof useSourceControlReviewDialog>

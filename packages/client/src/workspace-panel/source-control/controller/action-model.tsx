import { translate } from '~renderer/i18n/i18n'
import { isStageableStatusEntry } from '~renderer/workspace-panel/discard-all-sequence'

import { resolveDropdownItems, type DropdownEntry } from '../dropdown-items'
import { resolveCommitAreaPrimaryAction, type PrimaryAction } from '../primary-action'
import { resolveCreatePrHeaderAction } from '../primary-create-pr-intent-action'
import type { SourceControlCreateReviewIntentController } from './create-review-intent'

export function useSourceControlActionModel(scope: SourceControlCreateReviewIntentController) {
  const {
    branchName,
    branchSummary,
    canUseHostedReviewPushTarget,
    commitMessage,
    conflictOperation,
    effectiveBaseRef,
    grouped,
    hostedReview,
    hostedReviewCreateCopy,
    hostedReviewCreation,
    hostedReviewCreationForHeader,
    hostedReviewStateForActions,
    inFlightRemoteOpKind,
    isAbortingOperation,
    isCommitting,
    isCreatePrIntentInFlight,
    isCreatingPr,
    isHostedReviewCreationLoading,
    isHostedReviewStateLoading,
    isRemoteOperationActive,
    prGenerating,
    remoteStatus,
    remoteStatusForActions,
    unresolvedConflicts
  } = scope
  const hasUnstagedChanges = grouped.unstaged.length > 0 || grouped.untracked.length > 0
  const hasStageableChanges = (() =>
    grouped.unstaged.some(isStageableStatusEntry) ||
    grouped.untracked.some(isStageableStatusEntry))()
  const hasPartiallyStagedChanges = (() => {
    if (grouped.staged.length === 0 || grouped.unstaged.length === 0) {
      return false
    }
    const unstagedPaths = new Set(grouped.unstaged.map((entry) => entry.path))
    return grouped.staged.some((entry) => unstagedPaths.has(entry.path))
  })()
  const primaryAction: PrimaryAction = (() => {
    return resolveCommitAreaPrimaryAction({
      stagedCount: grouped.staged.length,
      hasUnstagedChanges,
      hasStageableChanges,
      hasPartiallyStagedChanges,
      hasMessage: commitMessage.trim().length > 0,
      hasUnresolvedConflicts: unresolvedConflicts.length > 0,
      isCommitting,
      isRemoteOperationActive: isRemoteOperationActive || isAbortingOperation,
      upstreamStatus: remoteStatusForActions,
      prState: hostedReviewStateForActions,
      isPRStateLoading: isHostedReviewStateLoading,
      inFlightRemoteOpKind,
      hostedReviewCreation,
      branchCommitsAhead:
        branchSummary?.status === 'ready' ? (branchSummary.commitsAhead ?? 0) : undefined,
      hasCurrentBranch: Boolean(branchName),
      canPushLinkedReviewWithoutUpstream: canUseHostedReviewPushTarget,
      isPrIntentInFlight: isCreatePrIntentInFlight
    })
  })()
  const createPrHeaderAction: PrimaryAction | null = (() => {
    const action = resolveCreatePrHeaderAction({
      stagedCount: grouped.staged.length,
      hasUnstagedChanges,
      hasStageableChanges,
      hasPartiallyStagedChanges,
      hasMessage: commitMessage.trim().length > 0,
      hasUnresolvedConflicts: unresolvedConflicts.length > 0,
      isCommitting,
      isRemoteOperationActive: isRemoteOperationActive || isAbortingOperation,
      upstreamStatus: remoteStatus,
      prState: hostedReview?.state ?? null,
      isPRStateLoading: isHostedReviewStateLoading,
      inFlightRemoteOpKind,
      hostedReviewCreation: hostedReviewCreationForHeader,
      isHostedReviewCreationLoading:
        isHostedReviewCreationLoading && hostedReviewCreationForHeader !== null,
      branchCommitsAhead:
        branchSummary?.status === 'ready' ? (branchSummary.commitsAhead ?? 0) : undefined,
      hasCurrentBranch: Boolean(branchName),
      isPrIntentInFlight: isCreatePrIntentInFlight
    })
    if ((prGenerating || isCreatingPr) && action?.kind === 'create_pr') {
      return {
        ...action,
        title: prGenerating
          ? translate(
              'auto.components.workspacePanel.SourceControl.createPrIntentGeneratingDetails',
              'Generating review details…'
            )
          : translate(
              'auto.components.workspacePanel.SourceControl.fe5bd1a610',
              'Creating {{value0}}...',
              { value0: hostedReviewCreateCopy.reviewLabel }
            ),
        disabled: true
      }
    }
    return action
  })()
  const directCreatePrAction =
    createPrHeaderAction?.kind === 'create_pr' &&
    hostedReviewCreation?.canCreate === true &&
    (!createPrHeaderAction.disabled || isCreatingPr || prGenerating)
      ? createPrHeaderAction
      : null
  const dropdownItems: DropdownEntry[] = (() =>
    resolveDropdownItems({
      stagedCount: grouped.staged.length,
      hasUnstagedChanges,
      hasStageableChanges,
      hasPartiallyStagedChanges,
      hasMessage: commitMessage.trim().length > 0,
      hasUnresolvedConflicts: unresolvedConflicts.length > 0,
      isCommitting,
      isRemoteOperationActive: isRemoteOperationActive || isAbortingOperation,
      conflictOperation,
      upstreamStatus: remoteStatusForActions,
      prState: hostedReviewStateForActions,
      isPRStateLoading: isHostedReviewStateLoading,
      inFlightRemoteOpKind,
      hostedReviewCreation,
      isPullRequestOperationActive: prGenerating || isCreatingPr || isCreatePrIntentInFlight,
      branchCommitsAhead:
        branchSummary?.status === 'ready' ? (branchSummary.commitsAhead ?? 0) : undefined,
      hasCurrentBranch: Boolean(branchName),
      canPushLinkedReviewWithoutUpstream: canUseHostedReviewPushTarget,
      rebaseBaseRef: effectiveBaseRef
    }))()
  return {
    ...scope,
    hasUnstagedChanges,
    hasStageableChanges,
    hasPartiallyStagedChanges,
    primaryAction,
    createPrHeaderAction,
    directCreatePrAction,
    dropdownItems
  }
}

export type SourceControlActionModelController = ReturnType<typeof useSourceControlActionModel>

import { translate } from '~renderer/i18n/i18n'
import { DetachedHeadBadge } from '~renderer/source-control/detached-head-badge'
import { Button } from '~renderer/ui/button'

import { CreateHostedReviewComposer } from '../create-hosted-review-composer'
import type { useChecksPanelCreateReviewState } from './create-review'
import {
  getChecksPanelEmptyStateCopy,
  shouldShowChecksPanelPublishBranchAction
} from './empty-state'

type ChecksPanelEmptyStateViewProps = { context: useChecksPanelCreateReviewState }

export function ChecksPanelEmptyStateView({
  context
}: ChecksPanelEmptyStateViewProps): React.JSX.Element | null {
  const {
    activeReview,
    activeWorktree,
    activeWorktreeId,
    branch,
    conflictOperation,
    createComposerOpen,
    createPrError,
    createPrPushFirst,
    detachedHeadDisplay,
    emptyRefreshing,
    handleCancelGeneratePullRequestFields,
    handleCreatePullRequest,
    handleGeneratePullRequestFields,
    handlePrBaseChange,
    handlePrTitleChange,
    handlePublishBranch,
    handleRefresh,
    hasAmbiguousGitHubHostedReview,
    hostedReviewCreation,
    isCreatingPr,
    isFolder,
    isPublishingBranch,
    isRemoteOperationActive,
    prAiGenerationEnabled,
    prBase,
    prBaseQuery,
    prBaseResults,
    prBaseSearchError,
    prBody,
    prDraft,
    prGenerateDisabled,
    prGenerateDisabledReason,
    prGenerateError,
    prGenerating,
    prRefreshState,
    prTitle,
    publishActionHasUncommittedChanges,
    publishActionRemoteStatus,
    setEmptyRefreshing,
    setPrBaseQuery,
    setPrBaseResults,
    setPrBody,
    setPrDraft,
    sourceControlAiActionsVisible
  } = context

  if (!activeWorktree) {
    return (
      <div className="px-4 py-6">
        <div className="text-foreground text-sm font-medium">
          {translate(
            'auto.components.right.sidebar.ChecksPanel.a4ef4e0832',
            'No workspace selected'
          )}
        </div>
        <div className="text-muted-foreground mt-1 text-xs">
          {translate(
            'auto.components.right.sidebar.ChecksPanel.b5dd73a105',
            'Select a workspace to view checks'
          )}
        </div>
      </div>
    )
  }
  if (isFolder) {
    return (
      <div className="px-4 py-6">
        <div className="text-foreground text-sm font-medium">
          {translate('auto.components.right.sidebar.ChecksPanel.976cefd02f', 'Checks unavailable')}
        </div>
        <div className="text-muted-foreground mt-1 text-xs">
          {translate(
            'auto.components.right.sidebar.ChecksPanel.dda5924a40',
            'Checks require a Git branch and hosted review context'
          )}
        </div>
      </div>
    )
  }

  if (!activeReview) {
    // Why: conflict operations detach HEAD while the review still exists on its
    // original branch, so a generic "not found" message would be misleading.
    const operationInProgress = conflictOperation !== 'unknown'
    const operationLabel =
      conflictOperation === 'rebase'
        ? 'Rebase'
        : conflictOperation === 'merge'
          ? 'Merge'
          : conflictOperation === 'cherry-pick'
            ? 'Cherry-pick'
            : null
    const canPushCreate = hostedReviewCreation?.blockedReason === 'needs_push'
    const shouldPushBeforeCreateReview = createPrPushFirst || canPushCreate
    const canPublishBranch =
      isPublishingBranch ||
      (!publishActionHasUncommittedChanges &&
        shouldShowChecksPanelPublishBranchAction({
          hostedReviewBlockedReason: hostedReviewCreation?.blockedReason,
          hasUpstream: publishActionRemoteStatus?.hasUpstream,
          hasCurrentBranch: Boolean(branch)
        }))
    const emptyStateCopy = getChecksPanelEmptyStateCopy({
      operationLabel,
      prRefreshStatus: prRefreshState?.status,
      hostedReviewBlockedReason: hostedReviewCreation?.blockedReason,
      hasUpstream: publishActionRemoteStatus?.hasUpstream,
      hasCurrentBranch: Boolean(branch),
      hasAmbiguousGitHubHostedReview
    })
    return (
      <div className="px-4 py-6">
        {detachedHeadDisplay && (
          <div className="mb-3">
            <DetachedHeadBadge display={detachedHeadDisplay} side="bottom" />
          </div>
        )}
        <div className="text-foreground text-sm font-medium">{emptyStateCopy.title}</div>
        <div className="text-muted-foreground mt-1 text-xs">{emptyStateCopy.description}</div>
        {!operationInProgress && createComposerOpen ? (
          <div className="border-border mt-4 border-t pt-3">
            <CreateHostedReviewComposer
              className="p-0"
              branch={branch}
              base={prBase}
              setBase={handlePrBaseChange}
              title={prTitle}
              setTitle={handlePrTitleChange}
              body={prBody}
              setBody={setPrBody}
              draft={prDraft}
              setDraft={setPrDraft}
              baseQuery={prBaseQuery}
              setBaseQuery={setPrBaseQuery}
              baseResults={prBaseResults}
              setBaseResults={setPrBaseResults}
              baseSearchError={prBaseSearchError}
              aiGenerationEnabled={sourceControlAiActionsVisible && prAiGenerationEnabled}
              generating={prGenerating}
              generateDisabled={prGenerateDisabled}
              generateDisabledReason={prGenerateDisabledReason}
              generateError={prGenerateError}
              createError={createPrError}
              isCreating={isCreatingPr}
              pushBeforeCreate={shouldPushBeforeCreateReview}
              primaryAction={{
                disabled: isCreatingPr || isPublishingBranch || isRemoteOperationActive,
                title: shouldPushBeforeCreateReview
                  ? translate(
                      'auto.components.right.sidebar.ChecksPanel.98f4c37b33',
                      'Push & Create {{value0}}',
                      { value0: 'PR' }
                    )
                  : translate(
                      'auto.components.right.sidebar.ChecksPanel.889cdfba04',
                      'Create {{value0}}',
                      { value0: 'PR' }
                    )
              }}
              onGenerate={() => void handleGeneratePullRequestFields()}
              onCancelGenerate={handleCancelGeneratePullRequestFields}
              onPrimaryAction={() => void handleCreatePullRequest()}
            />
          </div>
        ) : null}
        {!operationInProgress && (!createComposerOpen || canPublishBranch) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {canPublishBranch && (
              <Button
                size="xs"
                disabled={isPublishingBranch || isRemoteOperationActive}
                onClick={handlePublishBranch}
              >
                {isPublishingBranch
                  ? translate('auto.components.right.sidebar.ChecksPanel.fdb27637f2', 'Publishing…')
                  : translate(
                      'auto.components.right.sidebar.ChecksPanel.6633c7a1fb',
                      'Publish Branch'
                    )}
              </Button>
            )}
            {!createComposerOpen ? (
              <Button
                size="xs"
                variant="outline"
                disabled={emptyRefreshing || isPublishingBranch || isRemoteOperationActive}
                onClick={() => {
                  if (!activeWorktreeId) {
                    return
                  }
                  setEmptyRefreshing(true)
                  void handleRefresh().finally(() => {
                    setEmptyRefreshing(false)
                  })
                }}
              >
                {emptyRefreshing
                  ? translate('auto.components.right.sidebar.ChecksPanel.71026ca2cb', 'Refreshing…')
                  : translate('auto.components.right.sidebar.ChecksPanel.7f4489f370', 'Refresh')}
              </Button>
            ) : null}
          </div>
        )}
      </div>
    )
  }

  return null
}

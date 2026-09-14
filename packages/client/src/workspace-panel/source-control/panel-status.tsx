import { cn } from '~renderer/ui/class-names'
import {
  ConflictSummaryCard,
  OperationBanner,
  TooManyChangesBanner
} from '~renderer/workspace-panel/source-control/review/conflict-summary'
import { EmptyState } from '~renderer/workspace-panel/source-control/tree/empty-state'

import type { SourceControlController } from './controller'
import { SOURCE_CONTROL_PANEL_GUTTER_CLASS_NAME } from './panel-constants'

export function SourceControlPanelStatus({
  controller,
  hasFilteredBranchEntries,
  hasFilteredUncommittedEntries,
  showGenericEmptyState
}: {
  controller: SourceControlController
  hasFilteredBranchEntries: boolean
  hasFilteredUncommittedEntries: boolean
  showGenericEmptyState: boolean
}): React.JSX.Element {
  const {
    activeWorktreeId,
    branchSummary,
    conflictOperation,
    fileFilterState,
    filterQuery,
    handleAbortOperationForConflict,
    handleResolveConflictsWithAI,
    isAbortingOperation,
    normalizedFilter,
    openConflictReview,
    repositoryHuge,
    resolveConflictsComposerOpen,
    sourceControlAiActionsVisible,
    unresolvedConflictReviewEntries,
    worktreePath
  } = controller

  return (
    <>
      {unresolvedConflictReviewEntries.length > 0 ? (
        <div className={cn('pb-2', SOURCE_CONTROL_PANEL_GUTTER_CLASS_NAME)}>
          <ConflictSummaryCard
            conflictOperation={conflictOperation}
            unresolvedCount={unresolvedConflictReviewEntries.length}
            sourceControlAiActionsVisible={sourceControlAiActionsVisible}
            isResolvingWithAI={resolveConflictsComposerOpen}
            isAbortingOperation={isAbortingOperation}
            onAbortOperation={handleAbortOperationForConflict}
            onResolveWithAI={() => void handleResolveConflictsWithAI()}
            onReview={() => {
              if (activeWorktreeId && worktreePath) {
                openConflictReview(
                  activeWorktreeId,
                  worktreePath,
                  unresolvedConflictReviewEntries,
                  'live-summary'
                )
              }
            }}
          />
        </div>
      ) : null}

      {/* Why: the conflict card owns active conflicts; this covers the between-step state. */}
      {unresolvedConflictReviewEntries.length === 0 && conflictOperation !== 'unknown' ? (
        <div className={cn('pb-2', SOURCE_CONTROL_PANEL_GUTTER_CLASS_NAME)}>
          <OperationBanner
            conflictOperation={conflictOperation}
            isAbortingOperation={isAbortingOperation}
            onAbortOperation={handleAbortOperationForConflict}
          />
        </div>
      ) : null}

      {repositoryHuge ? (
        <div className={cn('pb-2', SOURCE_CONTROL_PANEL_GUTTER_CLASS_NAME)}>
          <TooManyChangesBanner limit={repositoryHuge.limit} />
        </div>
      ) : null}

      {showGenericEmptyState && !normalizedFilter ? (
        <EmptyState
          heading="No changes on this branch"
          supportingText={`This workspace is clean and this branch has no changes ahead of ${branchSummary?.baseRef ?? 'base'}`}
        />
      ) : null}

      {fileFilterState.tooLarge ? (
        <EmptyState
          heading="Search text is too large"
          supportingText="Use a shorter file filter."
        />
      ) : null}

      {normalizedFilter && !hasFilteredUncommittedEntries && !hasFilteredBranchEntries ? (
        <EmptyState
          heading="No matching files"
          supportingText={`No changed files match "${filterQuery}"`}
        />
      ) : null}
    </>
  )
}

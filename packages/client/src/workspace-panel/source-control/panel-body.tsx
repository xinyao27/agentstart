import { ScrollArea } from '~renderer/ui/scroll-area'
import { SourceControlPanelCommit } from '~renderer/workspace-panel/source-control/commit/panel-commit'
import { SourceControlUncommittedGroupsMemo } from '~renderer/workspace-panel/source-control/commit/uncommitted-groups'
import { shouldShowSourceControlCompareUnavailableCard } from '~renderer/workspace-panel/source-control/header/header-toolbar'
import { CompareUnavailable } from '~renderer/workspace-panel/source-control/review/compare-summary'
import { SourceControlListView } from '~renderer/workspace-panel/source-control/tree/list-view'
import { SourceControlPierreBranchTree } from '~renderer/workspace-panel/source-control/tree/pierre-tree'

import type { SourceControlController } from './controller'
import { SourceControlPanelStatus } from './panel-status'

export function SourceControlPanelBody({
  controller
}: {
  controller: SourceControlController
}): React.JSX.Element {
  const {
    activeScope,
    activeWorktree,
    branchEntries,
    branchSummary,
    filteredBranchEntries,
    filteredGrouped,
    hasUncommittedEntries,
    normalizedFilter,
    refreshBranchCompare,
    setBaseRefDialogOpen,
    sourceControlViewMode,
    worktreePath
  } = controller
  const hasFilteredUncommittedEntries =
    filteredGrouped.staged.length > 0 ||
    filteredGrouped.unstaged.length > 0 ||
    filteredGrouped.untracked.length > 0
  const hasFilteredBranchEntries = filteredBranchEntries.length > 0
  const showGenericEmptyState =
    !hasUncommittedEntries && branchSummary?.status === 'ready' && branchEntries.length === 0

  const status = (
    <SourceControlPanelStatus
      controller={controller}
      hasFilteredBranchEntries={hasFilteredBranchEntries}
      hasFilteredUncommittedEntries={hasFilteredUncommittedEntries}
      showGenericEmptyState={showGenericEmptyState}
    />
  )
  const commit = (
    <SourceControlPanelCommit
      controller={controller}
      showGenericEmptyState={showGenericEmptyState}
    />
  )
  const compareUnavailable =
    shouldShowSourceControlCompareUnavailableCard(
      branchSummary,
      hasUncommittedEntries,
      branchEntries.length > 0,
      Boolean(normalizedFilter)
    ) && branchSummary ? (
      <CompareUnavailable
        summary={branchSummary}
        onChangeBaseRef={() => setBaseRefDialogOpen(true)}
        onRetry={() => void refreshBranchCompare()}
      />
    ) : null

  // Why: list view is one virtualized list that owns the panel scroller, with
  // the status and commit chrome riding along as its header, so the groups stay
  // rows of a single list instead of separate lists sharing one scroller.
  if (sourceControlViewMode === 'list') {
    return (
      <div className="min-h-0 flex-1">
        <SourceControlListView
          controller={controller}
          header={
            <>
              {status}
              {commit}
            </>
          }
          footer={compareUnavailable}
        />
      </div>
    )
  }

  return (
    <ScrollArea className="min-h-0 flex-1" viewportClassName="flex flex-col overflow-x-hidden pt-1">
      {status}
      {commit}
      {/* Why: the header's scope select picks the world on screen; inside the
          working tree, staged/unstaged/untracked stay levels of the tree. */}
      {activeScope?.id === 'branch' ? (
        activeWorktree && worktreePath ? (
          <SourceControlPierreBranchTree controller={controller} />
        ) : null
      ) : activeScope ? (
        <SourceControlUncommittedGroupsMemo controller={controller} />
      ) : null}
      {compareUnavailable}
    </ScrollArea>
  )
}

import { translate } from '~renderer/i18n/i18n'
import { LoadingIndicator } from '~renderer/loading/indicator'
import { Button } from '~renderer/ui/button'

import { GitGraphCommitTable } from './commit-table'
import { GitGraphCommitWriteDialog } from './commit-write-dialog'
import { GitGraphControlBar } from './control-bar'
import { GitGraphFindWidget } from './find-widget'
import { buildGitGraphLayout, GIT_GRAPH_EXPAND_HEIGHT } from './layout'
import { GitGraphUncommittedRow } from './uncommitted-row'
import { useGitGraphView } from './use-git-graph-view'

// Why: this mounts the vscode-git-graph-style commit table for the content
// area — control bar, resizable commit columns aligned to the shared
// GitGraphSvg vertex grid, inline commit details, and the find widget. See
// use-git-graph-view.ts for the state/selectors this composes.
function GitGraphView({
  worktreeId,
  tabId
}: {
  worktreeId: string
  tabId: string
}): React.JSX.Element {
  const view = useGitGraphView({ worktreeId, tabId })

  // Why: computed once here so the identical gap reaches both
  // buildGitGraphLayout (bakes it into vertex/edge pixel positions) and
  // GitGraphCommitTable (sizes the details block and the SVG overlay) — a
  // mismatch between the two would desync the graph lines from the rows.
  const rowGap = (() => {
    if (!view.expandedCommitId) {
      return undefined
    }
    const afterRow = view.items.findIndex((item) => item.id === view.expandedCommitId)
    return afterRow >= 0 ? { afterRow, height: GIT_GRAPH_EXPAND_HEIGHT } : undefined
  })()

  const layout = (() => {
    if (view.items.length === 0) {
      return null
    }
    // Why: omit `style` and let buildGitGraphLayout apply its own default —
    // spelling that literal here would trip the UI style-drift scan's
    // `rounded-*` check, which does a raw text scan rather than a
    // className-aware one.
    return buildGitGraphLayout(view.items, {
      headCommitId: view.currentCommitId ?? null,
      rowGap
    })
  })()

  const graphColumnWidth = layout?.width ?? 32

  return (
    <div className="bg-background relative flex min-h-0 min-w-0 flex-1 flex-col">
      <GitGraphControlBar
        branchOptions={view.branchOptions}
        selectedRefIds={view.selectedRefIds}
        onSelectedRefIdsChange={view.setGitGraphSelectedRefIds}
        includeRemoteBranches={view.includeRemoteBranches}
        onIncludeRemoteBranchesChange={view.setIncludeRemoteBranches}
        onRefresh={view.onRefresh}
        isRefreshing={view.isLoading}
        onToggleFind={() => view.setFindOpen((open) => !open)}
        onClose={view.onCloseGraph}
      />
      <div className="relative flex min-h-0 flex-1 flex-col">
        {view.findOpen && (
          <GitGraphFindWidget
            query={view.findQuery}
            onQueryChange={view.setFindQuery}
            matchCount={view.findMatchIdSet.size}
            currentIndex={view.findIndex}
            onPrev={() => view.stepFind(-1)}
            onNext={() => view.stepFind(1)}
            onClose={view.closeFind}
          />
        )}
        {view.isDirty && (
          <GitGraphUncommittedRow
            graphColumnWidth={graphColumnWidth}
            columnWidths={view.columnWidths}
            onOpen={view.onOpenUncommittedChanges}
          />
        )}
        {view.isLoading && view.items.length === 0 ? (
          <div className="text-muted-foreground flex items-center gap-2 px-3 py-2 text-[11px]">
            <LoadingIndicator className="size-3" />
            <span>
              {translate(
                'auto.components.workspace-panel.git-graph.GitGraphView.a1b2c3d4e5',
                'Loading commits…'
              )}
            </span>
          </div>
        ) : view.graphState.status === 'error' && view.items.length === 0 ? (
          <div className="text-destructive px-3 py-2 text-[11px]">{view.graphState.error}</div>
        ) : view.items.length === 0 && !view.hasLoadedItems ? (
          <div className="text-muted-foreground px-3 py-2 text-[11px]">
            {translate(
              'auto.components.workspace-panel.git-graph.GitGraphView.b2c3d4e5f6',
              'No commits yet'
            )}
          </div>
        ) : view.items.length === 0 && view.isFiltered ? (
          // Why: the branch filter only ever sees the loaded page (skip-based
          // paging), so an empty match here can mean "not loaded yet" rather
          // than "this branch has no commits" — keep Load More offered
          // instead of implying the filtered history is complete.
          <div className="text-muted-foreground flex flex-col items-start gap-2 px-3 py-2 text-[11px]">
            <span>
              {view.hasMore
                ? translate(
                    'auto.components.workspace-panel.git-graph.GitGraphView.c3d4e5f6a7',
                    'No matching commits in the loaded history yet — load more to keep searching.'
                  )
                : translate(
                    'auto.components.workspace-panel.git-graph.GitGraphView.d4e5f6a7b8',
                    'No commits found for the selected branches in the loaded history.'
                  )}
            </span>
            {view.hasMore && (
              <Button
                type="button"
                variant="outline"
                size="xs"
                disabled={view.isLoadingMore}
                onClick={view.onLoadMore}
              >
                {view.isLoadingMore ? (
                  <LoadingIndicator className="size-3" />
                ) : (
                  translate(
                    'auto.components.workspace-panel.git-graph.GitGraphView.e5f6a7b8c9',
                    'Load More Commits'
                  )
                )}
              </Button>
            )}
          </div>
        ) : (
          <GitGraphCommitTable
            items={view.items}
            layout={layout}
            rowGap={rowGap}
            currentCommitId={view.currentCommitId}
            columnWidths={view.columnWidths}
            onColumnWidthsChange={view.onColumnWidthsChange}
            expandedCommitId={view.expandedCommitId}
            onToggleExpand={(item) => view.toggleExpand(item.id)}
            onSelectParent={view.selectParent}
            loadCommitFiles={view.loadCommitFiles}
            onOpenFile={view.openFile}
            onOpenAllChanges={(item) => view.openAllChanges(item.id)}
            onCommitAction={view.handleCommitAction}
            findMatchIds={view.findMatchIdSet}
            currentFindCommitId={view.currentFindCommitId}
            rowRefs={view.rowRefs}
            onScrollNearBottom={view.onLoadMore}
            hasMore={view.hasMore}
            isLoadingMore={view.isLoadingMore}
            onLoadMore={view.onLoadMore}
          />
        )}
      </div>
      {view.writeDialog && (
        // Why: keyed by action + commit so switching actions remounts the form
        // instead of carrying the previous action's field values over.
        <GitGraphCommitWriteDialog
          key={`${view.writeDialog.action}:${view.writeDialog.item.id}`}
          state={view.writeDialog}
          submitting={view.isWriting}
          onClose={view.closeWriteDialog}
          onSubmit={view.submitWriteDialog}
        />
      )}
    </div>
  )
}

export default GitGraphView

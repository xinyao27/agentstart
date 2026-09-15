import React from 'react'
import { cn } from '~renderer/ui/class-names'

import { SearchFilters } from '../search-filters'
import { SearchQueryRow } from '../search-query-row'
import type { FileExplorerInteractions } from './interactions'
import type { FileExplorerModel } from './model'
import { FileExplorerNameFilter } from './name-filter'
import { FileExplorerQueryStrip } from './query-strip'
import { FileExplorerToolbar } from './toolbar'

type FileExplorerQueryHeaderProps = {
  model: FileExplorerModel
  interactions: FileExplorerInteractions
}

function FileExplorerQueryHeader({
  model,
  interactions
}: FileExplorerQueryHeaderProps): React.JSX.Element {
  const { view, owner, tree, display, actions } = model
  const canCollapseAll = view.isFilesViewActive && !view.hasNameFilter && tree.expanded.size > 0

  return (
    <>
      <FileExplorerToolbar
        repoName={display.repoName}
        worktreePath={owner.worktreePath!}
        // Why: Repo.connectionId is dead — nothing sets it since remote hosts
        // were removed (#63) — a direct repo/worktree owner is never SSH.
        connectionId={null}
        runtimeEnvironmentId={owner.activeRuntimeEnvironmentId}
        refresh={display.manualRefresh}
        canRefresh={view.isFilesViewActive}
        canCollapseAll={canCollapseAll}
        onCollapseAll={interactions.actions.handleCollapseAll}
        showGitIgnoredFilesToggle={display.activeRepoSupportsGit}
        showGitIgnoredFiles={display.showGitIgnoredFiles}
        onToggleGitIgnoredFiles={actions.toggleGitIgnoredFiles}
        showDotfiles={display.showDotfiles}
        onToggleDotfiles={interactions.actions.handleToggleDotfiles}
      />
      <FileExplorerQueryStrip view={view.explorerView} onSelectView={view.handleSelectExplorerView}>
        {/* Why: cross-fading preserves query focus and virtualized pane state. */}
        <div className="relative min-h-7">
          <div
            className={cn(
              view.explorerView !== 'files' &&
                'pointer-events-none invisible absolute inset-x-0 top-0'
            )}
          >
            <FileExplorerNameFilter
              query={view.nameFilterQuery}
              loading={view.nameFilterFiles.loading}
              onQueryChange={view.setNameFilterQuery}
              onClear={view.handleClearNameFilter}
            />
          </div>
          <div
            className={cn(
              view.explorerView !== 'search' &&
                'pointer-events-none invisible absolute inset-x-0 top-0'
            )}
          >
            <SearchQueryRow {...view.searchPanel.queryRowProps} />
          </div>
        </div>
      </FileExplorerQueryStrip>
      <div
        className={cn(
          'px-2 pb-1.5',
          view.explorerView !== 'search' && 'pointer-events-none invisible h-0 overflow-hidden p-0'
        )}
      >
        <SearchFilters {...view.searchPanel.filtersProps} />
      </div>
    </>
  )
}

// Why: useFileExplorerModel and useFileSearchPanel now both memoize their
// full return chain, so `model` itself is stable when nothing in it
// changed. `interactions` is still capped by three sibling hooks
// (dragDrop/inline/handlers in useFileExplorerInteractions) that return a
// fresh object literal every call — see the Why: comment on that hook's
// return for detail.
export const FileExplorerQueryHeaderMemo = FileExplorerQueryHeader

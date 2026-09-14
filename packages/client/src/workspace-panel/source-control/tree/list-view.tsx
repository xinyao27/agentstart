import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react'
import { LEGEND_LIST_SCROLL_AREA_PROPS } from '~renderer/sidebar/list-scroll-area'
import { UncommittedEntryRow } from '~renderer/workspace-panel/source-control/commit/uncommitted-entry-row'
import {
  SourceControlUncommittedGroupActions,
  getSourceControlGroupLabel
} from '~renderer/workspace-panel/source-control/commit/uncommitted-groups'
import type { SourceControlController } from '~renderer/workspace-panel/source-control/controller'

import { BranchEntryRow } from './branch-entry-row'
import { SubmodulePlaceholderRow } from './entry-details'
import { SourceControlGroupRow } from './group-row'
import {
  buildSourceControlBranchListModel,
  buildSourceControlUncommittedListModel,
  getSourceControlListRowKey,
  getSourceControlListRowType,
  type SourceControlListRow
} from './list-rows'
import { getSubmoduleExpansionKey, isExpandableSubmoduleEntry } from './submodule-expansion'

// Why: entry rows are one py-1 text-xs line and group rows are 26px; LegendList
// measures the real heights after first paint and only needs a starting hint.
const SOURCE_CONTROL_LIST_ROW_ESTIMATE_PX = 24

export function SourceControlListView({
  controller,
  header,
  footer
}: {
  controller: SourceControlController
  header?: React.ReactElement | null
  footer?: React.ReactElement | null
}): React.JSX.Element | null {
  const {
    activeConnectionId,
    activeOpenRowKeys,
    activeScope,
    activeWorktree,
    collapsedSections,
    diffCommentCountByPath,
    displaySections,
    expandedSubmoduleKeys,
    filteredBranchEntries,
    handleOpenDiff,
    handleStage,
    handleUnstage,
    openCommittedDiff,
    requestDiscardEntry,
    revealInExplorer,
    toggleSection,
    toggleSubmodule,
    visibleListRowsBySection,
    worktreePath
  } = controller
  const isBranchScope = activeScope?.id === 'branch'
  const model = (() =>
    isBranchScope
      ? buildSourceControlBranchListModel(filteredBranchEntries)
      : buildSourceControlUncommittedListModel({
          displaySections,
          collapsedSections,
          visibleListRowsBySection
        }))()

  if (!activeWorktree || !worktreePath) {
    return null
  }
  const currentWorktreeId = activeWorktree.id

  const renderRow = (row: SourceControlListRow): React.ReactNode => {
    if (row.kind === 'group') {
      return (
        <SourceControlGroupRow
          label={getSourceControlGroupLabel(row.section)}
          count={row.section.items.length}
          conflictCount={
            row.section.items.filter((entry) => entry.conflictStatus === 'unresolved').length
          }
          isExpanded={!collapsedSections.has(row.section.id)}
          onToggle={() => toggleSection(row.section.id)}
          actions={
            <SourceControlUncommittedGroupActions controller={controller} section={row.section} />
          }
        />
      )
    }
    if (row.kind === 'submodule-placeholder') {
      return (
        // Why: rows sit one level under their working-tree group row.
        <SubmodulePlaceholderRow depth={row.depth + 1} state={row.state} message={row.message} />
      )
    }
    if (row.kind === 'branch') {
      return (
        <BranchEntryRow
          entry={row.entry}
          currentWorktreeId={currentWorktreeId}
          worktreePath={worktreePath}
          onRevealInExplorer={revealInExplorer}
          connectionId={activeConnectionId}
          onOpen={(event) => openCommittedDiff(row.entry, event)}
          commentCount={diffCommentCountByPath.get(row.entry.path) ?? 0}
        />
      )
    }
    const entry = row.entry
    const isSubmoduleExpandable = isExpandableSubmoduleEntry(entry)
    return (
      <UncommittedEntryRow
        entry={entry}
        currentWorktreeId={currentWorktreeId}
        worktreePath={worktreePath}
        depth={entry.submoduleRoot ? 2 : 1}
        isOpenFile={activeOpenRowKeys.has(row.key)}
        onRevealInExplorer={revealInExplorer}
        connectionId={activeConnectionId}
        onOpen={handleOpenDiff}
        onStage={handleStage}
        onUnstage={handleUnstage}
        onDiscard={requestDiscardEntry}
        commentCount={diffCommentCountByPath.get(entry.path) ?? 0}
        isSubmoduleExpanded={
          isSubmoduleExpandable
            ? expandedSubmoduleKeys.has(getSubmoduleExpansionKey(entry))
            : undefined
        }
        onToggleSubmodule={isSubmoduleExpandable ? toggleSubmodule : undefined}
      />
    )
  }

  return (
    <LegendList<SourceControlListRow>
      {...LEGEND_LIST_SCROLL_AREA_PROPS}
      className="pt-1"
      data={model.rows}
      keyExtractor={getSourceControlListRowKey}
      getItemType={getSourceControlListRowType}
      estimatedItemSize={SOURCE_CONTROL_LIST_ROW_ESTIMATE_PX}
      stickyHeaderIndices={model.stickyHeaderIndices}
      ListHeaderComponent={header}
      ListFooterComponent={footer}
      renderItem={({ item }: LegendListRenderItemProps<SourceControlListRow>) => renderRow(item)}
    />
  )
}

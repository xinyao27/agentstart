import type { ProjectGroup } from '@agentstart/protocol/project/group-model'
import {
  LegendList,
  type LegendListRef,
  type LegendListRenderItemProps
} from '@legendapp/list/react'
import { useRef } from 'react'
import { translate } from '~renderer/i18n/i18n'
import { useAppStore } from '~renderer/store/state'

import { getSidebarRuntimeLabel } from '../host-navigation'
import { LEGEND_LIST_SCROLL_AREA_PROPS } from '../list-scroll-area'
import {
  getWorkspaceSidebarRowKey,
  type WorkspaceSidebarProjectedRow
} from '../workspace-sidebar-row-projection'
import { areWorkspaceSidebarRowsEqual, getLegendListRowType } from './row-model'
import { useActiveRow } from './use-active-row'
import { useFolderPathStatus } from './use-folder-path-status'
import { useHeaderModel } from './use-header-model'
import { useViewportDrag } from './use-viewport-drag'
import { useViewportScroll } from './use-viewport-scroll'
import { useViewportScrollRoot } from './use-viewport-scroll-root'
import { ViewportDropIndicators } from './viewport-drop-indicators'
import { ViewportHeaderRow } from './viewport-header-row'
import { WORKTREE_SIDEBAR_CONTENT_STYLE, WORKTREE_SIDEBAR_SCROLL_STYLE } from './viewport-layout'
import type { LegendWorktreeViewportProps } from './viewport-props'
import { ViewportWorkspaceRow } from './viewport-workspace-row'

const EMPTY_PROJECT_GROUPS: readonly ProjectGroup[] = []
export function LegendWorktreeViewport({
  navigationSurface,
  rows,
  activeWorktreeId,
  currentWorktreeId,
  groupBy,
  projectOrderBy,
  toggleGroup,
  collapsedGroups,
  handleCreateForRepo,
  handleOpenRepoSettings,
  handleOpenWorktreeVisibility,
  handleShowImportedWorktrees,
  handleKeepImportedWorktreesHidden,
  importedWorktreesByRepo,
  importedWorktreeCardActionState,
  handleImportNewExternalWorktree,
  handleImportAllNewExternalWorktrees,
  handleKeepNewExternalWorktreeInboxHidden,
  handleOpenSuppressExternalWorktreeInbox,
  newExternalWorktreeInboxActionState,
  handleRemoveProject,
  handleCreateGroupFromRepo,
  handleMoveProjectToGroup,
  handleRemoveProjectFromGroup,
  handleRenameProjectGroup,
  handleDeleteProjectGroup,
  handleCreateFolderWorkspace,
  activeModal,
  pendingRevealWorktree,
  pendingRevealSidebarRow,
  clearPendingRevealWorktreeId,
  clearPendingRevealSidebarRow,
  agentSendTargetWorktreeId,
  worktrees,
  folderWorkspaces,
  selectedWorktreeIds,
  selectedWorktrees,
  onSelectionGesture,
  onContextMenuSelect,
  repoMap,
  worktreeMap,
  worktreeLineageById,
  workspaceLineageByChildKey,
  repoOrder,
  allRepoIds,
  onReorderHostSections,
  onHostDragActiveChange,
  prCache,
  hostedReviewCache,
  workspaceStatuses,
  projectGrouping,
  projectGroups = EMPTY_PROJECT_GROUPS,
  onMoveWorktreeToStatus,
  onMoveWorktreesToStatus,
  onMoveWorktreesToStatusAtIndex,
  onPinWorktree,
  onPinWorktrees,
  onReorderWorktrees,
  scrollOffsetRef
}: LegendWorktreeViewportProps) {
  const legendListRef = useRef<LegendListRef>(null)
  const { scrollRef, scrollOffset, markScrollMovement, setScrollRoot } =
    useViewportScrollRoot(scrollOffsetRef)
  const runtimeLabel = navigationSurface ? getSidebarRuntimeLabel() : null
  const keybindings = useAppStore((state) => state.keybindings)
  const settings = useAppStore((state) => state.settings)
  const {
    renderRows,
    workspaceRows: workspaceSidebarRows,
    projectWorkspaceRails,
    folderBackedProjectGroupIds,
    orderedHostIds,
    hostDrag,
    canReorderRepoHeaders,
    canReorderProjectGroupHeaders,
    sidebarRepoHeaderIdsByBucket,
    sidebarProjectGroupHeaderIdsByBucket,
    repoHeaderIndexByRepoId,
    repoHeaderBucketByRepoId,
    projectGroupHeaderIndexByGroupId,
    projectGroupHeaderBucketByGroupId,
    repoHeaderSectionEndByRepoId,
    projectGroupHeaderSectionEndByGroupId,
    firstHeaderIndex,
    stickyHeaderIndexes,
    repoDrag,
    projectGroupDrag
  } = useHeaderModel({
    rows,
    groupBy,
    projectOrderBy,
    projectGroups,
    allRepoIds,
    repoMap,
    scrollRef,
    onReorderHostSections,
    onHostDragActiveChange
  })
  const activeRow = useActiveRow(rows, activeWorktreeId)
  const viewportDrag = useViewportDrag({
    props: {
      rows,
      worktrees,
      worktreeMap,
      worktreeLineageById,
      repoMap,
      workspaceStatuses,
      groupBy,
      selectedWorktreeIds,
      selectedWorktrees,
      onMoveWorktreeToStatus,
      onMoveWorktreesToStatus,
      onMoveWorktreesToStatusAtIndex,
      onPinWorktree,
      onPinWorktrees,
      onReorderWorktrees,
      activeWorktreeId,
      currentWorktreeId
    },
    workspaceRows: workspaceSidebarRows,
    primaryActiveRowKey: activeRow.primaryRowKey,
    scrollRef,
    markScrollMovement
  })
  const {
    state: worktreeDragState,
    dragOverStatus,
    pinDragOver,
    nativeLineageDropTargetId,
    pointerDragRef: worktreePointerDragRef,
    groupKeyByRowKey,
    groupIndexByRowKey,
    clear: clearWorktreeDrag,
    handleWorktreeRowPointerDown,
    handleWorktreeRowClickCapture,
    handleWorktreeCardDragStart,
    handleWorktreeDrop,
    handleWorktreeDragOver,
    activeDescendantId,
    handleViewableItemsChanged,
    handleWorkspaceStatusDragOver,
    handleWorkspaceStatusDragLeave,
    handleWorkspacePinDragOver,
    handleWorkspacePinDragLeave,
    handleWorkspaceStatusDrop
  } = viewportDrag
  const getCachedFolderWorkspacePathStatus = useFolderPathStatus({
    allRepoIds,
    repoMap,
    projectGroups,
    folderWorkspaces
  })

  const {
    highlightedRowKey: highlightedRevealRowKey,
    handleContainerKeyDown,
    handleScrollPointerDown,
    setLegendListScrollRootRef
  } = useViewportScroll({
    props: {
      pendingRevealWorktree,
      pendingRevealSidebarRow,
      agentSendTargetWorktreeId,
      groupBy,
      worktrees,
      folderWorkspaces,
      repoMap,
      prCache,
      worktreeLineageById,
      worktreeMap,
      clearPendingRevealWorktreeId,
      clearPendingRevealSidebarRow,
      toggleGroup,
      collapsedGroups,
      workspaceStatuses,
      projectGroups,
      repoOrder,
      projectOrderBy,
      activeWorktreeId,
      activeModal,
      scrollOffsetRef
    },
    projectGrouping,
    settings,
    keybindings,
    renderRows,
    workspaceRows: workspaceSidebarRows,
    legendListRef,
    scrollRef,
    clearWorktreeDrag,
    markScrollMovement,
    setScrollRoot
  })
  return (
    <div
      data-worktree-sidebar-container
      data-contextual-tour-target="workspace-list"
      className="relative min-h-0 flex-1"
    >
      <ViewportDropIndicators
        scrollOffset={scrollOffset}
        repo={{
          isEnabled: canReorderRepoHeaders,
          draggingId: repoDrag.state.draggingRepoId,
          y: repoDrag.state.dropIndicatorY
        }}
        projectGroup={{
          isEnabled: canReorderProjectGroupHeaders,
          draggingId: projectGroupDrag.state.draggingGroupId,
          y: projectGroupDrag.state.dropIndicatorY
        }}
        host={{
          draggingId: hostDrag.state.draggingHostId,
          y: hostDrag.state.dropIndicatorY
        }}
        worktree={{
          draggingId: worktreeDragState.draggingWorktreeId,
          y: worktreeDragState.dropIndicatorY
        }}
      />
      <LegendList<WorkspaceSidebarProjectedRow>
        {...LEGEND_LIST_SCROLL_AREA_PROPS}
        ref={legendListRef}
        refScrollView={setLegendListScrollRootRef}
        data={workspaceSidebarRows}
        keyExtractor={getWorkspaceSidebarRowKey}
        getItemType={getLegendListRowType}
        itemsAreEqual={areWorkspaceSidebarRowsEqual}
        initialScrollOffset={scrollOffset}
        maintainVisibleContentPosition={false}
        stickyHeaderIndices={stickyHeaderIndexes}
        onViewableItemsChanged={handleViewableItemsChanged}
        renderItem={({
          item: projected,
          index
        }: LegendListRenderItemProps<WorkspaceSidebarProjectedRow>) =>
          projected.row.type === 'host-header' || projected.row.type === 'header' ? (
            <ViewportHeaderRow
              projected={projected}
              index={index}
              renderRows={renderRows}
              firstHeaderIndex={firstHeaderIndex}
              groupBy={groupBy}
              workspaceStatuses={workspaceStatuses}
              collapsedGroups={collapsedGroups}
              repoMap={repoMap}
              projectGrouping={projectGrouping}
              importedWorktreesByRepo={importedWorktreesByRepo}
              importedActionState={importedWorktreeCardActionState}
              projectGroups={projectGroups}
              runtimeLabel={runtimeLabel}
              navigationSurface={navigationSurface}
              highlightedRowKey={highlightedRevealRowKey}
              projectWorkspaceRails={projectWorkspaceRails}
              orderedHostIds={orderedHostIds}
              hostDrag={hostDrag}
              canReorderRepoHeaders={canReorderRepoHeaders}
              canReorderProjectGroupHeaders={canReorderProjectGroupHeaders}
              sidebarRepoHeaderIdsByBucket={sidebarRepoHeaderIdsByBucket}
              sidebarProjectGroupHeaderIdsByBucket={sidebarProjectGroupHeaderIdsByBucket}
              repoHeaderIndexByRepoId={repoHeaderIndexByRepoId}
              repoHeaderBucketByRepoId={repoHeaderBucketByRepoId}
              projectGroupHeaderIndexByGroupId={projectGroupHeaderIndexByGroupId}
              projectGroupHeaderBucketByGroupId={projectGroupHeaderBucketByGroupId}
              repoHeaderSectionEndByRepoId={repoHeaderSectionEndByRepoId}
              projectGroupHeaderSectionEndByGroupId={projectGroupHeaderSectionEndByGroupId}
              repoDrag={repoDrag}
              projectGroupDrag={projectGroupDrag}
              getPathStatus={getCachedFolderWorkspacePathStatus}
              dragOverStatus={dragOverStatus}
              isPinDragOver={pinDragOver}
              onToggle={toggleGroup}
              onStatusDragOver={handleWorkspaceStatusDragOver}
              onStatusDragLeave={handleWorkspaceStatusDragLeave}
              onStatusDrop={handleWorkspaceStatusDrop}
              onPinDragOver={handleWorkspacePinDragOver}
              onPinDragLeave={handleWorkspacePinDragLeave}
              handleCreateForRepo={handleCreateForRepo}
              handleOpenRepoSettings={handleOpenRepoSettings}
              handleOpenWorktreeVisibility={handleOpenWorktreeVisibility}
              handleShowImportedWorktrees={handleShowImportedWorktrees}
              handleKeepImportedWorktreesHidden={handleKeepImportedWorktreesHidden}
              handleRemoveProject={handleRemoveProject}
              handleCreateGroupFromRepo={handleCreateGroupFromRepo}
              handleMoveProjectToGroup={handleMoveProjectToGroup}
              handleRemoveProjectFromGroup={handleRemoveProjectFromGroup}
              handleRenameProjectGroup={handleRenameProjectGroup}
              handleDeleteProjectGroup={handleDeleteProjectGroup}
              handleCreateFolderWorkspace={handleCreateFolderWorkspace}
            />
          ) : (
            <ViewportWorkspaceRow
              projected={projected}
              index={index}
              projectRail={projectWorkspaceRails.get(index)}
              groupBy={groupBy}
              folderBackedProjectGroupIds={folderBackedProjectGroupIds}
              groupKeyByRowKey={groupKeyByRowKey}
              groupIndexByRowKey={groupIndexByRowKey}
              agentSendTargetWorktreeId={agentSendTargetWorktreeId}
              draggingWorktreeId={worktreeDragState.draggingWorktreeId}
              previewOffsetsByWorktreeId={worktreeDragState.previewOffsetsByWorktreeId}
              pointerLineageDropTargetId={
                worktreePointerDragRef.current?.latestStatusDropTarget?.target.lineageParentId ??
                null
              }
              nativeLineageDropTargetId={nativeLineageDropTargetId}
              activeWorktreeId={activeWorktreeId}
              currentWorktreeId={currentWorktreeId}
              selectedWorktreeIds={selectedWorktreeIds}
              selectedWorktrees={selectedWorktrees}
              highlightedRowKey={highlightedRevealRowKey}
              getActiveSurfaceVariant={activeRow.getSurfaceVariant}
              onImmediateActivate={activeRow.activate}
              onSelectionGesture={onSelectionGesture}
              onContextMenuSelect={onContextMenuSelect}
              onCardDragStart={handleWorktreeCardDragStart}
              onCardDragEnd={clearWorktreeDrag}
              onToggleLineage={toggleGroup}
              onRowPointerDown={handleWorktreeRowPointerDown}
              onRowClickCapture={handleWorktreeRowClickCapture}
              importedActionState={importedWorktreeCardActionState}
              inboxActionState={newExternalWorktreeInboxActionState}
              handleShowImportedWorktrees={handleShowImportedWorktrees}
              handleKeepImportedWorktreesHidden={handleKeepImportedWorktreesHidden}
              handleImportNewExternalWorktree={handleImportNewExternalWorktree}
              handleKeepNewExternalWorktreeInboxHidden={handleKeepNewExternalWorktreeInboxHidden}
              handleImportAllNewExternalWorktrees={handleImportAllNewExternalWorktrees}
              handleOpenSuppressExternalWorktreeInbox={handleOpenSuppressExternalWorktreeInbox}
              workspaceLineageByChildKey={workspaceLineageByChildKey}
              worktreeLineageById={worktreeLineageById}
              worktreeMap={worktreeMap}
              repoMap={repoMap}
              hostedReviewCache={hostedReviewCache}
              prCache={prCache}
              settings={settings}
              getFolderPathStatus={getCachedFolderWorkspacePathStatus}
              workspaceStatuses={workspaceStatuses}
              onStatusDragOver={handleWorkspaceStatusDragOver}
              onStatusDragLeave={handleWorkspaceStatusDragLeave}
              onStatusDrop={handleWorkspaceStatusDrop}
            />
          )
        }
        role="listbox"
        aria-label={translate('auto.components.sidebar.WorktreeList.bfbedc547b', 'Worktrees')}
        aria-orientation="vertical"
        aria-multiselectable={true}
        aria-activedescendant={activeDescendantId}
        tabIndex={0}
        data-worktree-sidebar=""
        className="h-full overflow-x-hidden"
        contentContainerStyle={WORKTREE_SIDEBAR_CONTENT_STYLE}
        style={WORKTREE_SIDEBAR_SCROLL_STYLE}
        onKeyDown={handleContainerKeyDown}
        onScroll={markScrollMovement}
        onPointerDown={handleScrollPointerDown}
        onTouchMove={markScrollMovement}
        onWheel={markScrollMovement}
        onDragOver={handleWorktreeDragOver}
        onDrop={handleWorktreeDrop}
      />
    </div>
  )
}

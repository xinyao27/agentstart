import { useQueryClient } from '@tanstack/react-query'
import type React from 'react'
import { translate } from '~renderer/i18n/i18n'
import { XCircle as CircleX } from '~renderer/icons/hugeicons'
import { Button } from '~renderer/ui/button'
import { ScrollArea } from '~renderer/ui/scroll-area'

import { ProjectGroupDeleteDialog } from './project-group-delete-dialog'
import { ProjectGroupNameDialog } from './project-group-name-dialog'
import SuppressExternalWorktreeInboxDialog from './suppress-external-worktree-inbox-dialog'
import { useExternalWorktrees } from './worktree-list/use-external-worktrees'
import { useListReveal } from './worktree-list/use-list-reveal'
import { getListScope, useListRows } from './worktree-list/use-list-rows'
import { useListState } from './worktree-list/use-list-state'
import { useProjectGroupActions } from './worktree-list/use-project-group-actions'
import { useWorktreeSelection } from './worktree-list/use-selection'
import { useWorkspaceOrderActions } from './worktree-list/use-workspace-order-actions'
import { LegendWorktreeViewport } from './worktree-list/viewport'

type WorktreeListProps = {
  navigationSurface: boolean
  projectId?: string
  scrollOffsetRef: React.MutableRefObject<number>
}

function WorktreeList({ navigationSurface, projectId, scrollOffsetRef }: WorktreeListProps) {
  // ── Granular selectors (each is a primitive or shallow-stable ref) ──
  const queryClient = useQueryClient()
  const listState = useListState(projectId)
  const {
    detectedWorktreesByRepo,
    repoMap,
    worktreeMap,
    worktreeLineageById,
    workspaceLineageByChildKey,
    currentWorktreeId: currentSidebarWorktreeId,
    groupBy,
    workspaceStatuses,
    projectOrderBy,
    filterRepoIds,
    activeModal,
    pendingRevealWorktree,
    pendingRevealSidebarRow,
    clearPendingRevealWorktreeId,
    clearPendingRevealSidebarRow,
    agentSendTargetWorktreeId,
    prCache,
    hostedReviewCache,
    worktrees,
    toggleGroup,
    repos,
    projectGrouping,
    projectGroups,
    folderWorkspaces
  } = listState
  const listScope = getListScope(listState, projectId)

  const externalWorktrees = useExternalWorktrees({
    queryClient,
    repos,
    visibleRepos: listScope.visibleRepos,
    detectedByRepo: detectedWorktreesByRepo,
    filterRepoIds
  })
  const importedWorktreesByRepo = externalWorktrees.importedByRepo
  const newExternalWorktreesInboxByRepo = externalWorktrees.inboxByRepo

  const {
    effectiveCollapsedGroups,
    repoOrder,
    placeholderRepoIds,
    rows,
    sectionRows,
    renderedRowKeys: renderedSidebarRowKeys,
    renderedWorktrees,
    renderedWorktreeIds,
    allRepoIds,
    viewportResetKey,
    reorderHosts: handleReorderHostSections,
    setHostDragActive
  } = useListRows({
    projectId,
    state: listState,
    scope: listScope,
    importedByRepo: importedWorktreesByRepo,
    inboxByRepo: newExternalWorktreesInboxByRepo
  })

  const {
    selectedIds: selectedWorktreeIds,
    selectedWorktrees,
    onSelectionGesture: updateSelectionForGesture,
    onContextMenuSelect: selectForContextMenu
  } = useWorktreeSelection(renderedWorktrees, renderedWorktreeIds)

  const selectedSidebarWorktreeId = currentSidebarWorktreeId

  const {
    importedActionState: importedWorktreeCardActionState,
    inboxActionState: newExternalWorktreeInboxActionState,
    suppressedRepoId: suppressExternalWorktreeInboxRepoId,
    closeSuppress: closeSuppressExternalWorktreeInbox,
    showImported: handleShowImportedWorktrees,
    keepImportedHidden: handleKeepImportedWorktreesHidden,
    importOne: handleImportNewExternalWorktree,
    importAll: handleImportAllNewExternalWorktrees,
    keepInboxHidden: handleKeepNewExternalWorktreeInboxHidden,
    requestSuppress: handleOpenSuppressExternalWorktreeInbox,
    confirmSuppress: handleConfirmSuppressExternalWorktreeInbox,
    createForRepo: handleCreateForRepo,
    openVisibility: handleOpenWorktreeVisibility,
    openRepoSettings: handleOpenRepoSettings,
    removeProject: handleRemoveProject
  } = externalWorktrees

  const {
    nameDialog: projectGroupNameDialog,
    deleteDialog: projectGroupDeleteDialog,
    deleteProjectCount: projectGroupDeleteProjectCount,
    deleteProjectNames: projectGroupDeleteProjectNames,
    removesContainedProjects: projectGroupRemoveContainedProjects,
    closeNameDialog: closeProjectGroupNameDialog,
    closeDeleteDialog: closeProjectGroupDeleteDialog,
    setRemovesContainedProjects: setProjectGroupRemoveContainedProjects,
    createFromRepo: handleCreateGroupFromRepo,
    moveToGroup: handleMoveProjectToGroup,
    removeFromGroup: handleRemoveProjectFromGroup,
    rename: handleRenameProjectGroup,
    requestDelete: handleDeleteProjectGroup,
    createFolderWorkspace: handleCreateFolderWorkspace,
    submitName: handleSubmitProjectGroupName,
    confirmDelete: handleConfirmDeleteProjectGroup
  } = useProjectGroupActions({ projectGroups, repos, repoMap })

  const {
    moveOne: moveWorktreeToStatus,
    moveMany: moveWorktreesToStatus,
    moveManyAtIndex: moveWorktreesToStatusAtIndex,
    pinOne: pinWorktree,
    pinMany: pinWorktrees,
    reorder: reorderWorktrees
  } = useWorkspaceOrderActions({ worktreeMap, workspaceStatuses })

  const { hasFilters, clearFilters } = useListReveal({
    state: listState,
    renderedRowKeys: renderedSidebarRowKeys,
    renderedWorktreeIds
  })

  const filtersHideAllRows =
    hasFilters &&
    worktrees.length === 0 &&
    placeholderRepoIds.size === 0 &&
    importedWorktreesByRepo.size === 0
  // Why: Project Group headers can render before workspace rows load, but when
  // active filters hide everything the Clear Filters empty state must win.
  if (rows.length === 0 || filtersHideAllRows) {
    return (
      <div
        data-worktree-sidebar-container
        data-contextual-tour-target="workspace-list"
        className="relative min-h-0 flex-1"
      >
        <ScrollArea className="h-full">
          <div className="text-muted-foreground flex flex-col items-center gap-2 px-4 py-6 pl-5 text-center text-[11px]">
            <span>
              {translate('auto.components.sidebar.WorktreeList.b7acbf038b', 'No workspaces found')}
            </span>
            {hasFilters && (
              <Button
                variant="secondary"
                size="xs"
                onClick={clearFilters}
                className="bg-secondary/70 border-border/80 text-foreground hover:bg-accent focus-visible:bg-accent h-auto gap-1.5 border px-2.5 py-1 text-[11px]"
              >
                <CircleX className="size-3.5" />
                {translate('auto.components.sidebar.WorktreeList.370c6a55dd', 'Clear Filters')}
              </Button>
            )}
          </div>
        </ScrollArea>
      </div>
    )
  }

  return (
    <>
      <ProjectGroupNameDialog
        open={projectGroupNameDialog !== null}
        title={
          projectGroupNameDialog?.type === 'rename'
            ? translate('auto.components.sidebar.WorktreeList.f9dc6cc5d3', 'Rename Project Group')
            : translate('auto.components.sidebar.WorktreeList.13757c053c', 'New Project Group')
        }
        description={
          projectGroupNameDialog?.type === 'rename'
            ? translate(
                'auto.components.sidebar.WorktreeList.bc1460beb3',
                'Update the group name shown in the sidebar.'
              )
            : translate(
                'auto.components.sidebar.WorktreeList.d880ea0744',
                'Create a group and move this project into it.'
              )
        }
        initialName={
          projectGroupNameDialog?.type === 'rename'
            ? projectGroupNameDialog.currentName
            : projectGroupNameDialog
              ? `${projectGroupNameDialog.repo.displayName} group`
              : ''
        }
        confirmLabel={projectGroupNameDialog?.type === 'rename' ? 'Rename' : 'Create'}
        onOpenChange={(open) => {
          if (!open) {
            closeProjectGroupNameDialog()
          }
        }}
        onSubmit={handleSubmitProjectGroupName}
      />
      <SuppressExternalWorktreeInboxDialog
        open={suppressExternalWorktreeInboxRepoId !== null}
        repoDisplayName={
          suppressExternalWorktreeInboxRepoId
            ? (repos.find((repo) => repo.id === suppressExternalWorktreeInboxRepoId)?.displayName ??
              '')
            : ''
        }
        pending={
          suppressExternalWorktreeInboxRepoId
            ? (newExternalWorktreeInboxActionState.get(suppressExternalWorktreeInboxRepoId)
                ?.pending ?? false)
            : false
        }
        onOpenChange={(open) => {
          if (!open) {
            closeSuppressExternalWorktreeInbox()
          }
        }}
        onConfirm={() => {
          void handleConfirmSuppressExternalWorktreeInbox()
        }}
        onOpenRecovery={() => {
          if (!suppressExternalWorktreeInboxRepoId) {
            return
          }
          const projectId = suppressExternalWorktreeInboxRepoId
          closeSuppressExternalWorktreeInbox()
          handleOpenWorktreeVisibility(projectId)
        }}
      />
      <ProjectGroupDeleteDialog
        open={projectGroupDeleteDialog !== null}
        groupName={projectGroupDeleteDialog?.groupName ?? ''}
        projectCount={projectGroupDeleteProjectCount}
        projectNames={projectGroupDeleteProjectNames}
        removeContainedProjects={projectGroupRemoveContainedProjects}
        onRemoveContainedProjectsChange={(removeContainedProjects) => {
          setProjectGroupRemoveContainedProjects(removeContainedProjects)
        }}
        onOpenChange={(open) => {
          if (!open) {
            closeProjectGroupDeleteDialog()
          }
        }}
        onConfirm={handleConfirmDeleteProjectGroup}
      />
      <LegendWorktreeViewport
        key={viewportResetKey}
        navigationSurface={navigationSurface}
        rows={sectionRows}
        activeWorktreeId={selectedSidebarWorktreeId}
        currentWorktreeId={currentSidebarWorktreeId}
        groupBy={groupBy}
        projectOrderBy={projectOrderBy}
        toggleGroup={toggleGroup}
        collapsedGroups={effectiveCollapsedGroups}
        handleCreateForRepo={handleCreateForRepo}
        handleOpenRepoSettings={handleOpenRepoSettings}
        handleOpenWorktreeVisibility={handleOpenWorktreeVisibility}
        handleShowImportedWorktrees={handleShowImportedWorktrees}
        handleKeepImportedWorktreesHidden={handleKeepImportedWorktreesHidden}
        importedWorktreesByRepo={importedWorktreesByRepo}
        importedWorktreeCardActionState={importedWorktreeCardActionState}
        handleImportNewExternalWorktree={handleImportNewExternalWorktree}
        handleImportAllNewExternalWorktrees={handleImportAllNewExternalWorktrees}
        handleKeepNewExternalWorktreeInboxHidden={handleKeepNewExternalWorktreeInboxHidden}
        handleOpenSuppressExternalWorktreeInbox={handleOpenSuppressExternalWorktreeInbox}
        newExternalWorktreeInboxActionState={newExternalWorktreeInboxActionState}
        handleRemoveProject={handleRemoveProject}
        handleCreateGroupFromRepo={handleCreateGroupFromRepo}
        handleMoveProjectToGroup={handleMoveProjectToGroup}
        handleRemoveProjectFromGroup={handleRemoveProjectFromGroup}
        handleRenameProjectGroup={handleRenameProjectGroup}
        handleDeleteProjectGroup={handleDeleteProjectGroup}
        handleCreateFolderWorkspace={handleCreateFolderWorkspace}
        activeModal={activeModal}
        pendingRevealWorktree={pendingRevealWorktree}
        pendingRevealSidebarRow={pendingRevealSidebarRow}
        clearPendingRevealWorktreeId={clearPendingRevealWorktreeId}
        clearPendingRevealSidebarRow={clearPendingRevealSidebarRow}
        agentSendTargetWorktreeId={agentSendTargetWorktreeId}
        worktrees={worktrees}
        folderWorkspaces={folderWorkspaces}
        selectedWorktreeIds={selectedWorktreeIds}
        selectedWorktrees={selectedWorktrees}
        onSelectionGesture={updateSelectionForGesture}
        onContextMenuSelect={selectForContextMenu}
        repoMap={repoMap}
        worktreeMap={worktreeMap}
        worktreeLineageById={worktreeLineageById}
        workspaceLineageByChildKey={workspaceLineageByChildKey}
        repoOrder={repoOrder}
        allRepoIds={allRepoIds}
        onReorderHostSections={handleReorderHostSections}
        onHostDragActiveChange={setHostDragActive}
        prCache={prCache}
        hostedReviewCache={hostedReviewCache}
        workspaceStatuses={workspaceStatuses}
        projectGrouping={projectGrouping}
        projectGroups={projectGroups}
        onMoveWorktreeToStatus={moveWorktreeToStatus}
        onMoveWorktreesToStatus={moveWorktreesToStatus}
        onMoveWorktreesToStatusAtIndex={moveWorktreesToStatusAtIndex}
        onPinWorktree={pinWorktree}
        onPinWorktrees={pinWorktrees}
        onReorderWorktrees={reorderWorktrees}
        scrollOffsetRef={scrollOffsetRef}
      />
    </>
  )
}

export default WorktreeList

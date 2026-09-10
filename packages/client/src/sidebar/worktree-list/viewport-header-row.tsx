import type { WorkspaceStatus } from '@agentstart/protocol/workspace/status/model'
import type React from 'react'
import { cn } from '~renderer/ui/class-names'

import type { useHostHeaderDrag } from '../host-header-drag'
import type { useProjectGroupHeaderDrag } from '../project-group-header-drag'
import type { useRepoHeaderDrag } from '../project-header-drag'
import type { getProjectWorkspaceRails } from '../project-workspace-rail'
import type { WorkspaceSidebarProjectedRow } from '../workspace-sidebar-row-projection'
import { getWorkspaceStatusFromGroupKey } from '../workspace-status'
import type { ImportedWorktreesCardCandidate } from './groups'
import { HeaderRow } from './header-row'
import { getRepoIdsFromHeaderRowKey } from './reveal'
import { HostSectionHeader } from './section-rows'
import type { useFolderPathStatus } from './use-folder-path-status'
import type { LegendWorktreeViewportProps } from './viewport-props'
import { shouldUseHeaderTopSpacing, type RenderRow } from './virtual-rows'

type HeaderCallbacks = Pick<
  LegendWorktreeViewportProps,
  | 'handleCreateForRepo'
  | 'handleOpenRepoSettings'
  | 'handleOpenWorktreeVisibility'
  | 'handleShowImportedWorktrees'
  | 'handleKeepImportedWorktreesHidden'
  | 'handleRemoveProject'
  | 'handleCreateGroupFromRepo'
  | 'handleMoveProjectToGroup'
  | 'handleRemoveProjectFromGroup'
  | 'handleRenameProjectGroup'
  | 'handleDeleteProjectGroup'
  | 'handleCreateFolderWorkspace'
>

export function ViewportHeaderRow(
  props: HeaderCallbacks & {
    projected: WorkspaceSidebarProjectedRow
    index: number
    renderRows: readonly RenderRow[]
    firstHeaderIndex: number
    groupBy: LegendWorktreeViewportProps['groupBy']
    workspaceStatuses: LegendWorktreeViewportProps['workspaceStatuses']
    collapsedGroups: LegendWorktreeViewportProps['collapsedGroups']
    repoMap: LegendWorktreeViewportProps['repoMap']
    projectGrouping: LegendWorktreeViewportProps['projectGrouping']
    importedWorktreesByRepo: LegendWorktreeViewportProps['importedWorktreesByRepo']
    importedActionState: LegendWorktreeViewportProps['importedWorktreeCardActionState']
    projectGroups: NonNullable<LegendWorktreeViewportProps['projectGroups']>
    runtimeLabel: string | null
    navigationSurface: boolean
    highlightedRowKey: string | null
    projectWorkspaceRails: ReturnType<typeof getProjectWorkspaceRails>
    orderedHostIds: readonly string[]
    hostDrag: ReturnType<typeof useHostHeaderDrag>
    canReorderRepoHeaders: boolean
    canReorderProjectGroupHeaders: boolean
    sidebarRepoHeaderIdsByBucket: ReadonlyMap<string, readonly string[]>
    sidebarProjectGroupHeaderIdsByBucket: ReadonlyMap<string, readonly string[]>
    repoHeaderIndexByRepoId: ReadonlyMap<string, number>
    repoHeaderBucketByRepoId: ReadonlyMap<string, string>
    projectGroupHeaderIndexByGroupId: ReadonlyMap<string, number>
    projectGroupHeaderBucketByGroupId: ReadonlyMap<string, string>
    repoHeaderSectionEndByRepoId: ReadonlyMap<string, number>
    projectGroupHeaderSectionEndByGroupId: ReadonlyMap<string, number>
    repoDrag: ReturnType<typeof useRepoHeaderDrag>
    projectGroupDrag: ReturnType<typeof useProjectGroupHeaderDrag>
    getPathStatus: ReturnType<typeof useFolderPathStatus>
    dragOverStatus: WorkspaceStatus | null
    isPinDragOver: boolean
    onToggle: (key: string) => void
    onStatusDragOver: (event: React.DragEvent<HTMLElement>, status: WorkspaceStatus) => void
    onStatusDragLeave: (event: React.DragEvent<HTMLElement>) => void
    onStatusDrop: (event: React.DragEvent<HTMLElement>, status: WorkspaceStatus) => void
    onPinDragOver: (event: React.DragEvent<HTMLElement>) => void
    onPinDragLeave: (event: React.DragEvent<HTMLElement>) => void
  }
): React.JSX.Element {
  const row = props.projected.row
  const hasTopSpacing = shouldUseHeaderTopSpacing({
    rows: props.renderRows,
    index: props.projected.localIndex,
    firstHeaderIndex: props.firstHeaderIndex
  })
  if (row.type === 'host-header') {
    return (
      <div
        role="presentation"
        data-worktree-virtual-row
        data-worktree-virtual-row-key={props.projected.key}
        data-worktree-sticky-header=""
        data-index={props.index}
        className={cn('relative z-30 bg-sidebar', hasTopSpacing && 'pt-1')}
      >
        <HostSectionHeader
          row={row}
          onToggle={() => props.onToggle(row.key)}
          onDragPointerDown={
            props.orderedHostIds.length > 1
              ? (event) => props.hostDrag.onHandlePointerDown(event, row.hostId)
              : undefined
          }
          dragging={props.hostDrag.state.draggingHostId === row.hostId}
        />
      </div>
    )
  }
  if (row.type !== 'header') {
    throw new Error('ViewportHeaderRow requires a header row')
  }
  const repoId = props.groupBy === 'repo' ? row.repo?.id : undefined
  const projectGroupId =
    props.groupBy === 'repo' && !row.repo && typeof row.projectGroup?.id === 'string'
      ? row.projectGroup.id
      : undefined
  const repoBucket = repoId ? props.repoHeaderBucketByRepoId.get(repoId) : undefined
  const projectGroupBucket = projectGroupId
    ? props.projectGroupHeaderBucketByGroupId.get(projectGroupId)
    : undefined
  const importedCandidates: ImportedWorktreesCardCandidate[] = []
  if (repoId) {
    for (const candidateRepoId of getRepoIdsFromHeaderRowKey(
      row.key,
      props.repoMap,
      props.projectGrouping
    )) {
      const candidate = props.importedWorktreesByRepo.get(candidateRepoId)
      if (candidate) {
        importedCandidates.push(candidate)
      }
    }
  }
  const pathStatus =
    projectGroupId && row.projectGroup && 'parentPath' in row.projectGroup
      ? props.getPathStatus({ scope: 'project-group', projectGroupId })
      : null
  return (
    <HeaderRow
      row={row}
      virtualKey={props.projected.key}
      index={props.index}
      hasTopSpacing={hasTopSpacing}
      groupBy={props.groupBy}
      workspaceStatus={
        props.groupBy === 'workspace-status'
          ? getWorkspaceStatusFromGroupKey(row.key, props.workspaceStatuses)
          : null
      }
      isCollapsed={props.collapsedGroups.has(row.key)}
      hasWorkspaceRail={props.projectWorkspaceRails.get(props.index)?.segment === 'header'}
      highlightedRowKey={props.highlightedRowKey}
      runtimeLabel={props.runtimeLabel}
      navigationSurface={props.navigationSurface}
      repoDrag={
        repoId
          ? {
              id: repoId,
              index: props.repoHeaderIndexByRepoId.get(repoId),
              bucket: repoBucket,
              sectionEnd: props.repoHeaderSectionEndByRepoId.get(repoId),
              isDraggable: Boolean(
                props.canReorderRepoHeaders &&
                repoBucket &&
                (props.sidebarRepoHeaderIdsByBucket.get(repoBucket)?.length ?? 0) > 1
              ),
              isDragging:
                props.canReorderRepoHeaders && props.repoDrag.state.draggingRepoId === repoId,
              onPointerDown: props.repoDrag.onHandlePointerDown
            }
          : undefined
      }
      projectGroupDrag={
        projectGroupId
          ? {
              id: projectGroupId,
              index: props.projectGroupHeaderIndexByGroupId.get(projectGroupId),
              bucket: projectGroupBucket,
              sectionEnd: props.projectGroupHeaderSectionEndByGroupId.get(projectGroupId),
              isDraggable: Boolean(
                props.canReorderProjectGroupHeaders &&
                projectGroupBucket &&
                (props.sidebarProjectGroupHeaderIdsByBucket.get(projectGroupBucket)?.length ?? 0) >
                  1
              ),
              isDragging:
                props.canReorderProjectGroupHeaders &&
                props.projectGroupDrag.state.draggingGroupId === projectGroupId,
              onPointerDown: props.projectGroupDrag.onHandlePointerDown
            }
          : undefined
      }
      pathStatus={pathStatus}
      importedCandidates={importedCandidates}
      importedActionState={props.importedActionState}
      dragOverStatus={props.dragOverStatus}
      isPinDragOver={props.isPinDragOver}
      projectGroups={props.projectGroups}
      onToggle={props.onToggle}
      onShowImported={props.handleShowImportedWorktrees}
      onKeepImportedHidden={props.handleKeepImportedWorktreesHidden}
      onStatusDragOver={props.onStatusDragOver}
      onStatusDragLeave={props.onStatusDragLeave}
      onStatusDrop={props.onStatusDrop}
      onPinDragOver={props.onPinDragOver}
      onPinDragLeave={props.onPinDragLeave}
      onOpenRepoSettings={props.handleOpenRepoSettings}
      onOpenWorktreeVisibility={props.handleOpenWorktreeVisibility}
      onCreateGroupFromRepo={props.handleCreateGroupFromRepo}
      onMoveProjectToGroup={props.handleMoveProjectToGroup}
      onRemoveProjectFromGroup={props.handleRemoveProjectFromGroup}
      onRemoveProject={props.handleRemoveProject}
      onCreateForRepo={props.handleCreateForRepo}
      onRenameProjectGroup={props.handleRenameProjectGroup}
      onDeleteProjectGroup={props.handleDeleteProjectGroup}
      onCreateFolderWorkspace={props.handleCreateFolderWorkspace}
    />
  )
}

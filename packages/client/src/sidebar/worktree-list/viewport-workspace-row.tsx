import type { WorkspaceStatus } from '@yiru/protocol/workspace/status/model'
import type React from 'react'
import type { AppState } from '~renderer/store/types'
import { cn } from '~renderer/ui/class-names'

import { ProjectWorkspaceRailRow } from '../project-workspace-rail'
import type { WorkspaceSidebarProjectedRow } from '../workspace-sidebar-row-projection'
import { getWorkspaceStatus } from '../workspace-status'
import type { ActiveSurfaceVariant } from '../worktree-card'
import { getWorktreeLegendRowTransform } from './drag-state'
import { FolderRow } from './folder-row'
import type { WorktreeGroupBy } from './groups'
import type { WorktreeItemRow } from './row-model'
import { SpecialRow } from './special-row'
import type { LegendWorktreeViewportProps } from './viewport-props'
import { WorktreeRow } from './worktree-row'

type WorkspaceCallbacks = Pick<
  LegendWorktreeViewportProps,
  | 'onSelectionGesture'
  | 'onContextMenuSelect'
  | 'handleShowImportedWorktrees'
  | 'handleKeepImportedWorktreesHidden'
  | 'handleImportNewExternalWorktree'
  | 'handleKeepNewExternalWorktreeInboxHidden'
  | 'handleImportAllNewExternalWorktrees'
  | 'handleOpenSuppressExternalWorktreeInbox'
>

export function ViewportWorkspaceRow(
  props: WorkspaceCallbacks & {
    projected: WorkspaceSidebarProjectedRow
    index: number
    projectRail?: {
      leftPx: number
      projectKey: string
      segment: 'header' | 'workspace'
      elbowWidthPx?: number
      endsSection?: boolean
    }
    groupBy: WorktreeGroupBy
    folderBackedProjectGroupIds: ReadonlySet<string>
    groupKeyByRowKey: ReadonlyMap<string, string>
    groupIndexByRowKey: ReadonlyMap<string, number>
    agentSendTargetWorktreeId: string | null
    draggingWorktreeId: string | null
    previewOffsetsByWorktreeId: ReadonlyMap<string, number>
    pointerLineageDropTargetId: string | null
    nativeLineageDropTargetId: string | null
    activeWorktreeId: string | null
    currentWorktreeId: string | null
    selectedWorktreeIds: LegendWorktreeViewportProps['selectedWorktreeIds']
    selectedWorktrees: LegendWorktreeViewportProps['selectedWorktrees']
    highlightedRowKey: string | null
    getActiveSurfaceVariant: (row: WorktreeItemRow) => ActiveSurfaceVariant
    onImmediateActivate: (worktreeId: string, rowKey: string | undefined) => void
    onCardDragStart: (
      event: React.DragEvent<HTMLDivElement>,
      worktreeId: string,
      draggedIds: readonly string[]
    ) => void
    onCardDragEnd: () => void
    onToggleLineage: (groupKey: string) => void
    onRowPointerDown: (
      event: React.PointerEvent<HTMLDivElement>,
      worktreeId: string,
      rowKey: string
    ) => void
    onRowClickCapture: (event: React.MouseEvent<HTMLDivElement>) => void
    importedActionState: LegendWorktreeViewportProps['importedWorktreeCardActionState']
    inboxActionState: LegendWorktreeViewportProps['newExternalWorktreeInboxActionState']
    workspaceLineageByChildKey: LegendWorktreeViewportProps['workspaceLineageByChildKey']
    worktreeLineageById: LegendWorktreeViewportProps['worktreeLineageById']
    worktreeMap: LegendWorktreeViewportProps['worktreeMap']
    repoMap: LegendWorktreeViewportProps['repoMap']
    hostedReviewCache: AppState['hostedReviewCache'] | null
    prCache: AppState['prCache'] | null
    settings: AppState['settings']
    getFolderPathStatus: (request: {
      scope: 'folder-workspace'
      folderWorkspaceId: string
    }) => ReturnType<AppState['getFreshFolderWorkspacePathStatus']>
    workspaceStatuses: LegendWorktreeViewportProps['workspaceStatuses']
    onStatusDragOver: (event: React.DragEvent<HTMLElement>, status: WorkspaceStatus) => void
    onStatusDragLeave: (event: React.DragEvent<HTMLElement>) => void
    onStatusDrop: (event: React.DragEvent<HTMLElement>, status: WorkspaceStatus) => void
  }
): React.JSX.Element {
  const row = props.projected.row
  if (row.type === 'header' || row.type === 'host-header') {
    throw new Error('ViewportWorkspaceRow requires a workspace row')
  }
  const handleLineageToggle = (
    groupKey: string,
    event: React.MouseEvent<HTMLButtonElement>
  ): void => {
    event.preventDefault()
    event.stopPropagation()
    props.onToggleLineage(groupKey)
  }
  const renderWorktreeRow = (
    itemRow: WorktreeItemRow,
    nested: boolean,
    lineageChildren?: React.ReactNode,
    forceActiveSurface = false
  ): React.JSX.Element => (
    <WorktreeRow
      key={itemRow.rowKey}
      row={itemRow}
      nested={nested}
      lineageChildren={lineageChildren}
      forceActiveSurface={forceActiveSurface}
      groupBy={props.groupBy}
      folderBackedProjectGroupIds={props.folderBackedProjectGroupIds}
      groupKeyByRowKey={props.groupKeyByRowKey}
      groupIndexByRowKey={props.groupIndexByRowKey}
      agentSendTargetWorktreeId={props.agentSendTargetWorktreeId}
      draggingWorktreeId={props.draggingWorktreeId}
      pointerLineageDropTargetId={props.pointerLineageDropTargetId}
      nativeLineageDropTargetId={props.nativeLineageDropTargetId}
      activeWorktreeId={props.activeWorktreeId}
      currentWorktreeId={props.currentWorktreeId}
      selectedWorktreeIds={props.selectedWorktreeIds}
      selectedWorktrees={props.selectedWorktrees}
      highlightedRowKey={props.highlightedRowKey}
      getActiveSurfaceVariant={props.getActiveSurfaceVariant}
      onImmediateActivate={props.onImmediateActivate}
      onSelectionGesture={props.onSelectionGesture}
      onContextMenuSelect={props.onContextMenuSelect}
      onCardDragStart={props.onCardDragStart}
      onCardDragEnd={props.onCardDragEnd}
      onLineageToggle={handleLineageToggle}
      onRowPointerDown={props.onRowPointerDown}
      onRowClickCapture={props.onRowClickCapture}
    />
  )
  const renderDescendants = (
    parent: WorktreeItemRow,
    descendants: readonly WorktreeItemRow[]
  ): React.ReactNode | undefined => {
    const childNodes: React.ReactNode[] = []
    let cursor = 0
    while (cursor < descendants.length) {
      const child = descendants[cursor]
      if (!child || child.depth !== parent.depth + 1) {
        cursor += 1
        continue
      }
      let nextSiblingIndex = cursor + 1
      while (
        nextSiblingIndex < descendants.length &&
        descendants[nextSiblingIndex]!.depth > child.depth
      ) {
        nextSiblingIndex += 1
      }
      childNodes.push(
        renderWorktreeRow(
          child,
          true,
          renderDescendants(child, descendants.slice(cursor + 1, nextSiblingIndex))
        )
      )
      cursor = nextSiblingIndex
    }
    return childNodes.length > 0 ? childNodes : undefined
  }
  if (row.type === 'lineage-group') {
    const [parent, ...children] = row.rows
    const previewOffset = parent
      ? (props.previewOffsetsByWorktreeId.get(parent.worktree.id) ?? 0)
      : 0
    return (
      <div
        role="presentation"
        data-worktree-virtual-row
        data-worktree-virtual-row-key={props.projected.key}
        data-index={props.index}
        className={cn(
          'relative',
          props.draggingWorktreeId !== null &&
            'transition-transform duration-150 ease-out will-change-transform'
        )}
        style={{ transform: getWorktreeLegendRowTransform(previewOffset) }}
      >
        {props.projectRail?.segment === 'workspace' ? (
          <ProjectWorkspaceRailRow {...props.projectRail} />
        ) : null}
        <div className="overflow-visible">
          {parent
            ? renderWorktreeRow(
                parent,
                false,
                renderDescendants(parent, children),
                children.some((child) => child.worktree.id === props.activeWorktreeId)
              )
            : null}
        </div>
      </div>
    )
  }
  if (
    row.type === 'imported-worktrees-card' ||
    row.type === 'new-external-worktrees-inbox' ||
    row.type === 'pending-creation'
  ) {
    return (
      <SpecialRow
        row={row}
        virtualKey={props.projected.key}
        index={props.index}
        importedActionState={props.importedActionState}
        inboxActionState={props.inboxActionState}
        onShowImported={props.handleShowImportedWorktrees}
        onKeepImportedHidden={props.handleKeepImportedWorktreesHidden}
        onImportInboxWorktree={props.handleImportNewExternalWorktree}
        onKeepInboxHidden={props.handleKeepNewExternalWorktreeInboxHidden}
        onImportAllInbox={props.handleImportAllNewExternalWorktrees}
        onSuppressInbox={props.handleOpenSuppressExternalWorktreeInbox}
      />
    )
  }
  if (row.type === 'folder-workspace') {
    return (
      <FolderRow
        row={row}
        virtualKey={props.projected.key}
        index={props.index}
        projectRail={props.projectRail}
        groupBy={props.groupBy}
        activeWorktreeId={props.activeWorktreeId}
        currentWorktreeId={props.currentWorktreeId}
        selectedWorktreeIds={props.selectedWorktreeIds}
        workspaceLineageByChildKey={props.workspaceLineageByChildKey}
        worktreeLineageById={props.worktreeLineageById}
        worktreeMap={props.worktreeMap}
        repoMap={props.repoMap}
        hostedReviewCache={props.hostedReviewCache}
        prCache={props.prCache}
        settings={props.settings}
        pathStatus={props.getFolderPathStatus({
          scope: 'folder-workspace',
          folderWorkspaceId: row.folderWorkspace.id
        })}
        onImmediateActivate={props.onImmediateActivate}
        onSelectionGesture={props.onSelectionGesture}
        onContextMenuSelect={props.onContextMenuSelect}
        onRowPointerDown={props.onRowPointerDown}
        onRowClickCapture={props.onRowClickCapture}
      />
    )
  }
  const workspaceStatus =
    props.groupBy === 'workspace-status'
      ? getWorkspaceStatus(row.worktree, props.workspaceStatuses)
      : null
  const previewOffset = props.previewOffsetsByWorktreeId.get(row.worktree.id) ?? 0
  return (
    <div
      role="presentation"
      data-worktree-virtual-row
      data-worktree-virtual-row-key={props.projected.key}
      data-index={props.index}
      data-workspace-status-drop-target={workspaceStatus ? '' : undefined}
      data-workspace-status={workspaceStatus ?? undefined}
      className={cn(
        'relative',
        props.draggingWorktreeId !== null &&
          'transition-transform duration-150 ease-out will-change-transform'
      )}
      style={{ transform: getWorktreeLegendRowTransform(previewOffset) }}
      onDragOver={
        workspaceStatus ? (event) => props.onStatusDragOver(event, workspaceStatus) : undefined
      }
      onDragLeave={workspaceStatus ? props.onStatusDragLeave : undefined}
      onDrop={workspaceStatus ? (event) => props.onStatusDrop(event, workspaceStatus) : undefined}
    >
      {props.projectRail?.segment === 'workspace' ? (
        <ProjectWorkspaceRailRow {...props.projectRail} />
      ) : null}
      {renderWorktreeRow(row, false)}
    </div>
  )
}

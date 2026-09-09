import type { Worktree } from '@yiru/protocol/worktree/model'
import type React from 'react'
import { cn } from '~renderer/ui/class-names'

import WorktreeCard, { type ActiveSurfaceVariant } from '../worktree-card'
import { PINNED_GROUP_KEY, type WorktreeGroupBy } from './groups'
import {
  getFolderBackedRepoWorktreeCardContentIndent,
  getFolderBackedRepoWorktreeCardSurfaceInset,
  getLineageChildrenInlineStyle,
  getLineageNestedRowGeometry,
  getProjectWorktreeCardContentIndent,
  getWorktreeCardContentIndent,
  getWorktreeCardSurfaceInset,
  LINEAGE_CHILDREN_INLINE_OFFSET
} from './indentation'
import { getWorktreeOptionId, stopNestedWorktreeCardBubble } from './reveal'
import type { WorktreeItemRow } from './row-model'

export type WorktreeRowProps = {
  row: WorktreeItemRow
  nested: boolean
  lineageChildren?: React.ReactNode
  forceActiveSurface?: boolean
  groupBy: WorktreeGroupBy
  folderBackedProjectGroupIds: ReadonlySet<string>
  groupKeyByRowKey: ReadonlyMap<string, string>
  groupIndexByRowKey: ReadonlyMap<string, number>
  agentSendTargetWorktreeId: string | null
  draggingWorktreeId: string | null
  pointerLineageDropTargetId: string | null
  nativeLineageDropTargetId: string | null
  activeWorktreeId: string | null
  currentWorktreeId: string | null
  selectedWorktreeIds: ReadonlySet<string>
  selectedWorktrees: readonly Worktree[]
  highlightedRowKey: string | null
  getActiveSurfaceVariant: (row: WorktreeItemRow) => ActiveSurfaceVariant
  onImmediateActivate: (worktreeId: string, rowKey: string | undefined) => void
  onSelectionGesture: (event: React.MouseEvent<HTMLElement>, worktreeId: string) => boolean
  onContextMenuSelect: (
    event: React.MouseEvent<HTMLElement>,
    worktree: Worktree
  ) => readonly Worktree[]
  onCardDragStart: (
    event: React.DragEvent<HTMLDivElement>,
    worktreeId: string,
    draggedIds: readonly string[]
  ) => void
  onCardDragEnd: () => void
  onLineageToggle: (groupKey: string, event: React.MouseEvent<HTMLButtonElement>) => void
  onRowPointerDown: (
    event: React.PointerEvent<HTMLDivElement>,
    worktreeId: string,
    rowKey: string
  ) => void
  onRowClickCapture: (event: React.MouseEvent<HTMLDivElement>) => void
}

export function WorktreeRow({
  row,
  nested,
  lineageChildren,
  forceActiveSurface = false,
  ...props
}: WorktreeRowProps): React.JSX.Element {
  const lineageToggleGroupKey = row.lineageGroupKey
  const projectGroupId = row.repo?.projectGroupId
  const isFolderBackedRepoChild =
    props.groupBy === 'repo' &&
    Boolean(projectGroupId && props.folderBackedProjectGroupIds.has(projectGroupId))
  const getCardContentIndent = (lineageDepth: number): number =>
    isFolderBackedRepoChild
      ? getFolderBackedRepoWorktreeCardContentIndent({
          groupDepth: row.groupDepth,
          lineageDepth
        })
      : props.groupBy === 'repo'
        ? getProjectWorktreeCardContentIndent({ groupDepth: row.groupDepth, lineageDepth })
        : getWorktreeCardContentIndent({
            isGrouped: props.groupBy !== 'none',
            groupDepth: row.groupDepth,
            lineageDepth
          })
  const nestedGeometry = nested ? getLineageNestedRowGeometry() : null
  const rootContentIndent = getCardContentIndent(row.depth)
  const surfaceInset = nested
    ? nestedGeometry!.surfaceInset
    : isFolderBackedRepoChild
      ? getFolderBackedRepoWorktreeCardSurfaceInset({
          groupDepth: row.groupDepth,
          lineageDepth: row.depth
        })
      : getWorktreeCardSurfaceInset({
          isGrouped: props.groupBy !== 'none',
          groupDepth: row.groupDepth
        })
  const cardContentIndent = nested
    ? nestedGeometry!.cardContentIndent
    : Math.max(0, rootContentIndent - surfaceInset)
  const lineageChildrenStyle = lineageChildren
    ? getLineageChildrenInlineStyle(
        nestedGeometry?.lineageChildrenInlineOffset ?? LINEAGE_CHILDREN_INLINE_OFFSET
      )
    : undefined
  const dragGroupKey = props.groupKeyByRowKey.get(row.rowKey)
  const dragGroupIndex = props.groupIndexByRowKey.get(row.rowKey)
  const isActive = props.activeWorktreeId === row.worktree.id
  const isLineageDropTarget =
    props.draggingWorktreeId !== null &&
    (props.pointerLineageDropTargetId === row.worktree.id ||
      props.nativeLineageDropTargetId === row.worktree.id)

  return (
    <div
      id={getWorktreeOptionId(row.rowKey)}
      role="option"
      aria-selected={props.selectedWorktreeIds.has(row.worktree.id)}
      aria-current={isActive ? 'page' : undefined}
      data-worktree-id={row.worktree.id}
      data-worktree-row-key={row.rowKey}
      data-worktree-section-key={row.sectionKey}
      data-worktree-drag-id={dragGroupKey ? row.worktree.id : undefined}
      data-worktree-drag-group-key={dragGroupKey}
      data-worktree-drag-group-index={dragGroupIndex}
      className={cn(
        'relative transition-[opacity,filter] duration-150 ease-out',
        props.draggingWorktreeId === row.worktree.id && 'pointer-events-none opacity-0'
      )}
      data-scroll-reveal-highlight={props.highlightedRowKey === row.rowKey ? 'true' : undefined}
      onClick={nested ? stopNestedWorktreeCardBubble : undefined}
      onClickCapture={props.onRowClickCapture}
      onDoubleClick={nested ? stopNestedWorktreeCardBubble : undefined}
      onDragStart={nested ? stopNestedWorktreeCardBubble : undefined}
      onPointerDown={(event) => {
        if (nested) {
          event.stopPropagation()
        }
        props.onRowPointerDown(event, row.worktree.id, row.rowKey)
      }}
      style={{ paddingLeft: surfaceInset > 0 ? `${surfaceInset}px` : undefined }}
    >
      <WorktreeCard
        worktree={row.worktree}
        repo={row.repo}
        isActive={isActive}
        isCurrentWorktree={props.currentWorktreeId === row.worktree.id}
        isActiveSurface={forceActiveSurface || isActive}
        activeSurfaceVariant={
          isActive && !forceActiveSurface ? props.getActiveSurfaceVariant(row) : 'primary'
        }
        isMultiSelected={props.selectedWorktreeIds.has(row.worktree.id)}
        revealHighlight={props.highlightedRowKey === row.rowKey}
        revealHighlightTone={props.agentSendTargetWorktreeId === row.worktree.id ? 'ai' : 'default'}
        selectedWorktrees={props.selectedWorktrees}
        nativeDragEnabled={false}
        isLineageDropTarget={isLineageDropTarget}
        contentIndent={cardContentIndent}
        flushSurface
        activationRowKey={row.rowKey}
        onImmediateActivate={props.onImmediateActivate}
        onSelectionGesture={props.onSelectionGesture}
        onContextMenuSelect={props.onContextMenuSelect}
        onCardDragStart={props.onCardDragStart}
        onCardDragEnd={props.onCardDragEnd}
        hideRepoBadge={props.groupBy === 'repo'}
        hostContextLabel={row.hostContextLabel}
        inPinnedSection={row.sectionKey === PINNED_GROUP_KEY}
        renameRowKey={row.rowKey}
        lineageChildCount={row.lineageChildCount}
        lineageCollapsed={row.lineageCollapsed}
        lineageChildren={lineageChildren}
        lineageChildrenStyle={lineageChildrenStyle}
        onLineageToggle={lineageToggleGroupKey ? props.onLineageToggle : undefined}
        lineageToggleGroupKey={lineageToggleGroupKey}
      />
    </div>
  )
}

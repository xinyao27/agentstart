import type { TabGroupLayoutNode } from '@agentstart/protocol/workspace/tabs'
import { DndContext, DragOverlay } from '@dnd-kit/core'
import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '~renderer/store/state'
import { cn } from '~renderer/ui/class-names'

import TabDragPreview from '../tab-bar/tab-drag-preview'
import TabGroupPanel from './panel'
import { TabDragProvider } from './tab-drag-context'
import TabPaneColumnSplitDragOverlay from './tab-pane-column-split-drag-overlay'
import { type HoveredTabInsertion, useTabDragSplit } from './use-tab-drag-split'
import {
  WORKSPACE_COLUMN_BODY_CLASS_NAME,
  WORKSPACE_COLUMN_FRAME_CLASS_NAME
} from './workspace-column-chrome'

const MIN_RATIO = 0.15
const MAX_RATIO = 0.85

function ResizeHandle({
  direction,
  onResizeStart,
  onRatioChange
}: {
  direction: 'horizontal' | 'vertical'
  onResizeStart: () => void
  onRatioChange: (ratio: number) => void
}): React.JSX.Element {
  const isHorizontal = direction === 'horizontal'
  const [dragging, setDragging] = useState(false)
  const activeResizeCleanupRef = useRef<((updateDragging?: boolean) => void) | null>(null)

  useEffect(
    () => () => {
      activeResizeCleanupRef.current?.(false)
    },
    []
  )

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    const handle = event.currentTarget
    const container = handle.parentElement
    if (!container) {
      return
    }
    activeResizeCleanupRef.current?.()
    onResizeStart()
    setDragging(true)
    handle.setPointerCapture(event.pointerId)

    const onPointerMove = (moveEvent: PointerEvent): void => {
      if (!handle.hasPointerCapture(event.pointerId)) {
        return
      }
      const rect = container.getBoundingClientRect()
      const ratio = isHorizontal
        ? (moveEvent.clientX - rect.left) / rect.width
        : (moveEvent.clientY - rect.top) / rect.height
      onRatioChange(Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio)))
    }

    let cleaned = false
    const cleanup = (updateDragging = true): void => {
      if (cleaned) {
        return
      }
      cleaned = true
      if (updateDragging) {
        setDragging(false)
      }
      try {
        if (handle.hasPointerCapture(event.pointerId)) {
          handle.releasePointerCapture(event.pointerId)
        }
      } catch {
        // Best effort: unmount cleanup can run after Chromium has already dropped capture.
      }
      handle.removeEventListener('pointermove', onPointerMove)
      handle.removeEventListener('pointerup', onPointerUp)
      handle.removeEventListener('pointercancel', onPointerCancel)
      handle.removeEventListener('lostpointercapture', onLostPointerCapture)
      if (activeResizeCleanupRef.current === cleanup) {
        activeResizeCleanupRef.current = null
      }
    }

    const onPointerUp = (): void => {
      cleanup()
    }

    const onPointerCancel = (): void => {
      cleanup()
    }

    const onLostPointerCapture = (): void => {
      cleanup()
    }

    handle.addEventListener('pointermove', onPointerMove)
    handle.addEventListener('pointerup', onPointerUp)
    handle.addEventListener('pointercancel', onPointerCancel)
    handle.addEventListener('lostpointercapture', onLostPointerCapture)
    activeResizeCleanupRef.current = cleanup
  }

  return (
    // Why: keep the flex item seam-sized so adjacent titlebar borders meet it;
    // the transparent ::before box preserves a forgiving resize target.
    <div
      className={cn(
        "relative z-10 shrink-0 bg-transparent before:absolute before:content-[''] after:absolute after:inset-0 after:bg-[var(--tab-group-split-divider)] after:transition-colors after:duration-100 after:ease-[ease] after:content-[''] hover:after:bg-[var(--tab-group-split-divider-strong)]",
        isHorizontal
          ? 'w-px cursor-col-resize before:-inset-x-0.5 before:inset-y-0'
          : 'h-px cursor-row-resize before:inset-x-0 before:-inset-y-0.5',
        dragging && 'after:bg-[var(--tab-group-split-divider-strong)]'
      )}
      onPointerDown={onPointerDown}
    />
  )
}

function SplitNode({
  node,
  nodePath,
  worktreeId,
  focusedGroupId,
  isWorktreeActive,
  hasSplitGroups,
  touchesTopEdge,
  touchesRightEdge,
  touchesLeftEdge,
  touchesBottomEdge,
  suppressLeftBorder,
  suppressRightBorder,
  suppressBottomBorder,
  isTabDragActive,
  hoveredTabInsertion
}: {
  node: TabGroupLayoutNode
  nodePath: string
  worktreeId: string
  focusedGroupId?: string
  isWorktreeActive: boolean
  hasSplitGroups: boolean
  touchesTopEdge: boolean
  touchesRightEdge: boolean
  touchesLeftEdge: boolean
  touchesBottomEdge: boolean
  suppressLeftBorder: boolean
  suppressRightBorder: boolean
  suppressBottomBorder: boolean
  isTabDragActive: boolean
  hoveredTabInsertion: HoveredTabInsertion | null
}): React.JSX.Element {
  const setTabGroupSplitRatio = useAppStore((state) => state.setTabGroupSplitRatio)
  const recordFeatureInteraction = useAppStore((state) => state.recordFeatureInteraction)

  if (node.type === 'leaf') {
    return (
      <TabGroupPanel
        groupId={node.groupId}
        worktreeId={worktreeId}
        // Why: hidden worktrees stay mounted so their PTYs and split layouts
        // survive worktree switches, but only the visible worktree may own the
        // global terminal shortcuts. If an offscreen group's pane stays
        // "focused", Cmd/Ctrl+W and split shortcuts can hit the wrong worktree.
        isFocused={isWorktreeActive && node.groupId === focusedGroupId}
        hasSplitGroups={hasSplitGroups}
        touchesRightEdge={touchesRightEdge}
        touchesLeftEdge={touchesLeftEdge}
        touchesBottomEdge={touchesBottomEdge}
        suppressLeftBorder={suppressLeftBorder}
        suppressRightBorder={suppressRightBorder}
        suppressBottomBorder={suppressBottomBorder}
        reserveCollapsedSidebarHeaderSpace={touchesTopEdge && touchesLeftEdge}
        isTabDragActive={isTabDragActive}
        hoveredTabInsertion={
          hoveredTabInsertion?.groupId === node.groupId ? hoveredTabInsertion : null
        }
      />
    )
  }

  const isHorizontal = node.direction === 'horizontal'
  const ratio = node.ratio ?? 0.5

  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 overflow-hidden"
      style={{ flexDirection: isHorizontal ? 'row' : 'column' }}
    >
      <div className="flex min-h-0 min-w-0 overflow-hidden" style={{ flex: `${ratio} 1 0%` }}>
        <SplitNode
          node={node.first}
          nodePath={nodePath.length > 0 ? `${nodePath}.first` : 'first'}
          worktreeId={worktreeId}
          focusedGroupId={focusedGroupId}
          isWorktreeActive={isWorktreeActive}
          hasSplitGroups={hasSplitGroups}
          touchesTopEdge={touchesTopEdge}
          touchesRightEdge={isHorizontal ? false : touchesRightEdge}
          touchesLeftEdge={touchesLeftEdge}
          touchesBottomEdge={isHorizontal ? touchesBottomEdge : false}
          suppressLeftBorder={suppressLeftBorder}
          // Why: the resize handle paints the inner seam — pane borders here
          // stack into a triple-line bar beside the divider.
          suppressRightBorder={isHorizontal ? true : suppressRightBorder}
          suppressBottomBorder={isHorizontal ? suppressBottomBorder : true}
          isTabDragActive={isTabDragActive}
          hoveredTabInsertion={hoveredTabInsertion}
        />
      </div>
      <ResizeHandle
        direction={node.direction}
        onResizeStart={() => recordFeatureInteraction('terminal-panes')}
        onRatioChange={(nextRatio) => setTabGroupSplitRatio(worktreeId, nodePath, nextRatio)}
      />
      <div className="flex min-h-0 min-w-0 overflow-hidden" style={{ flex: `${1 - ratio} 1 0%` }}>
        <SplitNode
          node={node.second}
          nodePath={nodePath.length > 0 ? `${nodePath}.second` : 'second'}
          worktreeId={worktreeId}
          focusedGroupId={focusedGroupId}
          isWorktreeActive={isWorktreeActive}
          hasSplitGroups={hasSplitGroups}
          touchesTopEdge={isHorizontal ? touchesTopEdge : false}
          touchesRightEdge={touchesRightEdge}
          touchesLeftEdge={isHorizontal ? false : touchesLeftEdge}
          touchesBottomEdge={touchesBottomEdge}
          suppressLeftBorder={isHorizontal ? true : suppressLeftBorder}
          suppressRightBorder={suppressRightBorder}
          suppressBottomBorder={suppressBottomBorder}
          isTabDragActive={isTabDragActive}
          hoveredTabInsertion={hoveredTabInsertion}
        />
      </div>
    </div>
  )
}

export default function TabGroupSplitLayout({
  layout,
  worktreeId,
  focusedGroupId,
  isWorktreeActive
}: {
  layout: TabGroupLayoutNode
  worktreeId: string
  focusedGroupId?: string
  isWorktreeActive: boolean
}): React.JSX.Element {
  const {
    activeDrag,
    collisionDetection,
    hoveredDropTarget,
    hoveredTabInsertion,
    isTabDragActiveRef,
    onDragCancel,
    onDragEnd,
    onDragMove,
    onDragOver,
    onDragStart,
    sensors,
    setDragRootNode
  } = useTabDragSplit({ worktreeId, enabled: isWorktreeActive })
  const hasSplits = layout.type === 'split'

  return (
    <TabDragProvider isTabDragActive={activeDrag !== null} isTabDragActiveRef={isTabDragActiveRef}>
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
        // Why: dnd-kit auto-scrolls the tab strip when the cursor approaches its
        // edge, which in a multi-group layout creates a feedback loop — scroll
        // shifts tabs under the cursor, `over` re-resolves, scroll runs again.
        // We don't need autoscroll for tab-bar drags (strip fits the viewport),
        // so disabling it is the simplest fix.
        autoScroll={false}
      >
        {/* Why: the wrapper keeps the sidebar edge open while each split pane
          uses its edge flags to paint only internal dividers. */}
        <div ref={setDragRootNode} className={WORKSPACE_COLUMN_FRAME_CLASS_NAME}>
          <div className={WORKSPACE_COLUMN_BODY_CLASS_NAME}>
            <SplitNode
              node={layout}
              nodePath=""
              worktreeId={worktreeId}
              focusedGroupId={focusedGroupId}
              isWorktreeActive={isWorktreeActive}
              hasSplitGroups={hasSplits}
              touchesTopEdge={true}
              touchesRightEdge={true}
              touchesLeftEdge={true}
              touchesBottomEdge={false}
              suppressLeftBorder={false}
              suppressRightBorder={false}
              suppressBottomBorder={false}
              isTabDragActive={activeDrag !== null}
              hoveredTabInsertion={hoveredTabInsertion}
            />
          </div>
        </div>
        {/* Why: the sortable tab is anchored inside its source tab strip (no
          transform while dragging), and that strip uses overflow-hidden so
          the tab is invisible once the cursor leaves it. DragOverlay
          renders a ghost in a document-level portal that tracks the cursor
          across the whole window — the source tab keeps its spot, the
          ghost follows the cursor. */}
        <DragOverlay dropAnimation={null}>
          {activeDrag ? <TabDragPreview drag={activeDrag} /> : null}
        </DragOverlay>
        {hoveredDropTarget && hoveredDropTarget.zone !== 'center' && hoveredDropTarget.panelRect ? (
          <TabPaneColumnSplitDragOverlay
            panelRect={hoveredDropTarget.panelRect}
            zone={hoveredDropTarget.zone}
          />
        ) : null}
      </DndContext>
    </TabDragProvider>
  )
}

import type {
  CollisionDetection,
  DragEndEvent,
  DragMoveEvent,
  DragOverEvent,
  DragStartEvent,
  useSensors
} from '@dnd-kit/core'
import type { RefObject } from 'react'
import { useAppStore } from '~renderer/store/state'

import { mirrorRemoteRuntimeTabMove } from '../tab-bar/remote-runtime-tab-move-mirror'
import { resolveActivePaneColumnSplitTarget } from './panel-split-target'
export {
  getTabPaneBodyDroppableId,
  TAB_DRAG_ACTIVATION_DISTANCE_PX,
  type HoveredTabDropTarget,
  type TabDragItemData,
  type TabDropZone
} from './tab-drag-data'
import {
  isPaneDropData,
  isTabDragData,
  tabDragCollisionDetection,
  type HoveredTabDropTarget,
  type TabDragItemData
} from './tab-drag-data'
import { getDragPointer } from './tab-drag-pointer'
import { resolveSourceGroupRestoreOnDrop } from './tab-drag-preview-target'
import { resolveTabInsertion, type HoveredTabInsertion } from './tab-insertion'
import { useTabDragGesture } from './use-tab-drag-gesture'

export type { HoveredTabInsertion }

export function useTabDragSplit({
  worktreeId,
  enabled = true
}: {
  worktreeId: string
  enabled?: boolean
}): {
  activeDrag: TabDragItemData | null
  collisionDetection: CollisionDetection
  hoveredDropTarget: HoveredTabDropTarget | null
  hoveredTabInsertion: HoveredTabInsertion | null
  isTabDragActiveRef: RefObject<boolean>
  onDragCancel: () => void
  onDragEnd: (event: DragEndEvent) => void
  onDragMove: (event: DragMoveEvent) => void
  onDragOver: (event: DragOverEvent) => void
  onDragStart: (event: DragStartEvent) => void
  sensors: ReturnType<typeof useSensors>
  setDragRootNode: (node: HTMLDivElement | null) => void
} {
  const reorderUnifiedTabs = useAppStore((state) => state.reorderUnifiedTabs)
  const dropUnifiedTab = useAppStore((state) => state.dropUnifiedTab)
  const gesture = useTabDragGesture(worktreeId, enabled)

  const onDragEnd = (event: DragEndEvent) => {
    const activeData = event.active.data.current
    const overData = event.over?.data.current
    let shouldRestorePreDragActivation = true
    if (!isTabDragData(activeData) || activeData.worktreeId !== worktreeId) {
      gesture.finishDrag(true)
      return
    }

    const state = useAppStore.getState()
    const paneColumnSplit = resolveActivePaneColumnSplitTarget({
      event,
      groupsByWorktree: state.groupsByWorktree,
      layoutByWorktree: state.layoutByWorktree,
      worktreeId,
      getDragPointer,
      geometry: gesture.dragGeometryRef.current
    })
    if (paneColumnSplit) {
      const moved = dropUnifiedTab(activeData.unifiedTabId, {
        groupId: paneColumnSplit.groupId,
        splitDirection: paneColumnSplit.zone
      })
      if (moved) {
        shouldRestorePreDragActivation = false
        mirrorRemoteRuntimeTabMove({
          kind: 'split',
          worktreeId,
          tabId: activeData.unifiedTabId,
          targetGroupId: paneColumnSplit.groupId,
          splitDirection: paneColumnSplit.zone
        })
      }
      gesture.finishDrag(
        shouldRestorePreDragActivation,
        resolveSourceGroupRestoreOnDrop(
          activeData,
          paneColumnSplit.groupId,
          shouldRestorePreDragActivation
        )
      )
      return
    }
    if (!event.over) {
      gesture.finishDrag(true)
      return
    }

    if (isTabDragData(overData)) {
      if (activeData.unifiedTabId === overData.unifiedTabId) {
        gesture.finishDrag(true)
        return
      }
      const targetGroup = (state.groupsByWorktree[worktreeId] ?? []).find(
        (group) => group.id === overData.groupId
      )
      if (!targetGroup) {
        gesture.finishDrag(true)
        return
      }
      // Why: dnd-kit's hovered tab is not the insertion position; the cursor
      // side must match the insertion bar shown to the user.
      const insertion = resolveTabInsertion(event, isTabDragData, getDragPointer)
      if (!insertion) {
        gesture.finishDrag(true)
        return
      }
      const overIndex = targetGroup.tabOrder.indexOf(overData.unifiedTabId)
      const rawInsertIndex = overIndex + (insertion.side === 'right' ? 1 : 0)
      if (activeData.groupId === overData.groupId) {
        const oldIndex = targetGroup.tabOrder.indexOf(activeData.unifiedTabId)
        const nextIndex = oldIndex < rawInsertIndex ? rawInsertIndex - 1 : rawInsertIndex
        if (oldIndex !== -1 && oldIndex !== nextIndex) {
          const nextOrder = targetGroup.tabOrder.filter((id) => id !== activeData.unifiedTabId)
          nextOrder.splice(nextIndex, 0, activeData.unifiedTabId)
          reorderUnifiedTabs(overData.groupId, nextOrder)
          mirrorRemoteRuntimeTabMove({
            kind: 'reorder',
            worktreeId,
            tabId: activeData.unifiedTabId,
            targetGroupId: overData.groupId,
            tabOrder: nextOrder
          })
        }
      } else {
        const index = overIndex === -1 ? targetGroup.tabOrder.length : rawInsertIndex
        const moved = dropUnifiedTab(activeData.unifiedTabId, {
          groupId: overData.groupId,
          index
        })
        if (moved) {
          shouldRestorePreDragActivation = false
          mirrorRemoteRuntimeTabMove({
            kind: 'move-to-group',
            worktreeId,
            tabId: activeData.unifiedTabId,
            targetGroupId: overData.groupId,
            index
          })
        }
      }
      gesture.finishDrag(
        shouldRestorePreDragActivation,
        resolveSourceGroupRestoreOnDrop(
          activeData,
          overData.groupId,
          shouldRestorePreDragActivation
        )
      )
      return
    }

    if (isPaneDropData(overData) && activeData.groupId !== overData.groupId) {
      const moved = dropUnifiedTab(activeData.unifiedTabId, { groupId: overData.groupId })
      if (moved) {
        shouldRestorePreDragActivation = false
        mirrorRemoteRuntimeTabMove({
          kind: 'move-to-group',
          worktreeId,
          tabId: activeData.unifiedTabId,
          targetGroupId: overData.groupId
        })
      }
    }
    gesture.finishDrag(
      shouldRestorePreDragActivation,
      isPaneDropData(overData)
        ? resolveSourceGroupRestoreOnDrop(
            activeData,
            overData.groupId,
            shouldRestorePreDragActivation
          )
        : undefined
    )
  }
  const onDragCancel = () => gesture.finishDrag(true)

  return {
    activeDrag: gesture.activeDrag,
    collisionDetection: tabDragCollisionDetection,
    hoveredDropTarget: gesture.hoveredDropTarget,
    hoveredTabInsertion: gesture.hoveredTabInsertion,
    isTabDragActiveRef: gesture.isTabDragActiveRef,
    onDragCancel,
    onDragEnd,
    onDragMove: gesture.onDragMove,
    onDragOver: gesture.onDragOver,
    onDragStart: gesture.onDragStart,
    sensors: gesture.sensors,
    setDragRootNode: gesture.setDragRootNode
  }
}

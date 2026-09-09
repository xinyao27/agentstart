import {
  closestCenter,
  pointerWithin,
  type CollisionDetection,
  type UniqueIdentifier
} from '@dnd-kit/core'
import type { TuiAgent } from '@yiru/protocol/agent/types'
import type { TabGroup } from '@yiru/protocol/workspace/tabs'
import type { TabSplitDirection } from '~renderer/tab-bar/split-direction'

export type TabDropZone = 'center' | TabSplitDirection

// Why: tab activation waits for pointerup, so ordinary click jitter must not
// become an intentional drag.
export const TAB_DRAG_ACTIVATION_DISTANCE_PX = 12

export type TabDragItemData = {
  kind: 'tab'
  worktreeId: string
  groupId: string
  unifiedTabId: string
  visibleTabId: string
  tabType: 'terminal' | 'editor' | 'browser' | 'simulator' | 'git-graph'
  label: string
  iconPath?: string
  color?: string | null
  agent?: TuiAgent | null
}

export type TabPaneDropData = {
  kind: 'pane-body'
  worktreeId: string
  groupId: string
}

export type HoveredTabDropTarget = {
  groupId: string
  zone: TabDropZone
  panelRect?: DOMRect
}

export function canDropTabIntoPaneBody({
  activeDrag,
  groupsByWorktree,
  overGroupId,
  worktreeId
}: {
  activeDrag: TabDragItemData | null
  groupsByWorktree: Record<string, TabGroup[]>
  overGroupId: string
  worktreeId: string
}): boolean {
  if (!activeDrag || activeDrag.worktreeId !== worktreeId) {
    return false
  }
  const overGroup = (groupsByWorktree[worktreeId] ?? []).find((group) => group.id === overGroupId)
  if (!overGroup) {
    return false
  }
  // Why: splitting the only tab onto its own pane is a visual no-op.
  return activeDrag.groupId !== overGroupId || overGroup.tabOrder.length > 1
}

export function isTabDragData(value: unknown): value is TabDragItemData {
  return typeof value === 'object' && value !== null && 'kind' in value && value.kind === 'tab'
}

export function isPaneDropData(value: unknown): value is TabPaneDropData {
  return (
    typeof value === 'object' && value !== null && 'kind' in value && value.kind === 'pane-body'
  )
}

export const tabDragCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args)
  return pointerCollisions.length > 0 ? pointerCollisions : closestCenter(args)
}

export function getTabPaneBodyDroppableId(groupId: string): UniqueIdentifier {
  return `tab-group-pane-body:${groupId}`
}

export function getTabDragActivationDistance(enabled: boolean): number {
  return enabled ? TAB_DRAG_ACTIVATION_DISTANCE_PX : Number.MAX_SAFE_INTEGER
}

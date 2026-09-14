import type { TopLevelView } from '@agentstart/protocol/settings/ui-state'
import type { Tab } from '@agentstart/protocol/workspace/tabs'

import type { AppState } from '../../store/types'
import { pageTabScope } from './app-scope'
import { pageViewFromTab, type WorkspacePageView } from './workspace-page-views'

type SurfaceInput = Pick<
  AppState,
  'activeGroupIdByWorktree' | 'activeWorktreeId' | 'groupsByWorktree' | 'unifiedTabsByWorktree'
>

// Why: the surface on screen is a function of the hosting scope's active tab,
// not a route scalar. Pages are tabs now, so "which page am I on" and "which tab
// is selected" are the same question — deriving one from the other is what stops
// a page tab and a workspace tab from disagreeing about who is selected.
//
// The hosting scope is the active workspace, or the app scope when no workspace
// is open — the same scope the titlebar's strip reads.
export function hostedScopeId(state: Pick<SurfaceInput, 'activeWorktreeId'>): string {
  return pageTabScope(state.activeWorktreeId)
}

/** The active tab of the scope that owns the titlebar, or null when it has none. */
export function activeHostedTab(state: SurfaceInput): Tab | null {
  const scopeId = hostedScopeId(state)
  const groupId = state.activeGroupIdByWorktree[scopeId]
  if (groupId === undefined) {
    return null
  }
  const group = (state.groupsByWorktree[scopeId] ?? []).find(
    (candidate) => candidate.id === groupId
  )
  if (!group?.activeTabId) {
    return null
  }
  return (
    (state.unifiedTabsByWorktree[scopeId] ?? []).find((tab) => tab.id === group.activeTabId) ?? null
  )
}

/** The page surface showing right now, or null when the workspace body is. */
export function activePageView(state: SurfaceInput): WorkspacePageView | null {
  const tab = activeHostedTab(state)
  return tab ? pageViewFromTab(tab) : null
}

/**
 * The tab to land on when the user asks for the workspace body while a page tab
 * owns the surface. Walks the group's MRU stack for the most recently active
 * non-page tab, then falls back to the first one in visual order — the same
 * MRU-then-neighbour strategy `pickNextActiveTab` uses when a tab closes.
 *
 * Returns null when the hosting scope queues no workspace tab at all, which is
 * the app scope with only pages open.
 */
export function nearestWorkspaceTab(state: SurfaceInput): Tab | null {
  const scopeId = hostedScopeId(state)
  const groupId = state.activeGroupIdByWorktree[scopeId]
  const group = (state.groupsByWorktree[scopeId] ?? []).find(
    (candidate) => candidate.id === groupId
  )
  if (!group) {
    return null
  }
  const byId = new Map(
    (state.unifiedTabsByWorktree[scopeId] ?? []).map((tab) => [tab.id, tab] as const)
  )
  // Why: a stale or duplicated id in the MRU stack must not win the walk — the
  // tab map is the authority on which ids still exist and what they are.
  const workspaceTab = (id: string): Tab | null => {
    const tab = byId.get(id)
    return tab && pageViewFromTab(tab) === null ? tab : null
  }
  const recent = group.recentTabIds ?? []
  for (let index = recent.length - 1; index >= 0; index--) {
    const tab = workspaceTab(recent[index])
    if (tab) {
      return tab
    }
  }
  for (const id of group.tabOrder) {
    const tab = workspaceTab(id)
    if (tab) {
      return tab
    }
  }
  return null
}

/**
 * True while the workspace body is the visible surface — the workspace itself,
 * or the landing screen when no workspace is open. This is the derived form of
 * the old `activeView === 'terminal'` check, which is what almost every caller
 * actually meant.
 */
export function isWorkspaceBodyVisible(state: SurfaceInput): boolean {
  return activePageView(state) === null
}

/**
 * Which top-level surface is showing, derived from the hosting scope's active tab.
 *
 * Why every reader goes through this selector: surface ownership lives in the
 * unified tab queue, so a second route or persistence scalar could disagree with
 * the strip's selected tab.
 *
 * `'terminal'` is the workspace body, including the landing screen when no
 * workspace is open — there is no page tab, so no page view.
 */
export function activeViewFor(state: SurfaceInput): TopLevelView {
  return activePageView(state) ?? 'terminal'
}

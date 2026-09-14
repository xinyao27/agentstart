import type { StateCreator } from 'zustand'

import type { AppState } from '../../store/types'
import { pageTabScope } from './app-scope'
import type { UISlice } from './slice'
import { activeHostedTab, nearestWorkspaceTab } from './visible-surface'
import { pageTabId, pageViewFromTab, resolvePageTabLabel } from './workspace-page-views'

export function createUINavigationActions(
  set: Parameters<StateCreator<AppState, [], [], UISlice>>[0],
  get: Parameters<StateCreator<AppState, [], [], UISlice>>[1]
): Pick<
  UISlice,
  | 'focusWorkspaceSurface'
  | 'openPageTab'
  | 'openHomePage'
  | 'openSpacePage'
  | 'closeSpacePage'
  | 'openSkillsPage'
  | 'closeSkillsPage'
  | 'openMobilePage'
  | 'closeMobilePage'
  | 'setNewWorkspaceDraft'
  | 'clearNewWorkspaceDraft'
  | 'openSettingsPage'
  | 'closeSettingsPage'
  | 'openSettingsTarget'
  | 'clearSettingsTarget'
  | 'setSettingsProjectHostSelection'
  | 'setAppearanceAccordionDeepLink'
  | 'clearAppearanceAccordionDeepLink'
  | 'openModal'
  | 'closeModal'
  | 'closePageTab'
> {
  return {
    // Why: "show the workspace" is a tab-landing command, not a route
    // assignment. When a page tab owns the surface this activates the nearest
    // workspace tab, so the strip's selection and the visible surface cannot
    // disagree.
    focusWorkspaceSurface: () => {
      const state = get()
      const hostedTab = activeHostedTab(state)
      if (!hostedTab || pageViewFromTab(hostedTab) === null) {
        // Already on the workspace body, or the scope queues no tab at all —
        // the app scope with no workspace open shows the landing screen.
        return
      }
      const target = nearestWorkspaceTab(state)
      if (target) {
        get().activateTab(target.id)
        return
      }
      // Why: the only tab in this scope is the page itself, so there is nothing
      // to land on. Closing it returns the app scope to its landing screen.
      get().closeUnifiedTab(hostedTab.id)
    },
    // Why: a page tab is a real unified Tab (contentType 'page', deterministic
    // id) in the focused group's queue — the same queue new terminal tabs append
    // to. Opening appends one and activates it, so it queues left-to-right in
    // creation order, drags, splits, and persists like every other tab instead
    // of being a synthetic id with no backing record.
    openPageTab: (view) => {
      const beforeOpen = get()
      // Why: with no workspace open there is still a queue to append to — the
      // app scope — so a page tab stays a real tab in every case.
      const scopeId = pageTabScope(beforeOpen.activeWorktreeId)
      const pageId = pageTabId(view)
      const existing = (beforeOpen.unifiedTabsByWorktree[scopeId] ?? []).find(
        (tab) => tab.id === pageId
      )
      if (existing) {
        // Why: a page exists at most once per scope, so reopening focuses the
        // tab it already has rather than stacking a duplicate.
        get().activateTab(pageId)
      } else {
        const groupId = beforeOpen.activeGroupIdByWorktree[scopeId]
        get().createUnifiedTab(scopeId, 'page', {
          id: pageId,
          entityId: view,
          label: resolvePageTabLabel(view),
          ...(groupId ? { targetGroupId: groupId } : {}),
          recordInteraction: false
        })
      }
    },
    openHomePage: () => get().openPageTab('home'),
    // Why: Space is a page like any other — it queues and closes through the
    // shared tab lifecycle instead of owning a route of its own.
    openSpacePage: () => {
      get().recordFeatureInteraction?.('workspace-cleanup')
      get().openPageTab('space')
    },
    closeSpacePage: () => get().closePageTab('space'),
    openSkillsPage: () => get().openPageTab('skills'),
    closeSkillsPage: () => get().closePageTab('skills'),
    openMobilePage: () => get().openPageTab('mobile'),
    closeMobilePage: () => get().closePageTab('mobile'),
    setNewWorkspaceDraft: (draft) => set({ newWorkspaceDraft: draft }),
    clearNewWorkspaceDraft: () => set({ newWorkspaceDraft: null }),
    openSettingsPage: () => {
      // Why: settings search is a transient page filter; opening Settings
      // should never inherit hidden sections from the previous visit.
      get().setSettingsSearchQuery('')
      get().openPageTab('settings')
    },
    closeSettingsPage: () => get().closePageTab('settings'),
    openSettingsTarget: (target) => set({ settingsNavigationTarget: target }),
    clearSettingsTarget: () => set({ settingsNavigationTarget: null }),
    setSettingsProjectHostSelection: (projectId, hostId) =>
      set((s) =>
        s.settingsProjectHostSelection[projectId] === hostId
          ? s
          : {
              settingsProjectHostSelection: {
                ...s.settingsProjectHostSelection,
                [projectId]: hostId
              }
            }
      ),
    setAppearanceAccordionDeepLink: (section) => set({ appearanceAccordionDeepLink: section }),
    clearAppearanceAccordionDeepLink: () => set({ appearanceAccordionDeepLink: null }),
    openModal: (modal, data = {}) => {
      if (modal === 'add-repo' || modal === 'create-worktree') {
        get().recordFeatureInteraction?.('workspace-creation')
      }
      set({
        activeModal: modal,
        modalData: data
      })
    },
    closeModal: () => set({ activeModal: 'none', modalData: {} }),
    // Why: closing goes through the shared tab lifecycle so group layout, MRU,
    // and active-tab selection resolve exactly as they do for any other tab.
    // The surface follows the group's new active tab automatically via the
    // derived `activeViewFor` — no mirror write is needed.
    closePageTab: (view) => {
      const beforeClose = get()
      const pageId = pageTabId(view)
      const wasActive =
        activeHostedTab(beforeClose)?.id === pageId &&
        pageViewFromTab(activeHostedTab(beforeClose)!) === view
      get().closeUnifiedTab(pageId)
      // Why: when the closed page was the one being shown, land back on the
      // workspace body. `focusWorkspaceSurface` handles both the "there is a
      // workspace tab to land on" and the "scope is empty" cases.
      if (wasActive) {
        get().focusWorkspaceSurface()
      }
    }
  }
}

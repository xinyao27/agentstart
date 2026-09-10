import { DEFAULT_WORKSPACE_PANEL_TITLEBAR_PINNED_IDS } from '@agentstart/protocol/settings/panel-titlebar-pins'
import { DEFAULT_STATUS_BAR_ITEMS } from '@agentstart/protocol/settings/status-bar'
import type { PersistedUIState } from '@agentstart/protocol/settings/ui-state'
import {
  DEFAULT_HIDE_SLEEPING_WORKSPACES,
  DEFAULT_SHOW_SLEEPING_WORKSPACES
} from '@agentstart/protocol/settings/workspace-preferences'
import { DEFAULT_WORKTREE_CARD_PROPERTIES } from '@agentstart/protocol/settings/worktree-card-properties'

export function hydratePersistedUIAfterStartupRead({
  persistedUI,
  cancelled,
  hydratePersistedUI
}: {
  persistedUI: PersistedUIState
  cancelled: boolean
  hydratePersistedUI: (ui: PersistedUIState, source?: 'startup' | 'sync') => void
}): boolean {
  if (cancelled) {
    return false
  }

  hydratePersistedUI(persistedUI, 'startup')
  return true
}

export function getStartupErrorFallbackUI(uiHydrated: boolean): PersistedUIState | undefined {
  if (uiHydrated) {
    return undefined
  }

  // Why (issue #1158): the app shell still needs persistedUIReady=true when
  // startup fails before ui.get(), but these defaults must never replace a
  // successfully loaded UI snapshot after a later session hydration failure.
  return {
    lastActiveRepoId: null,
    lastActiveWorktreeId: null,
    activeView: 'terminal',
    sidebarWidth: 280,
    rightSidebarOpen: true,
    rightSidebarTab: 'explorer',
    rightSidebarExplorerView: 'files',
    rightSidebarWidth: 350,
    markdownTocPanelWidth: 240,
    groupBy: 'repo',
    sortBy: 'name',
    projectOrderBy: 'manual',
    showActiveOnly: false,
    hideSleepingWorkspaces: DEFAULT_HIDE_SLEEPING_WORKSPACES,
    showSleepingWorkspaces: DEFAULT_SHOW_SLEEPING_WORKSPACES,
    hideDefaultBranchWorkspace: false,
    filterRepoIds: [],
    collapsedGroups: [],
    uiZoomLevel: 0,
    editorFontZoomLevel: 0,
    worktreeCardProperties: [...DEFAULT_WORKTREE_CARD_PROPERTIES],
    statusBarItems: [...DEFAULT_STATUS_BAR_ITEMS],
    statusBarVisible: true,
    workspacePanelTitlebarPinnedIds: [...DEFAULT_WORKSPACE_PANEL_TITLEBAR_PINNED_IDS],
    lastUpdateCheckAt: null
  }
}

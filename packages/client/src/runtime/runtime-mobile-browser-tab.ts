import type { Tab } from '@agentstart/protocol/workspace/tabs'
import type { AppState } from '~renderer/store/types'

import type { RuntimeMobileSessionBrowserTab } from './remote-session/session-model'
import { isUnifiedTabActiveInActiveGroup } from './runtime-mobile-tab-activity'

export function buildMobileBrowserTab(
  state: AppState,
  workspace: NonNullable<AppState['browserTabsByWorktree'][string]>[number],
  unifiedTab?: Tab
): RuntimeMobileSessionBrowserTab {
  const pages = state.browserPagesByWorkspace[workspace.id] ?? []
  const activePage = pages.find((page) => page.id === workspace.activePageId) ?? pages[0] ?? null
  const title =
    activePage?.title || workspace.title || activePage?.url || workspace.url || 'Browser'
  const unifiedTabId = unifiedTab?.id

  return {
    type: 'browser',
    id: unifiedTabId ?? workspace.id,
    title,
    browserWorkspaceId: workspace.id,
    browserPageId: activePage?.id ?? workspace.activePageId ?? null,
    url: activePage?.url ?? workspace.url ?? 'about:blank',
    loading: activePage?.loading ?? workspace.loading,
    canGoBack: activePage?.canGoBack ?? workspace.canGoBack,
    canGoForward: activePage?.canGoForward ?? workspace.canGoForward,
    // Why: null means the active page successfully cleared its failure. Falling
    // back through ?? would resurrect a stale workspace-level error.
    loadError: activePage ? activePage.loadError : workspace.loadError,
    certificateFailure: activePage
      ? (state.browserCertificateFailuresByPageId?.[activePage.id] ?? null)
      : null,
    color: unifiedTab?.color ?? null,
    isPinned: unifiedTab?.isPinned === true,
    isActive: unifiedTabId
      ? isUnifiedTabActiveInActiveGroup(state, workspace.worktreeId, unifiedTabId)
      : state.activeBrowserTabIdByWorktree[workspace.worktreeId] === workspace.id
  }
}

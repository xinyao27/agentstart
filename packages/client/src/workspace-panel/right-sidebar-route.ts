import type {
  ActiveRightSidebarTab,
  RightSidebarExplorerView
} from '@yiru/protocol/settings/ui-state'

export type RightSidebarRoute = {
  rightSidebarTab: ActiveRightSidebarTab
  rightSidebarExplorerView: RightSidebarExplorerView
}

function normalizeRightSidebarExplorerView(view: unknown): RightSidebarExplorerView {
  return view === 'search' ? 'search' : 'files'
}

export function normalizeRightSidebarRoute(
  tab: unknown,
  explorerView?: unknown
): RightSidebarRoute {
  // Why: older builds persisted Search as a standalone activity tab.
  if (tab === 'search') {
    return { rightSidebarTab: 'explorer', rightSidebarExplorerView: 'search' }
  }
  if (tab === 'checks') {
    return { rightSidebarTab: 'source-control', rightSidebarExplorerView: 'files' }
  }
  if (
    tab === 'explorer' ||
    tab === 'vault' ||
    tab === 'workspaces' ||
    tab === 'pr-checks' ||
    tab === 'source-control' ||
    tab === 'ports'
  ) {
    return {
      rightSidebarTab: tab,
      rightSidebarExplorerView:
        tab === 'explorer' ? normalizeRightSidebarExplorerView(explorerView) : 'files'
    }
  }
  return { rightSidebarTab: 'explorer', rightSidebarExplorerView: 'files' }
}

import type {
  ActiveWorkspacePanelTab,
  WorkspacePanelExplorerView
} from '@agentstart/protocol/settings/ui-state'

export type WorkspacePanelRoute = {
  workspacePanelTab: ActiveWorkspacePanelTab
  workspacePanelExplorerView: WorkspacePanelExplorerView
}

function normalizeWorkspacePanelExplorerView(view: unknown): WorkspacePanelExplorerView {
  return view === 'search' ? 'search' : 'files'
}

export function normalizeWorkspacePanelRoute(
  tab: unknown,
  explorerView?: unknown
): WorkspacePanelRoute {
  // Why: older builds persisted Search as a standalone activity tab.
  if (tab === 'search') {
    return { workspacePanelTab: 'explorer', workspacePanelExplorerView: 'search' }
  }
  if (tab === 'checks') {
    return { workspacePanelTab: 'source-control', workspacePanelExplorerView: 'files' }
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
      workspacePanelTab: tab,
      workspacePanelExplorerView:
        tab === 'explorer' ? normalizeWorkspacePanelExplorerView(explorerView) : 'files'
    }
  }
  return { workspacePanelTab: 'explorer', workspacePanelExplorerView: 'files' }
}

import type { ActiveRightSidebarTab } from '@yiru/protocol/settings/ui-state'
import { getWorkbenchLocation, navigateWorkbench } from '~renderer/runtime/workbench-location'
import { useAppStore } from '~renderer/store/state'
import { normalizeRightSidebarRoute } from '~renderer/workspace-panel/right-sidebar-route'

import type { SourceControlPanelView } from './source-control/workspace-panel/state'

type ExplorerDestination =
  | { view: 'files' }
  | {
      view: 'search'
      query?: string
      includePattern?: string
    }

export function showWorkspaceSidebar({
  view,
  worktreeId,
  explorerDestination,
  sourceControlView = 'changes'
}: {
  view: ActiveRightSidebarTab
  worktreeId?: string | null
  explorerDestination?: ExplorerDestination
  sourceControlView?: SourceControlPanelView
}): void {
  const state = useAppStore.getState()
  const resolvedWorktreeId = worktreeId ?? state.activeWorktreeId
  if (!resolvedWorktreeId) {
    return
  }

  if (view === 'explorer' && explorerDestination?.view === 'search') {
    state.showRightSidebarSearch({
      ...(explorerDestination.query ? { query: explorerDestination.query } : {}),
      ...(explorerDestination.includePattern
        ? { includePattern: explorerDestination.includePattern }
        : {})
    })
  } else if (view === 'explorer') {
    state.showRightSidebarFiles()
  } else {
    state.setRightSidebarTab(view)
    state.setRightSidebarOpen(true)
  }

  if (view === 'source-control') {
    state.setSourceControlPanelView(resolvedWorktreeId, sourceControlView)
  }
  const location = getWorkbenchLocation()
  if (
    location.kind === 'project' &&
    (!location.worktreeId || location.worktreeId === resolvedWorktreeId)
  ) {
    navigateWorkbench({ ...location, panel: view, worktreeId: resolvedWorktreeId })
  }
}

export function toggleWorkspaceSidebar(options: Parameters<typeof showWorkspaceSidebar>[0]): void {
  const state = useAppStore.getState()
  const resolvedWorktreeId = options.worktreeId ?? state.activeWorktreeId
  if (!resolvedWorktreeId) {
    return
  }
  const route = normalizeRightSidebarRoute(state.rightSidebarTab, state.rightSidebarExplorerView)
  const requestedExplorerView = options.explorerDestination?.view ?? 'files'
  const requestedSourceControlView = options.sourceControlView ?? 'changes'
  const currentSourceControlView =
    state.sourceControlPanelViewByWorktree[resolvedWorktreeId] ??
    state.requestedSourceControlPanelView
  const isSameDestination =
    route.rightSidebarTab === options.view &&
    (options.view !== 'explorer' || route.rightSidebarExplorerView === requestedExplorerView) &&
    (options.view !== 'source-control' || currentSourceControlView === requestedSourceControlView)

  if (state.rightSidebarOpen && isSameDestination) {
    state.setRightSidebarOpen(false)
    return
  }
  showWorkspaceSidebar(options)
}

import type { ActiveWorkspacePanelTab } from '@agentstart/protocol/settings/ui-state'
import { getWorkbenchLocation, navigateWorkbench } from '~renderer/runtime/workbench-location'
import { useAppStore } from '~renderer/store/state'
import type { SourceControlPanelView } from '~renderer/workspace-panel/source-control/tab/state'
import { normalizeWorkspacePanelRoute } from '~renderer/workspace-panel/workspace-panel-route'

type ExplorerDestination =
  | { view: 'files' }
  | {
      view: 'search'
      query?: string
      includePattern?: string
    }

export function showWorkspacePanel({
  view,
  worktreeId,
  explorerDestination,
  sourceControlView = 'changes'
}: {
  view: ActiveWorkspacePanelTab
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
    state.showWorkspacePanelSearch({
      ...(explorerDestination.query ? { query: explorerDestination.query } : {}),
      ...(explorerDestination.includePattern
        ? { includePattern: explorerDestination.includePattern }
        : {})
    })
  } else if (view === 'explorer') {
    state.showWorkspacePanelFiles()
  } else {
    state.setWorkspacePanelTab(view)
    state.setWorkspacePanelOpen(true)
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

export function toggleWorkspacePanel(options: Parameters<typeof showWorkspacePanel>[0]): void {
  const state = useAppStore.getState()
  const resolvedWorktreeId = options.worktreeId ?? state.activeWorktreeId
  if (!resolvedWorktreeId) {
    return
  }
  const route = normalizeWorkspacePanelRoute(
    state.workspacePanelTab,
    state.workspacePanelExplorerView
  )
  const requestedExplorerView = options.explorerDestination?.view ?? 'files'
  const requestedSourceControlView = options.sourceControlView ?? 'changes'
  const currentSourceControlView =
    state.sourceControlPanelViewByWorktree[resolvedWorktreeId] ??
    state.requestedSourceControlPanelView
  const isSameDestination =
    route.workspacePanelTab === options.view &&
    (options.view !== 'explorer' || route.workspacePanelExplorerView === requestedExplorerView) &&
    (options.view !== 'source-control' || currentSourceControlView === requestedSourceControlView)

  if (state.workspacePanelOpen && isSameDestination) {
    state.setWorkspacePanelOpen(false)
    return
  }
  showWorkspacePanel(options)
}

import { useEffect } from 'react'

import { setRuntimeUIState } from '../runtime/ui-client'
import { useAppStore } from '../store/state'
import type { AppState } from '../store/types'

type PersistedUiState = Pick<
  AppState,
  | 'acknowledgedAgentsByPaneKey'
  | 'filterRepoIds'
  | 'groupBy'
  | 'hideDefaultBranchWorkspace'
  | 'markdownTocPanelWidth'
  | 'persistedUIReady'
  | 'projectOrderBy'
  | 'workspacePanelExplorerView'
  | 'workspacePanelOpen'
  | 'workspacePanelTab'
  | 'showDotfilesByWorktree'
  | 'showSleepingWorkspaces'
  | 'sidebarWidth'
  | 'sortBy'
>

export function usePersistedUi(state: PersistedUiState): void {
  useEffect(() => {
    if (!state.persistedUIReady) {
      return
    }
    const timer = window.setTimeout(() => {
      void setRuntimeUIState(useAppStore.getState().settings, {
        sidebarWidth: state.sidebarWidth,
        workspacePanelOpen: state.workspacePanelOpen,
        workspacePanelTab: state.workspacePanelTab,
        workspacePanelExplorerView: state.workspacePanelExplorerView,
        markdownTocPanelWidth: state.markdownTocPanelWidth,
        groupBy: state.groupBy,
        sortBy: state.sortBy,
        projectOrderBy: state.projectOrderBy,
        showActiveOnly: false,
        hideSleepingWorkspaces: !state.showSleepingWorkspaces,
        showSleepingWorkspaces: state.showSleepingWorkspaces,
        hideDefaultBranchWorkspace: state.hideDefaultBranchWorkspace,
        showDotfilesByWorktree: state.showDotfilesByWorktree,
        filterRepoIds: state.filterRepoIds,
        acknowledgedAgentsByPaneKey: state.acknowledgedAgentsByPaneKey
      })
    }, 150)
    return () => window.clearTimeout(timer)
  }, [
    state.acknowledgedAgentsByPaneKey,
    state.filterRepoIds,
    state.groupBy,
    state.hideDefaultBranchWorkspace,
    state.markdownTocPanelWidth,
    state.persistedUIReady,
    state.projectOrderBy,
    state.workspacePanelExplorerView,
    state.workspacePanelOpen,
    state.workspacePanelTab,
    state.showDotfilesByWorktree,
    state.showSleepingWorkspaces,
    state.sidebarWidth,
    state.sortBy
  ])
}

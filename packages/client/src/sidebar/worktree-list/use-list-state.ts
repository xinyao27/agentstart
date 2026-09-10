import { getSettingsFocusedExecutionHostId } from '@agentstart/protocol/host/identity'
import type { ProjectGroup } from '@agentstart/protocol/project/group-model'
import type { Worktree } from '@agentstart/protocol/worktree/model'
import { useShallow } from 'zustand/react/shallow'
import { useNow } from '~renderer/dashboard/use-now'
import { useProjectCatalog } from '~renderer/project-catalog/provider'
import { projectCatalogRepoBuckets } from '~renderer/project-catalog/repo-buckets'
import { getActiveSidebarWorkspaceId } from '~renderer/sidebar/active-workspace'
import { deriveRunningAgentSendTargets } from '~renderer/sidebar/running-agent-targets'
import { useRepoMap, useWorktreeMap } from '~renderer/store/selectors'
import { useAppStore } from '~renderer/store/state'
import type { AppState } from '~renderer/store/types'
import { getWorktreeIdsWithLiveAgent } from '~renderer/worktree/activity-state'

import {
  getVisibleWorktreeBrowserActivityTabs,
  getVisibleWorktreeTerminalActivityTabs
} from '../visible-worktree-activity-inputs'
import { computeVisibleWorktreeIds } from '../visible-worktrees'
import { getPinnedWorktreeDisplayPolicy } from './groups'
import { selectWorktreeListReviewCacheInputs } from './review-cache-inputs'
import { useSmartWorktreeOrder } from './use-smart-order'

const EMPTY_PROJECT_GROUPS: readonly ProjectGroup[] = []
const EMPTY_AGENT_STATUS_BY_PANE_KEY: AppState['agentStatusByPaneKey'] = {}
const EMPTY_WORKTREE_ID_SET: ReadonlySet<string> = new Set()
const EMPTY_TABS_BY_WORKTREE: AppState['tabsByWorktree'] = {}
const EMPTY_TERMINAL_LAYOUTS_BY_TAB_ID: AppState['terminalLayoutsByTabId'] = {}
const EMPTY_PTY_IDS_BY_TAB_ID: AppState['ptyIdsByTabId'] = {}
const EMPTY_RUNTIME_PANE_TITLES_BY_TAB_ID: AppState['runtimePaneTitlesByTabId'] = {}

export function useListState(projectId?: string) {
  const catalog = useProjectCatalog()
  const { detectedWorktreesByRepo, worktreesByRepo } = projectCatalogRepoBuckets(catalog)
  const repoMap = useRepoMap()
  const worktreeMap = useWorktreeMap()
  const { workspaceLineageByChildKey, worktreeLineageById } = catalog
  const activeWorktreeId = useAppStore((state) => state.activeWorktreeId)
  const activeWorkspaceKey = useAppStore((state) => state.activeWorkspaceKey)
  const currentWorktreeId = getActiveSidebarWorkspaceId(activeWorkspaceKey, activeWorktreeId)
  const configuredGroupBy = useAppStore((state) => state.groupBy)
  const groupBy = projectId ? 'repo' : configuredGroupBy
  const setGroupBy = useAppStore((state) => state.setGroupBy)
  const workspaceHostScope = useAppStore((state) => state.workspaceHostScope)
  const visibleWorkspaceHostIds = useAppStore((state) => state.visibleWorkspaceHostIds)
  const workspaceHostOrder = useAppStore((state) => state.workspaceHostOrder)
  const setWorkspaceHostOrder = useAppStore((state) => state.setWorkspaceHostOrder)
  const workspaceStatuses = useAppStore((state) => state.workspaceStatuses)
  const sortBy = useAppStore((state) => state.sortBy)
  const projectOrderBy = useAppStore((state) => state.projectOrderBy)
  const showSleepingWorkspaces = useAppStore((state) => state.showSleepingWorkspaces)
  const agentStatusEpoch = useAppStore((state) =>
    showSleepingWorkspaces ? 0 : state.agentStatusEpoch
  )
  const hideDefaultBranchWorkspace = useAppStore((state) => state.hideDefaultBranchWorkspace)
  const filterRepoIds = useAppStore((state) => state.filterRepoIds)
  const activeModal = useAppStore((state) => state.activeModal)
  const pendingRevealWorktree = useAppStore((state) => state.pendingRevealWorktree)
  const pendingRevealSidebarRow = useAppStore((state) => state.pendingRevealSidebarRow)
  const revealWorktreeInSidebar = useAppStore((state) => state.revealWorktreeInSidebar)
  const revealSidebarRow = useAppStore((state) => state.revealSidebarRow)
  const clearPendingRevealWorktreeId = useAppStore((state) => state.clearPendingRevealWorktreeId)
  const clearPendingRevealSidebarRow = useAppStore((state) => state.clearPendingRevealSidebarRow)
  const agentTargetMode = useAppStore((state) => state.agentSendPopoverTargetMode)
  const agentStatusByPaneKey = useAppStore((state) =>
    agentTargetMode ? state.agentStatusByPaneKey : EMPTY_AGENT_STATUS_BY_PANE_KEY
  )
  const agentTargetEpoch = useAppStore((state) => (agentTargetMode ? state.agentStatusEpoch : 0))
  const agentTabs = useAppStore((state) =>
    agentTargetMode ? state.tabsByWorktree : EMPTY_TABS_BY_WORKTREE
  )
  const agentLayouts = useAppStore((state) =>
    agentTargetMode ? state.terminalLayoutsByTabId : EMPTY_TERMINAL_LAYOUTS_BY_TAB_ID
  )
  const agentPtyIds = useAppStore((state) =>
    agentTargetMode ? state.ptyIdsByTabId : EMPTY_PTY_IDS_BY_TAB_ID
  )
  const agentTitles = useAppStore((state) =>
    agentTargetMode ? state.runtimePaneTitlesByTabId : EMPTY_RUNTIME_PANE_TITLES_BY_TAB_ID
  )
  void agentTargetEpoch
  const agentSendTargetWorktreeId = agentTargetMode
    ? deriveRunningAgentSendTargets(
        {
          agentStatusByPaneKey,
          tabsByWorktree: agentTabs,
          terminalLayoutsByTabId: agentLayouts,
          ptyIdsByTabId: agentPtyIds,
          runtimePaneTitlesByTabId: agentTitles
        },
        agentTargetMode.worktreeId
      ).some((target) => target.status === 'eligible')
      ? agentTargetMode.worktreeId
      : null
    : null
  const needsActivityMaps = !showSleepingWorkspaces || sortBy === 'smart'
  const tabsByWorktree = useAppStore((state) =>
    needsActivityMaps ? getVisibleWorktreeTerminalActivityTabs(state.tabsByWorktree) : null
  )
  const ptyIdsByTabId = useAppStore((state) => (needsActivityMaps ? state.ptyIdsByTabId : null))
  const browserTabsByWorktree = useAppStore((state) =>
    showSleepingWorkspaces
      ? null
      : getVisibleWorktreeBrowserActivityTabs(state.browserTabsByWorktree)
  )
  const cardProps = useAppStore((state) => state.worktreeCardProperties)
  const { prCache, hostedReviewCache } = useAppStore(
    useShallow((state) => selectWorktreeListReviewCacheInputs(state, groupBy, cardProps))
  )
  const settings = useAppStore((state) => state.settings)
  const runtimeStatusByEnvironmentId = useAppStore((state) => state.runtimeStatusByEnvironmentId)
  const sortedIds = useSmartWorktreeOrder(repoMap, sortBy)
  const now = useNow(3_000)
  void agentStatusEpoch
  const visibleIds = computeVisibleWorktreeIds(worktreesByRepo, sortedIds, {
    filterRepoIds,
    showSleepingWorkspaces,
    tabsByWorktree,
    ptyIdsByTabId,
    browserTabsByWorktree,
    worktreeIdsWithLiveAgent: showSleepingWorkspaces
      ? EMPTY_WORKTREE_ID_SET
      : getWorktreeIdsWithLiveAgent(
          useAppStore.getState().agentStatusByPaneKey,
          tabsByWorktree,
          now
        ),
    hideDefaultBranchWorkspace,
    repoMap,
    workspaceHostScope,
    visibleWorkspaceHostIds,
    defaultHostId: getSettingsFocusedExecutionHostId(settings),
    worktreeLineageById
  })
  if (
    agentSendTargetWorktreeId &&
    !visibleIds.includes(agentSendTargetWorktreeId) &&
    worktreeMap.has(agentSendTargetWorktreeId)
  ) {
    visibleIds.push(agentSendTargetWorktreeId)
  }
  const worktrees = visibleIds
    .map((id) => worktreeMap.get(id))
    .filter(
      (worktree): worktree is Worktree =>
        worktree !== undefined && (!projectId || worktree.repoId === projectId)
    )
  return {
    catalog,
    detectedWorktreesByRepo,
    worktreesByRepo,
    repoMap,
    worktreeMap,
    worktreeLineageById,
    workspaceLineageByChildKey,
    activeWorktreeId,
    currentWorktreeId,
    groupBy,
    setGroupBy,
    workspaceHostScope,
    visibleWorkspaceHostIds,
    workspaceHostOrder,
    setWorkspaceHostOrder,
    workspaceStatuses,
    projectOrderBy,
    showSleepingWorkspaces,
    hideDefaultBranchWorkspace,
    filterRepoIds,
    activeModal,
    pendingRevealWorktree,
    pendingRevealSidebarRow,
    revealWorktreeInSidebar,
    revealSidebarRow,
    clearPendingRevealWorktreeId,
    clearPendingRevealSidebarRow,
    agentSendTargetWorktreeId,
    prCache,
    hostedReviewCache,
    settings,
    runtimeStatusByEnvironmentId,
    worktrees,
    collapsedGroups: useAppStore((state) => state.collapsedGroups),
    toggleGroup: useAppStore((state) => state.toggleCollapsedGroup),
    repos: catalog.repos,
    projectGrouping: { projects: catalog.projects, projectHostSetups: catalog.projectHostSetups },
    projectGroups: catalog.projectGroups ?? EMPTY_PROJECT_GROUPS,
    folderWorkspaces: catalog.folderWorkspaces,
    runtimeEnvironments: catalog.runtimeEnvironments,
    pinnedDisplayPolicy: getPinnedWorktreeDisplayPolicy(settings)
  }
}

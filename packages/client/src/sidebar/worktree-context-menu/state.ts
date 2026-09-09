import { getRepoExecutionHostId } from '@yiru/protocol/host/identity'
import type { Repo } from '@yiru/protocol/project/repository'
import { parseWorkspaceKey, worktreeWorkspaceKey } from '@yiru/protocol/workspace/identity'
import type { Worktree } from '@yiru/protocol/worktree/model'
import { translate } from '~renderer/i18n/i18n'
import { useProjectCatalog } from '~renderer/project-catalog/provider'
import { useAppStore } from '~renderer/store/state'
import type { AppState } from '~renderer/store/types'
import { tabHasLivePty } from '~renderer/tab-bar/has-live-pty'
import { getRuntimeEnvironmentIdForWorktree } from '~renderer/worktree/runtime-owner'

import { getWorkspaceStatus } from '../workspace-status'
import { getLineageRenderInfo } from '../worktree-list/groups'
import { getEligibleWorktreeParents } from '../worktree-parent-candidates'

const EMPTY_TABS_BY_WORKTREE: AppState['tabsByWorktree'] = {}
const EMPTY_PTY_IDS_BY_TAB_ID: AppState['ptyIdsByTabId'] = {}
const EMPTY_BROWSER_TABS_BY_WORKTREE: AppState['browserTabsByWorktree'] = {}
const EMPTY_DELETE_STATE_BY_WORKTREE_ID: AppState['deleteStateByWorktreeId'] = {}
const EMPTY_WORKTREE_LINEAGE_BY_ID: AppState['worktreeLineageById'] = {}
const EMPTY_WORKSPACE_LINEAGE_BY_CHILD_KEY: AppState['workspaceLineageByChildKey'] = {}

function selectMenuScopedMap<T>(menuOpen: boolean, live: T, empty: T): T {
  // Why: closed card wrappers should not subscribe to high-churn maps that
  // only feed menu items; stable sentinels keep their Object.is result inert.
  return menuOpen ? live : empty
}

function hasSleepableWorkspaceActivity(
  worktreeId: string,
  tabsByWorktree: AppState['tabsByWorktree'],
  ptyIdsByTabId: AppState['ptyIdsByTabId'],
  browserTabsByWorktree: AppState['browserTabsByWorktree']
): boolean {
  const tabs = tabsByWorktree[worktreeId] ?? []
  const hasLiveTerminal = tabs.some((tab) => tabHasLivePty(ptyIdsByTabId, tab.id))
  return hasLiveTerminal || (browserTabsByWorktree[worktreeId] ?? []).length > 0
}

function shouldRemoveProject(
  repo: Pick<Repo, 'id'> | null | undefined,
  worktree: Pick<Worktree, 'isMainWorktree'>
): boolean {
  return repo != null && worktree.isMainWorktree
}

function isContextWorktreeDeletable(
  worktree: Pick<Worktree, 'isMainWorktree'>,
  repo: Pick<Repo, 'kind'> | null | undefined
): boolean {
  return repo != null && !worktree.isMainWorktree
}

function getSleepLabel(isMultiContext: boolean, count: number): string {
  if (!isMultiContext || count === 0) {
    return translate('auto.components.sidebar.WorktreeContextMenu.sleep', 'Sleep')
  }
  return count === 1
    ? translate(
        'auto.components.sidebar.WorktreeContextMenu.sleepOneWorkspace',
        'Sleep 1 Workspace'
      )
    : translate(
        'auto.components.sidebar.WorktreeContextMenu.sleepWorkspaces',
        'Sleep {{count}} Workspaces',
        { count }
      )
}

function getDeleteLabel(isMultiContext: boolean, count: number): string {
  if (!isMultiContext || count === 0) {
    return translate(
      'auto.components.sidebar.WorktreeContextMenu.deleteSelected',
      'Delete Selected'
    )
  }
  return count === 1
    ? translate(
        'auto.components.sidebar.WorktreeContextMenu.deleteOneWorkspace',
        'Delete 1 Workspace'
      )
    : translate(
        'auto.components.sidebar.WorktreeContextMenu.deleteWorkspaces',
        'Delete {{count}} Workspaces',
        { count }
      )
}

function getDeleteAction(args: {
  deletingContext: boolean
  isMultiContext: boolean
  isMainWorktree: boolean
  removesProject: boolean
  folderWorkspaceId: string | null
  batchDeleteCount: number
}) {
  const isMainWorktreeUnavailable =
    !args.isMultiContext && args.isMainWorktree && !args.removesProject
  const isDisabled =
    args.deletingContext ||
    isMainWorktreeUnavailable ||
    (args.isMultiContext && args.batchDeleteCount === 0)
  const title = isMainWorktreeUnavailable
    ? translate(
        'auto.components.sidebar.WorktreeContextMenu.e091caab15',
        'The project could not be found'
      )
    : undefined

  if (args.deletingContext) {
    return {
      isDisabled,
      title,
      label: translate('auto.components.sidebar.WorktreeContextMenu.b42391d8bf', 'Deleting…')
    }
  }
  if (args.isMultiContext) {
    return {
      isDisabled,
      title,
      label: getDeleteLabel(true, args.batchDeleteCount)
    }
  }
  if (args.folderWorkspaceId) {
    return {
      isDisabled,
      title,
      label: translate('auto.components.sidebar.WorktreeContextMenu.250de158fd', 'Remove Workspace')
    }
  }
  if (args.removesProject) {
    return {
      isDisabled,
      title,
      label: translate(
        'auto.components.sidebar.WorktreeContextMenu.f5ac91531d',
        'Remove Project from Yiru'
      )
    }
  }
  return {
    isDisabled,
    title,
    label: translate('auto.components.sidebar.WorktreeContextMenu.f4475537d8', 'Delete')
  }
}

export function useWorktreeContextMenuState(args: {
  worktree: Worktree
  menuOpen: boolean
  activeContextWorktrees: readonly Worktree[]
}) {
  const { worktree, menuOpen, activeContextWorktrees } = args
  const workspaceStatuses = useAppStore((state) => state.workspaceStatuses)
  const { allWorktrees, projectGroups, repos } = useProjectCatalog()
  const repo = repos.find(
    (candidate) =>
      candidate.id === worktree.repoId &&
      (!worktree.hostId || getRepoExecutionHostId(candidate) === worktree.hostId)
  )
  const runtimeEnvironmentId = useAppStore((state) =>
    getRuntimeEnvironmentIdForWorktree(state, worktree.id)
  )
  const deleteState = useAppStore((state) => state.deleteStateByWorktreeId[worktree.id])
  const contextRepos = worktree.hostId
    ? repos.filter((candidate) => getRepoExecutionHostId(candidate) === worktree.hostId)
    : repos
  const contextWorktrees = worktree.hostId
    ? allWorktrees.filter((candidate) => candidate.hostId === worktree.hostId)
    : allWorktrees
  const repoMap = new Map(contextRepos.map((candidate) => [candidate.id, candidate]))
  const worktreeMap = new Map(contextWorktrees.map((candidate) => [candidate.id, candidate]))
  const worktreeLineageById = useAppStore((state) =>
    selectMenuScopedMap(menuOpen, state.worktreeLineageById, EMPTY_WORKTREE_LINEAGE_BY_ID)
  )
  const workspaceLineageByChildKey = useAppStore((state) =>
    selectMenuScopedMap(
      menuOpen,
      state.workspaceLineageByChildKey,
      EMPTY_WORKSPACE_LINEAGE_BY_CHILD_KEY
    )
  )
  const tabsByWorktree = useAppStore((state) =>
    selectMenuScopedMap(menuOpen, state.tabsByWorktree, EMPTY_TABS_BY_WORKTREE)
  )
  const ptyIdsByTabId = useAppStore((state) =>
    selectMenuScopedMap(menuOpen, state.ptyIdsByTabId, EMPTY_PTY_IDS_BY_TAB_ID)
  )
  const browserTabsByWorktree = useAppStore((state) =>
    selectMenuScopedMap(menuOpen, state.browserTabsByWorktree, EMPTY_BROWSER_TABS_BY_WORKTREE)
  )
  const deleteStateByWorktreeId = useAppStore((state) =>
    selectMenuScopedMap(menuOpen, state.deleteStateByWorktreeId, EMPTY_DELETE_STATE_BY_WORKTREE_ID)
  )
  const isMultiContext = activeContextWorktrees.length > 1
  const isDeleting = deleteState?.isDeleting ?? false
  const sleepableWorktrees = (() =>
    activeContextWorktrees.filter((item) =>
      hasSleepableWorkspaceActivity(item.id, tabsByWorktree, ptyIdsByTabId, browserTabsByWorktree)
    ))()
  const deletingContext = (() =>
    activeContextWorktrees.some((item) => deleteStateByWorktreeId[item.id]?.isDeleting))()
  const contextWorkspaceStatus = (() => {
    const [first, ...rest] = activeContextWorktrees
    if (!first) {
      return ''
    }
    const status = getWorkspaceStatus(first, workspaceStatuses)
    return rest.every((item) => getWorkspaceStatus(item, workspaceStatuses) === status)
      ? status
      : ''
  })()
  const batchDeleteWorktrees = (() =>
    activeContextWorktrees.filter((item) =>
      isContextWorktreeDeletable(item, repoMap.get(item.repoId))
    ))()
  const workspaceScope = parseWorkspaceKey(worktree.id)
  const folderWorkspaceId =
    workspaceScope?.type === 'folder' ? workspaceScope.folderWorkspaceId : null
  const lineage = worktreeLineageById[worktree.id]
  const workspaceLineage = workspaceLineageByChildKey[worktreeWorkspaceKey(worktree.id)]
  // Why: path-derived worktree IDs can be reused. The menu must honor the same
  // instance check as grouped rows before offering navigation to a parent.
  const lineageInfo = (() => getLineageRenderInfo(worktree, worktreeLineageById, worktreeMap))()
  const validParentWorktreeId = lineageInfo.state === 'valid' ? lineageInfo.parent.id : null
  const hasAnyContextLineage = activeContextWorktrees.some(
    (item) =>
      worktreeLineageById[item.id] || workspaceLineageByChildKey[worktreeWorkspaceKey(item.id)]
  )
  const eligibleParentCount = (() =>
    getEligibleWorktreeParents({
      child: worktree,
      worktrees: allWorktrees,
      lineageById: worktreeLineageById,
      worktreeMap,
      repoMap
    }).length)()
  const removesProject = shouldRemoveProject(repo, worktree)

  return {
    activeContextWorktrees,
    batchDeleteWorktrees,
    contextWorkspaceStatus,
    deleteAction: getDeleteAction({
      deletingContext,
      isMultiContext,
      isMainWorktree: worktree.isMainWorktree,
      removesProject,
      folderWorkspaceId,
      batchDeleteCount: batchDeleteWorktrees.length
    }),
    deletingContext,
    eligibleParentCount,
    folderWorkspaceId,
    hasAnyContextLineage,
    isDeleting,
    isMultiContext,
    lineage,
    projectGroups,
    removesProject,
    repo,
    runtimeEnvironmentId,
    sleepableWorktrees,
    sleepLabel: getSleepLabel(isMultiContext, sleepableWorktrees.length),
    validParentWorktreeId,
    workspaceLineage,
    workspaceStatuses,
    worktree
  }
}

export type WorktreeContextMenuState = ReturnType<typeof useWorktreeContextMenuState>

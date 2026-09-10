import {
  ALL_EXECUTION_HOSTS_SCOPE,
  getRepoExecutionHostId,
  getSettingsFocusedExecutionHostId,
  type ExecutionHostId
} from '@agentstart/protocol/host/identity'
import { folderWorkspaceKey } from '@agentstart/protocol/workspace/identity'
import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { getHostDisplayLabelOverrides } from '~renderer/host-setting-overrides'
import { useAppStore } from '~renderer/store/state'

import { getEmptyProjectPlaceholderRepoIds } from '../empty-project-placeholder-repos'
import { buildSidebarHostOptions } from '../host-options'
import { orderHostSectionOptions } from '../host-section-order'
import { addHostSectionRows } from '../host-section-rows'
import { getLogicalRepoOrderRankById } from '../project-header-drop'
import { getRenderedWorktreesInSidebarOrder } from '../worktree-sidebar-row-preference'
import {
  type ImportedWorktreesCardCandidate,
  type NewExternalWorktreesInboxCandidate,
  PINNED_GROUP_KEY,
  buildRows,
  getGroupKeysForWorktree,
  getLineageGroupKey
} from './groups'
import {
  getFolderWorkspaceExecutionHostIdForRows,
  getProjectGroupExecutionHostIdForRows
} from './host-filtering'
import { uniqueWorktreeIds } from './row-model'
import type { useListState } from './use-list-state'

type ListState = ReturnType<typeof useListState>

export function getListScope(state: ListState, projectId?: string) {
  const effectiveCollapsedGroups = (() => {
    const targetId = state.agentSendTargetWorktreeId
    const target = targetId ? state.worktreeMap.get(targetId) : undefined
    if (!target) {
      return state.collapsedGroups
    }
    const next = new Set(state.collapsedGroups)
    if (target.isPinned && state.pinnedDisplayPolicy === 'single-location') {
      next.delete(PINNED_GROUP_KEY)
    } else {
      for (const groupKey of getGroupKeysForWorktree(
        state.groupBy,
        target,
        state.repoMap,
        state.prCache,
        state.workspaceStatuses,
        state.settings,
        state.projectGroups,
        state.projectGrouping
      )) {
        next.delete(groupKey)
      }
    }
    const seen = new Set<string>()
    let current = target
    while (current && !seen.has(current.id)) {
      seen.add(current.id)
      const lineage = state.worktreeLineageById[current.id]
      const parent = lineage ? state.worktreeMap.get(lineage.parentWorktreeId) : undefined
      if (
        !lineage ||
        !parent ||
        current.instanceId !== lineage.worktreeInstanceId ||
        parent.instanceId !== lineage.parentWorktreeInstanceId
      ) {
        break
      }
      next.delete(getLineageGroupKey(parent.id))
      current = parent
    }
    return next
  })()
  const defaultHostId = getSettingsFocusedExecutionHostId(state.settings)
  const requestedHostIds =
    state.visibleWorkspaceHostIds ??
    (state.workspaceHostScope === ALL_EXECUTION_HOSTS_SCOPE ? null : [state.workspaceHostScope])
  const visibleHostIds = requestedHostIds ? new Set<ExecutionHostId>(requestedHostIds) : null
  const scopedRepos = projectId ? state.repos.filter((repo) => repo.id === projectId) : state.repos
  const visibleRepos = visibleHostIds
    ? scopedRepos.filter((repo) =>
        visibleHostIds.has(repo.executionHostId ? getRepoExecutionHostId(repo) : defaultHostId)
      )
    : scopedRepos
  const visibleProjectGroups = projectId
    ? []
    : visibleHostIds
      ? state.projectGroups.filter((group) =>
          visibleHostIds.has(getProjectGroupExecutionHostIdForRows(group, defaultHostId))
        )
      : state.projectGroups
  const projectGroupById = new Map(state.projectGroups.map((group) => [group.id, group]))
  const visibleFolderWorkspaces = projectId
    ? []
    : visibleHostIds
      ? state.folderWorkspaces.filter((workspace) =>
          visibleHostIds.has(
            getFolderWorkspaceExecutionHostIdForRows({
              folderWorkspace: workspace,
              projectGroup: projectGroupById.get(workspace.projectGroupId),
              defaultHostId
            })
          )
        )
      : state.folderWorkspaces
  return {
    effectiveCollapsedGroups,
    defaultHostId,
    visibleRepos,
    visibleProjectGroups,
    visibleFolderWorkspaces,
    repoOrder: getLogicalRepoOrderRankById(state.repos.map((repo) => repo.id)),
    placeholderRepoIds: getEmptyProjectPlaceholderRepoIds({
      groupBy: state.groupBy,
      repos: visibleRepos,
      worktreesByRepo: state.worktreesByRepo,
      visibleWorktrees: state.worktrees,
      filterRepoIds: state.filterRepoIds
    })
  }
}

export function useListRows(args: {
  projectId?: string
  state: ListState
  scope: ReturnType<typeof getListScope>
  importedByRepo: ReadonlyMap<string, ImportedWorktreesCardCandidate>
  inboxByRepo: ReadonlyMap<string, NewExternalWorktreesInboxCandidate>
}) {
  const state = args.state
  const {
    effectiveCollapsedGroups,
    defaultHostId,
    visibleRepos,
    visibleProjectGroups,
    visibleFolderWorkspaces,
    repoOrder,
    placeholderRepoIds
  } = args.scope
  const pendingCreationKeys = useAppStore(
    useShallow((store) =>
      Object.values(store.pendingWorktreeCreations ?? {}).map(
        (creation) => `${creation.creationId} ${creation.request.repoId}`
      )
    )
  )
  const pendingCreations = pendingCreationKeys.map((key) => {
    const separator = key.indexOf(' ')
    return { creationId: key.slice(0, separator), repoId: key.slice(separator + 1) }
  })
  const hostOptions = buildSidebarHostOptions({
    repos: state.repos,
    settings: state.settings,
    runtimeEnvironments: state.runtimeEnvironments,
    runtimeStatusByEnvironmentId: state.runtimeStatusByEnvironmentId,
    hostLabelOverrides: getHostDisplayLabelOverrides(state.settings)
  })
  const rows = buildRows({
    groupBy: state.groupBy,
    worktrees: state.worktrees,
    repoMap: state.repoMap,
    prCache: state.prCache,
    collapsedGroups: effectiveCollapsedGroups,
    repoOrder,
    workspaceStatuses: state.workspaceStatuses,
    projectOrderBy: state.projectOrderBy,
    lineageById: state.worktreeLineageById,
    worktreeMap: state.worktreeMap,
    nestLineage: true,
    settings: state.settings,
    projectGroups: visibleProjectGroups,
    placeholderRepoIds,
    importedWorktreesByRepo: args.importedByRepo,
    newExternalWorktreesInboxByRepo: args.inboxByRepo,
    pendingCreations,
    projectGrouping: state.projectGrouping,
    folderWorkspaces: visibleFolderWorkspaces,
    hostLabelById: new Map(hostOptions.map((host) => [host.id, host.label])),
    defaultHostId,
    pinnedDisplayPolicy: state.pinnedDisplayPolicy
  })
  const orderedHosts = orderHostSectionOptions(hostOptions, state.workspaceHostOrder)
  const [hostDragActive, setHostDragActive] = useState(false)
  const reorderHosts = (orderedVisibleHostIds: ExecutionHostId[]): void => {
    const visible = new Set(orderedVisibleHostIds)
    const known = new Set(orderedHosts.map((host) => host.id))
    const next = [...orderedVisibleHostIds]
    for (const hostId of [...state.workspaceHostOrder, ...known]) {
      if (known.has(hostId) && !visible.has(hostId) && !next.includes(hostId)) {
        next.push(hostId)
      }
    }
    state.setWorkspaceHostOrder(next)
  }
  const sectionRows = addHostSectionRows({
    rows,
    hostOptions: orderedHosts,
    workspaceHostScope: state.workspaceHostScope,
    visibleWorkspaceHostIds: state.visibleWorkspaceHostIds,
    defaultHostId,
    collapsedHostKeys: effectiveCollapsedGroups,
    forceCollapseHosts: hostDragActive,
    preferProjectGrouping: true
  })
  const renderedRowKeys = new Set(
    sectionRows.flatMap((row) => {
      if (
        row.type === 'header' ||
        row.type === 'imported-worktrees-card' ||
        row.type === 'new-external-worktrees-inbox'
      ) {
        return [row.key]
      }
      if (row.type === 'item') {
        return [row.rowKey]
      }
      if (row.type === 'folder-workspace') {
        return [folderWorkspaceKey(row.folderWorkspace.id)]
      }
      if (row.type === 'pending-creation') {
        return [`pending:${row.creationId}`]
      }
      return []
    })
  )
  const renderedWorktrees = getRenderedWorktreesInSidebarOrder(
    sectionRows,
    state.pinnedDisplayPolicy
  )
  return {
    effectiveCollapsedGroups,
    visibleRepos,
    repoOrder,
    placeholderRepoIds,
    rows,
    sectionRows,
    renderedRowKeys,
    renderedWorktrees,
    renderedWorktreeIds: uniqueWorktreeIds(renderedWorktrees.map((worktree) => worktree.id)),
    allRepoIds: state.repos.map((repo) => repo.id),
    viewportResetKey: `group:${state.groupBy}:host:${state.visibleWorkspaceHostIds?.join(',') ?? 'all'}:lineage`,
    reorderHosts,
    setHostDragActive
  }
}

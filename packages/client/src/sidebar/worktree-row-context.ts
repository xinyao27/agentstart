import { LOCAL_EXECUTION_HOST_ID, type ExecutionHostId } from '@agentstart/protocol/host/identity'
import type { ProjectGroup } from '@agentstart/protocol/project/group-model'
import type { Repo } from '@agentstart/protocol/project/repository'
import type { ProjectOrderBy } from '@agentstart/protocol/settings/ui-state'
import type { FolderWorkspace } from '@agentstart/protocol/workspace/folder'
import type { WorkspaceStatusDefinition } from '@agentstart/protocol/workspace/status/model'
import { cloneDefaultWorkspaceStatuses } from '@agentstart/protocol/workspace/status/normalize'
import type { WorktreeLineage } from '@agentstart/protocol/worktree/lineage'
import type { Worktree } from '@agentstart/protocol/worktree/model'

import { ALL_GROUP_KEY, ALL_GROUP_META } from './worktree-group-metadata'
import { getHostWorktreeMetadata, getRenderedNaturalAnchorRepoIds } from './worktree-host-context'
import {
  buildPendingCreationRow,
  type BuildRowsOptions,
  type ImportedWorktreesCardCandidate,
  type NewExternalWorktreesInboxCandidate,
  type PendingCreationRef,
  type PinnedWorktreeDisplayPolicy,
  type ProjectGroupingModel,
  type Row,
  type WorktreeGroupBy
} from './worktree-list/rows'
import { buildProjectGroupingIndex, type ProjectGroupingIndex } from './worktree-project-grouping'
import { appendWorktreeRows, emitPinnedGroup } from './worktree-row-emission'

export type WorktreeRowContext = {
  groupBy: WorktreeGroupBy
  worktrees: Worktree[]
  naturalWorktrees: Worktree[]
  repoMap: Map<string, Repo>
  prCache: Record<string, unknown> | null
  collapsedGroups: Set<string>
  repoOrder: Map<string, number> | undefined
  workspaceStatuses: readonly WorkspaceStatusDefinition[]
  projectOrderBy: ProjectOrderBy
  lineageById: Record<string, WorktreeLineage>
  worktreeMap: Map<string, Worktree>
  nestLineage: boolean
  settings: BuildRowsOptions['settings']
  projectGroups: readonly ProjectGroup[]
  placeholderRepoIds: ReadonlySet<string>
  importedWorktreesByRepo: ReadonlyMap<string, ImportedWorktreesCardCandidate>
  newExternalWorktreesInboxByRepo: ReadonlyMap<string, NewExternalWorktreesInboxCandidate>
  pendingByRepo: ReadonlyMap<string, readonly PendingCreationRef[]>
  projectGrouping: ProjectGroupingModel | undefined
  folderWorkspaces: readonly FolderWorkspace[]
  hostLabelById: ReadonlyMap<string, string> | undefined
  defaultHostId: ExecutionHostId
  projectIndex: ProjectGroupingIndex | null
  result: Row[]
}

export function getPinnedWorktreeDisplayPolicy(
  settings?: { showPinnedWorktreesInGroups?: boolean } | null
): PinnedWorktreeDisplayPolicy {
  return settings?.showPinnedWorktreesInGroups === true ? 'duplicate-in-groups' : 'single-location'
}

export function createWorktreeRowContext(options: BuildRowsOptions): WorktreeRowContext {
  const settings = options.settings
  const pinnedDisplayPolicy =
    options.pinnedDisplayPolicy ?? getPinnedWorktreeDisplayPolicy(settings)
  const naturalWorktrees =
    pinnedDisplayPolicy === 'duplicate-in-groups'
      ? options.worktrees
      : options.worktrees.filter((worktree) => !worktree.isPinned)
  const workspaceStatuses = options.workspaceStatuses ?? cloneDefaultWorkspaceStatuses()
  const pendingCreations = options.pendingCreations ?? []
  const pendingByRepo = new Map<string, PendingCreationRef[]>()
  for (const creation of pendingCreations) {
    const list = pendingByRepo.get(creation.repoId) ?? []
    list.push(creation)
    pendingByRepo.set(creation.repoId, list)
  }
  const result: Row[] = []
  if (options.groupBy !== 'repo') {
    for (const creation of pendingCreations) {
      result.push(buildPendingCreationRow(creation, options.repoMap))
    }
  }
  const importedWorktreesByRepo = options.importedWorktreesByRepo ?? new Map()
  emitPinnedGroup(
    options.worktrees,
    options.repoMap,
    options.defaultHostId ?? LOCAL_EXECUTION_HOST_ID,
    options.collapsedGroups,
    getRenderedNaturalAnchorRepoIds({
      groupBy: options.groupBy,
      worktrees: naturalWorktrees,
      repoMap: options.repoMap,
      prCache: options.prCache,
      collapsedGroups: options.collapsedGroups,
      workspaceStatuses,
      settings,
      projectGrouping: options.projectGrouping
    }),
    importedWorktreesByRepo,
    options.groupBy !== 'repo',
    result
  )
  return {
    groupBy: options.groupBy,
    worktrees: options.worktrees,
    naturalWorktrees,
    repoMap: options.repoMap,
    prCache: options.prCache,
    collapsedGroups: options.collapsedGroups,
    repoOrder: options.repoOrder,
    workspaceStatuses,
    projectOrderBy: options.projectOrderBy ?? 'manual',
    lineageById: options.lineageById ?? {},
    worktreeMap:
      options.worktreeMap ?? new Map(options.worktrees.map((worktree) => [worktree.id, worktree])),
    nestLineage: options.nestLineage ?? false,
    settings,
    projectGroups: options.projectGroups ?? [],
    placeholderRepoIds: options.placeholderRepoIds ?? new Set(),
    importedWorktreesByRepo,
    newExternalWorktreesInboxByRepo: options.newExternalWorktreesInboxByRepo ?? new Map(),
    pendingByRepo,
    projectGrouping: options.projectGrouping,
    folderWorkspaces: options.folderWorkspaces ?? [],
    hostLabelById: options.hostLabelById,
    defaultHostId: options.defaultHostId ?? LOCAL_EXECUTION_HOST_ID,
    projectIndex: buildProjectGroupingIndex(options.projectGrouping),
    result
  }
}

export function appendUngroupedWorktrees(context: WorktreeRowContext): boolean {
  if (context.groupBy !== 'none') {
    return false
  }
  if (context.naturalWorktrees.length > 0) {
    context.result.push({
      type: 'header',
      key: ALL_GROUP_KEY,
      label: ALL_GROUP_META.label,
      count: context.naturalWorktrees.length,
      tone: ALL_GROUP_META.tone,
      icon: ALL_GROUP_META.icon,
      ...getHostWorktreeMetadata(context.naturalWorktrees, context.repoMap, context.defaultHostId),
      worktreeIds: context.naturalWorktrees.map((worktree) => worktree.id)
    })
    if (!context.collapsedGroups.has(ALL_GROUP_KEY)) {
      appendWorktreeRows(
        context.result,
        context.naturalWorktrees,
        context.repoMap,
        context.lineageById,
        context.worktreeMap,
        {
          nestLineage: context.nestLineage,
          collapsedGroups: context.collapsedGroups,
          groupDepth: 0,
          sectionKey: ALL_GROUP_KEY
        }
      )
    }
  }
  return true
}

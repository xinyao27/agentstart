import { workspaceStatusLabel } from '~renderer/sidebar/workspace-status-label'

import { orderMainWorktreeFirst } from './project-row-order'
import { getWorkspaceStatusFromGroupKey, getWorkspaceStatusVisualMeta } from './workspace-status'
import { PR_GROUP_META, PR_GROUP_ORDER, PROJECT_GROUP_META } from './worktree-group-metadata'
import { getHostWorktreeMetadata, getMixedHostContextLabels } from './worktree-host-context'
import {
  buildPendingCreationRow,
  type GroupHeaderRow,
  type OrderedGroupEntry
} from './worktree-list/rows'
import type { WorktreeRowContext } from './worktree-row-context'
import { buildNewExternalWorktreesInboxRow, appendWorktreeRows } from './worktree-row-emission'

function buildGroupHeader(
  context: WorktreeRowContext,
  key: string,
  group: OrderedGroupEntry[1],
  projectGroupDepth: number
): GroupHeaderRow {
  if (context.groupBy === 'repo') {
    return {
      type: 'header',
      key,
      label: group.label,
      count: group.items.length,
      tone: PROJECT_GROUP_META.tone,
      icon: PROJECT_GROUP_META.icon,
      repo: group.repo,
      projectGroupDepth,
      projectId: group.projectId,
      projectIdentityKey: group.projectIdentityKey,
      collapsed: context.collapsedGroups.has(key)
    }
  }
  if (context.groupBy === 'workspace-status') {
    const status =
      getWorkspaceStatusFromGroupKey(key, context.workspaceStatuses) ??
      context.workspaceStatuses[0]?.id ??
      'in-progress'
    const definition = context.workspaceStatuses.find((entry) => entry.id === status)
    const meta = getWorkspaceStatusVisualMeta(definition ?? status)
    return {
      type: 'header',
      key,
      label: definition ? workspaceStatusLabel(definition) : status,
      count: group.items.length,
      tone: meta.tone,
      icon: meta.icon,
      ...getHostWorktreeMetadata(group.items, context.repoMap, context.defaultHostId),
      worktreeIds: group.items.map((worktree) => worktree.id)
    }
  }
  const prGroup = PR_GROUP_ORDER.find((candidate) => key === `pr:${candidate}`) ?? 'in-progress'
  const meta = PR_GROUP_META[prGroup]
  return {
    type: 'header',
    key,
    label: meta.label,
    count: group.items.length,
    tone: meta.tone,
    icon: meta.icon,
    ...getHostWorktreeMetadata(group.items, context.repoMap, context.defaultHostId),
    worktreeIds: group.items.map((worktree) => worktree.id)
  }
}

function appendRepoPrelude(
  context: WorktreeRowContext,
  key: string,
  group: OrderedGroupEntry[1]
): void {
  if (context.groupBy !== 'repo') {
    return
  }
  const repoIds =
    group.repoIds.size > 0
      ? [...group.repoIds]
      : group.repo
        ? [group.repo.id]
        : key.startsWith('repo:')
          ? [key.slice('repo:'.length)]
          : []
  for (const repoId of repoIds) {
    const candidate = context.newExternalWorktreesInboxByRepo.get(repoId)
    if (candidate) {
      context.result.push(buildNewExternalWorktreesInboxRow(candidate))
    }
  }
  for (const repoId of repoIds) {
    for (const creation of context.pendingByRepo.get(repoId) ?? []) {
      context.result.push(buildPendingCreationRow(creation, context.repoMap))
    }
  }
}

export function appendOrderedGroups(
  context: WorktreeRowContext,
  groups: OrderedGroupEntry[],
  projectGroupDepth = 0
): void {
  for (const [key, group] of groups) {
    const isCollapsed = context.collapsedGroups.has(key)
    context.result.push(buildGroupHeader(context, key, group, projectGroupDepth))
    if (isCollapsed) {
      continue
    }
    appendRepoPrelude(context, key, group)
    const items = context.groupBy === 'repo' ? orderMainWorktreeFirst(group.items) : group.items
    const hostContextLabelByRepoId =
      context.groupBy === 'repo'
        ? getMixedHostContextLabels(
            group,
            context.repoMap,
            context.projectIndex,
            context.hostLabelById
          )
        : undefined
    appendWorktreeRows(
      context.result,
      items,
      context.repoMap,
      context.lineageById,
      context.worktreeMap,
      {
        nestLineage: context.nestLineage,
        collapsedGroups: context.collapsedGroups,
        groupDepth: projectGroupDepth,
        sectionKey: key,
        hostContextLabelByRepoId
      }
    )
  }
}

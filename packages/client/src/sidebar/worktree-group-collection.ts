import type { Repo } from '@yiru/protocol/project/repository'
import { workspaceStatusLabel } from '~renderer/sidebar/workspace-status-label'

import { getManualOrderAnchorRepo, sortProjectEntries } from './project-row-order'
import { getWorkspaceStatus, getWorkspaceStatusGroupKey } from './workspace-status'
import { getPRGroupKey, PR_GROUP_META, PR_GROUP_ORDER } from './worktree-group-metadata'
import type { OrderedGroupEntry, WorktreeGroupEntry } from './worktree-list/rows'
import { getProjectGroupingForRepo } from './worktree-project-grouping'
import type { WorktreeRowContext } from './worktree-row-context'

function addRepoId(group: WorktreeGroupEntry, repoId: string): void {
  group.repoIds.add(repoId)
}

function ensureRepoGroup(
  context: WorktreeRowContext,
  grouped: Map<string, WorktreeGroupEntry>,
  repoId: string,
  fallbackRepo?: Repo,
  requireKnownRepo = false
): void {
  const grouping = getProjectGroupingForRepo(repoId, context.repoMap, context.projectIndex)
  if (requireKnownRepo && !grouping.repo) {
    return
  }
  const current = grouped.get(grouping.key)
  if (current) {
    addRepoId(current, repoId)
    return
  }
  grouped.set(grouping.key, {
    label: grouping.label,
    items: [],
    repo: grouping.repo ?? fallbackRepo,
    repoIds: new Set([repoId]),
    projectId: grouping.projectId,
    projectIdentityKey: grouping.projectIdentityKey
  })
}

function collectNaturalWorktreeGroups(
  context: WorktreeRowContext
): Map<string, WorktreeGroupEntry> {
  const grouped = new Map<string, WorktreeGroupEntry>()
  for (const worktree of context.naturalWorktrees) {
    let key: string
    let label: string
    let repo: Repo | undefined
    let projectId: string | undefined
    let projectIdentityKey: string | undefined
    if (context.groupBy === 'repo') {
      const grouping = getProjectGroupingForRepo(
        worktree.repoId,
        context.repoMap,
        context.projectIndex
      )
      key = grouping.key
      label = grouping.label
      repo = grouping.repo
      projectId = grouping.projectId
      projectIdentityKey = grouping.projectIdentityKey
    } else if (context.groupBy === 'workspace-status') {
      const status = getWorkspaceStatus(worktree, context.workspaceStatuses)
      key = getWorkspaceStatusGroupKey(status)
      const definition = context.workspaceStatuses.find((entry) => entry.id === status)
      label = definition ? workspaceStatusLabel(definition) : status
    } else {
      const prGroup = getPRGroupKey(worktree, context.repoMap, context.prCache, context.settings)
      key = `pr:${prGroup}`
      label = PR_GROUP_META[prGroup].label
    }
    const current = grouped.get(key)
    if (current) {
      current.items.push(worktree)
      addRepoId(current, worktree.repoId)
    } else {
      grouped.set(key, {
        label,
        items: [worktree],
        repo,
        repoIds: new Set([worktree.repoId]),
        projectId,
        projectIdentityKey
      })
    }
  }
  return grouped
}

function addRepoOnlyGroups(
  context: WorktreeRowContext,
  grouped: Map<string, WorktreeGroupEntry>
): void {
  if (context.groupBy !== 'repo') {
    return
  }
  for (const repoId of context.placeholderRepoIds) {
    ensureRepoGroup(context, grouped, repoId, undefined, true)
  }
  for (const [repoId, candidate] of context.importedWorktreesByRepo) {
    ensureRepoGroup(context, grouped, repoId, candidate.repo)
  }
  for (const [repoId, candidate] of context.newExternalWorktreesInboxByRepo) {
    ensureRepoGroup(context, grouped, repoId, candidate.repo)
  }
  for (const repoId of context.pendingByRepo.keys()) {
    ensureRepoGroup(context, grouped, repoId)
  }
}

export function buildOrderedWorktreeGroups(context: WorktreeRowContext): OrderedGroupEntry[] {
  const grouped = collectNaturalWorktreeGroups(context)
  addRepoOnlyGroups(context, grouped)
  const orderedGroups: OrderedGroupEntry[] = []
  if (context.groupBy === 'pr-status') {
    for (const prGroup of PR_GROUP_ORDER) {
      const key = `pr:${prGroup}`
      const group = grouped.get(key)
      if (group) {
        orderedGroups.push([key, group])
      }
    }
    return orderedGroups
  }
  if (context.groupBy === 'workspace-status') {
    for (const status of context.workspaceStatuses) {
      const key = getWorkspaceStatusGroupKey(status.id)
      const group = grouped.get(key)
      if (group) {
        orderedGroups.push([key, group])
      }
    }
    return orderedGroups
  }
  for (const group of grouped.values()) {
    group.repo = getManualOrderAnchorRepo(group, context.repoMap, context.repoOrder)
  }
  return sortProjectEntries(
    Array.from(grouped.entries()),
    context.projectOrderBy,
    context.repoOrder
  )
}

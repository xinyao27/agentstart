import type { ProjectGroup } from '@agentstart/protocol/project/group-model'
import type { FolderWorkspace } from '@agentstart/protocol/workspace/folder'

import { sortProjectGroupEntries, withRepoSectionDisplayLabels } from './project-row-order'
import { getProjectGroupHeaderKey, PROJECT_GROUP_META } from './worktree-group-metadata'
import type { OrderedGroupEntry } from './worktree-list/rows'
import type { WorktreeRowContext } from './worktree-row-context'
import { appendOrderedGroups } from './worktree-section-emission'

export function appendProjectGroupTree(
  context: WorktreeRowContext,
  orderedGroups: OrderedGroupEntry[]
): boolean {
  if (context.groupBy !== 'repo' || context.projectGroups.length === 0) {
    return false
  }
  const entriesByGroupId = new Map<string | null, OrderedGroupEntry[]>()
  for (const entry of orderedGroups) {
    const projectGroupId = entry[1].repo?.projectGroupId ?? null
    const list = entriesByGroupId.get(projectGroupId) ?? []
    list.push(entry)
    entriesByGroupId.set(projectGroupId, list)
  }
  const projectGroupsById = new Map(context.projectGroups.map((group) => [group.id, group]))
  const folderWorkspacesByGroupId = new Map<string, FolderWorkspace[]>()
  for (const workspace of context.folderWorkspaces) {
    const group = projectGroupsById.get(workspace.projectGroupId)
    if (!group?.parentPath) {
      continue
    }
    const list = folderWorkspacesByGroupId.get(workspace.projectGroupId) ?? []
    list.push(workspace)
    folderWorkspacesByGroupId.set(workspace.projectGroupId, list)
  }
  for (const list of folderWorkspacesByGroupId.values()) {
    list.sort((left, right) => {
      const leftOrder = left.manualOrder ?? left.sortOrder
      const rightOrder = right.manualOrder ?? right.sortOrder
      return rightOrder - leftOrder || left.name.localeCompare(right.name)
    })
  }
  const childGroupsByParentId = new Map<string | null, ProjectGroup[]>()
  for (const group of context.projectGroups) {
    const parentId =
      group.parentGroupId && projectGroupsById.has(group.parentGroupId) ? group.parentGroupId : null
    const children = childGroupsByParentId.get(parentId) ?? []
    children.push(group)
    childGroupsByParentId.set(parentId, children)
  }
  for (const groups of childGroupsByParentId.values()) {
    groups.sort(
      (left, right) => left.tabOrder - right.tabOrder || left.name.localeCompare(right.name)
    )
  }

  const getSubtreeCount = (groupId: string): number => {
    const directCount = entriesByGroupId.get(groupId)?.length ?? 0
    const folderCount = folderWorkspacesByGroupId.get(groupId)?.length ?? 0
    return (childGroupsByParentId.get(groupId) ?? []).reduce(
      (count, child) => count + getSubtreeCount(child.id),
      directCount + folderCount
    )
  }

  const appendProjectGroup = (projectGroup: ProjectGroup, depth: number): void => {
    const repoEntries = sortProjectGroupEntries(
      entriesByGroupId.get(projectGroup.id) ?? [],
      context.projectOrderBy,
      context.repoOrder
    )
    const key = getProjectGroupHeaderKey(projectGroup.id)
    context.result.push({
      type: 'header',
      key,
      label: projectGroup.name,
      count: getSubtreeCount(projectGroup.id),
      tone: PROJECT_GROUP_META.tone,
      icon: PROJECT_GROUP_META.icon,
      projectGroup,
      projectGroupDepth: depth
    })
    if (!context.collapsedGroups.has(key)) {
      for (const folderWorkspace of folderWorkspacesByGroupId.get(projectGroup.id) ?? []) {
        context.result.push({
          type: 'folder-workspace',
          key: `folder-workspace:${folderWorkspace.id}`,
          folderWorkspace,
          projectGroup,
          depth: 0,
          groupDepth: depth + 1
        })
      }
      appendOrderedGroups(context, withRepoSectionDisplayLabels(repoEntries), depth + 1)
      for (const childGroup of childGroupsByParentId.get(projectGroup.id) ?? []) {
        appendProjectGroup(childGroup, depth + 1)
      }
    }
    entriesByGroupId.delete(projectGroup.id)
  }

  for (const projectGroup of childGroupsByParentId.get(null) ?? []) {
    appendProjectGroup(projectGroup, 0)
  }
  const remainingEntries = [...(entriesByGroupId.get(null) ?? [])]
  for (const [projectGroupId, entries] of entriesByGroupId) {
    if (projectGroupId !== null && !projectGroupsById.has(projectGroupId)) {
      // Why: host group metadata can hydrate after repos; keep those rows in
      // the top-level fallback until their hierarchy arrives.
      remainingEntries.push(...entries)
    }
  }
  appendOrderedGroups(
    context,
    withRepoSectionDisplayLabels(
      sortProjectGroupEntries(remainingEntries, context.projectOrderBy, context.repoOrder)
    )
  )
  return true
}

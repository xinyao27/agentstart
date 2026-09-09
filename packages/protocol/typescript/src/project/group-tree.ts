import type { ProjectGroup } from './group-model.js'

export function getProjectGroupSubtreeIds(
  groups: readonly Pick<ProjectGroup, 'id' | 'parentGroupId'>[],
  rootGroupId: string
): Set<string> {
  const childGroupsByParentId = new Map<string, string[]>()
  for (const group of groups) {
    if (!group.parentGroupId) {
      continue
    }
    const children = childGroupsByParentId.get(group.parentGroupId) ?? []
    children.push(group.id)
    childGroupsByParentId.set(group.parentGroupId, children)
  }

  const subtreeIds = new Set<string>()
  const pending = [rootGroupId]
  while (pending.length > 0) {
    const groupId = pending.pop()!
    if (subtreeIds.has(groupId)) {
      continue
    }
    subtreeIds.add(groupId)
    // Why: imported project-group trees can be very wide; `push(...children)`
    // can exceed V8's argument limit while collecting descendants.
    for (const childGroupId of childGroupsByParentId.get(groupId) ?? []) {
      pending.push(childGroupId)
    }
  }
  return subtreeIds
}

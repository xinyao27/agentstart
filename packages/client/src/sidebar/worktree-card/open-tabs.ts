import type { Tab, TabGroup, TabGroupLayoutNode } from '@agentstart/protocol/workspace/tabs'

export type SidebarOpenTab = {
  tab: Tab
  isActive: boolean
}

function collectLayoutGroupIds(node: TabGroupLayoutNode | undefined): string[] {
  if (!node) {
    return []
  }
  if (node.type === 'leaf') {
    return [node.groupId]
  }
  return [...collectLayoutGroupIds(node.first), ...collectLayoutGroupIds(node.second)]
}

function appendGroupTabs(
  rows: SidebarOpenTab[],
  seenTabIds: Set<string>,
  tabs: readonly Tab[],
  group: TabGroup,
  activeGroupId: string | undefined
): void {
  const tabsById = new Map(
    tabs.filter((tab) => tab.groupId === group.id).map((tab) => [tab.id, tab])
  )
  const orderedTabs = [
    ...group.tabOrder.flatMap((tabId) => {
      const tab = tabsById.get(tabId)
      return tab ? [tab] : []
    }),
    ...[...tabsById.values()]
      .filter((tab) => !group.tabOrder.includes(tab.id))
      .sort((left, right) => left.sortOrder - right.sortOrder || left.createdAt - right.createdAt)
  ]

  for (const tab of orderedTabs) {
    if (seenTabIds.has(tab.id)) {
      continue
    }
    seenTabIds.add(tab.id)
    rows.push({
      tab,
      isActive: group.id === activeGroupId && group.activeTabId === tab.id
    })
  }
}

export function projectSidebarOpenTabs(args: {
  tabs: readonly Tab[]
  groups: readonly TabGroup[]
  layout: TabGroupLayoutNode | undefined
  activeGroupId: string | undefined
}): SidebarOpenTab[] {
  const rows: SidebarOpenTab[] = []
  const seenTabIds = new Set<string>()
  const groupsById = new Map(args.groups.map((group) => [group.id, group]))
  const orderedGroupIds = [
    ...collectLayoutGroupIds(args.layout),
    ...args.groups.map((group) => group.id)
  ]

  for (const groupId of orderedGroupIds) {
    const group = groupsById.get(groupId)
    if (group) {
      appendGroupTabs(rows, seenTabIds, args.tabs, group, args.activeGroupId)
      groupsById.delete(groupId)
    }
  }

  for (const tab of args.tabs) {
    if (!seenTabIds.has(tab.id)) {
      rows.push({ tab, isActive: false })
    }
  }
  return rows
}

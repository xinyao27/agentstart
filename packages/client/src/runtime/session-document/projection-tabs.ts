import type { WorkspaceSessionState } from '@agentstart/protocol/workspace/session'
import type { Tab, TabGroup, TerminalTab } from '@agentstart/protocol/workspace/tabs'
import { buildOwnedEditorFileId } from '~renderer/editor/file-identity'
import type { AppState } from '~renderer/store/types'
import { collectLeafIdsInOrder } from '~renderer/terminal-pane/terminal-layout-leaf-ids'

type ProjectedTabs = Pick<
  AppState,
  | 'tabsByWorktree'
  | 'terminalLayoutsByTabId'
  | 'unifiedTabsByWorktree'
  | 'groupsByWorktree'
  | 'layoutByWorktree'
  | 'activeGroupIdByWorktree'
  | 'activeTabIdByWorktree'
  | 'ptyIdsByTabId'
>

export function projectSessionTabs(
  state: AppState,
  session: WorkspaceSessionState,
  owns: (worktree: string) => boolean
): ProjectedTabs {
  const next: ProjectedTabs = {
    tabsByWorktree: { ...state.tabsByWorktree },
    ptyIdsByTabId: { ...state.ptyIdsByTabId },
    terminalLayoutsByTabId: { ...state.terminalLayoutsByTabId },
    unifiedTabsByWorktree: { ...state.unifiedTabsByWorktree },
    groupsByWorktree: { ...state.groupsByWorktree },
    layoutByWorktree: { ...state.layoutByWorktree },
    activeGroupIdByWorktree: { ...state.activeGroupIdByWorktree },
    activeTabIdByWorktree: { ...state.activeTabIdByWorktree }
  }
  const worktrees = new Set([
    ...Object.keys(state.tabsByWorktree),
    ...Object.keys(state.unifiedTabsByWorktree),
    ...Object.keys(session.tabsByWorktree),
    ...Object.keys(session.unifiedTabs ?? {}),
    ...Object.keys(session.openFilesByWorktree ?? {})
  ])
  for (const worktree of worktrees) {
    if (!owns(worktree)) {
      continue
    }
    const previous = state.tabsByWorktree[worktree] ?? []
    const terminals = (session.tabsByWorktree[worktree] ?? []).map((tab) => ({
      ...previous.find((old) => old.id === tab.id),
      ...tab,
      ptyId: tab.ptyId,
      pendingActivationSpawn: false
    }))
    next.tabsByWorktree[worktree] = terminals
    const terminalIds = new Set(terminals.map((tab) => tab.id))
    for (const tab of previous) {
      if (!terminalIds.has(tab.id)) {
        delete next.terminalLayoutsByTabId[tab.id]
        delete next.ptyIdsByTabId[tab.id]
      }
    }
    for (const tab of terminals) {
      const layout = session.terminalLayoutsByTabId[tab.id]
      next.ptyIdsByTabId[tab.id] = [
        ...new Set([
          ...Object.values(layout?.ptyIdsByLeafId ?? {}),
          ...(tab.ptyId ? [tab.ptyId] : [])
        ])
      ]
      if (!layout) {
        delete next.terminalLayoutsByTabId[tab.id]
        continue
      }
      const prior = state.terminalLayoutsByTabId[tab.id]
      const leaves = collectLeafIdsInOrder(layout.root)
      next.terminalLayoutsByTabId[tab.id] = {
        ...layout,
        activeLeafId:
          prior?.activeLeafId && leaves.includes(prior.activeLeafId)
            ? prior.activeLeafId
            : layout.activeLeafId
      }
    }
    const groups = (session.tabGroups?.[worktree] ?? []).map((group) => ({
      ...group,
      tabOrder: [...group.tabOrder]
    }))
    const groupId = groups[0]?.id ?? `session-tabs:${worktree}`
    const tabs: Tab[] = [...(session.unifiedTabs?.[worktree] ?? [])]
    for (const terminal of terminals) {
      if (!tabs.some((tab) => tab.contentType === 'terminal' && tab.entityId === terminal.id)) {
        tabs.push(terminalTab(terminal, groupId))
      }
    }
    // Why: diff and conflict surfaces belong to this renderer and are not durable session records.
    for (const transient of state.unifiedTabsByWorktree[worktree] ?? []) {
      if (
        !['terminal', 'editor', 'browser'].includes(transient.contentType) &&
        !tabs.some((tab) => tab.id === transient.id)
      ) {
        tabs.push(transient)
      }
    }
    for (const file of session.openFilesByWorktree?.[worktree] ?? []) {
      const existing = state.openFiles.find(
        (open) =>
          open.worktreeId === worktree &&
          open.mode === 'edit' &&
          open.filePath === file.filePath &&
          (open.runtimeEnvironmentId ?? null) === (file.runtimeEnvironmentId ?? null)
      )
      const entityId =
        existing?.id ?? buildOwnedEditorFileId(file.filePath, worktree, file.runtimeEnvironmentId)
      const aliases = new Set([
        entityId,
        file.filePath,
        buildOwnedEditorFileId(file.filePath, worktree, file.runtimeEnvironmentId)
      ])
      let matched = false
      for (let index = 0; index < tabs.length; index += 1) {
        const tab = tabs[index]
        if (tab?.contentType === 'editor' && aliases.has(tab.entityId)) {
          tabs[index] = { ...tab, entityId }
          matched = true
        }
      }
      if (!matched) {
        tabs.push({
          id: entityId,
          entityId,
          groupId,
          worktreeId: worktree,
          contentType: 'editor',
          label: file.relativePath,
          customLabel: null,
          color: null,
          sortOrder: tabs.length,
          createdAt: 0,
          isPreview: file.isPreview
        })
      }
    }
    const valid = new Set(tabs.map((tab) => tab.id))
    for (const group of groups) {
      group.tabOrder = group.tabOrder.filter((id) => valid.has(id))
    }
    for (const tab of tabs) {
      let group = groups.find((group) => group.id === tab.groupId)
      if (!group) {
        group = { id: tab.groupId, worktreeId: worktree, activeTabId: null, tabOrder: [] }
        groups.push(group)
      }
      if (!group.tabOrder.includes(tab.id)) {
        group.tabOrder.push(tab.id)
      }
    }
    next.unifiedTabsByWorktree[worktree] = tabs
    next.groupsByWorktree[worktree] = groups
      .filter((group) => group.tabOrder.length > 0)
      .map((group) => selectedGroup(group, state.groupsByWorktree[worktree] ?? []))
    const priorGroup = state.activeGroupIdByWorktree[worktree]
    const activeGroup =
      next.groupsByWorktree[worktree].find((group) => group.id === priorGroup) ??
      next.groupsByWorktree[worktree].find(
        (group) => group.id === session.activeGroupIdByWorktree?.[worktree]
      ) ??
      next.groupsByWorktree[worktree][0]
    if (activeGroup) {
      next.activeGroupIdByWorktree[worktree] = activeGroup.id
      next.layoutByWorktree[worktree] = session.tabGroupLayouts?.[worktree] ?? {
        type: 'leaf',
        groupId: activeGroup.id
      }
    } else {
      delete next.activeGroupIdByWorktree[worktree]
      delete next.layoutByWorktree[worktree]
    }
    const activeTerminal = state.activeTabIdByWorktree[worktree]
    next.activeTabIdByWorktree[worktree] =
      activeTerminal && terminalIds.has(activeTerminal)
        ? activeTerminal
        : (terminals.find((tab) => tab.id === session.activeTabIdByWorktree?.[worktree])?.id ??
          terminals[0]?.id ??
          null)
  }
  return next
}

function selectedGroup(group: TabGroup, previous: readonly TabGroup[]): TabGroup {
  const selected = previous.find((prior) => prior.id === group.id)?.activeTabId
  return {
    ...group,
    activeTabId:
      selected && group.tabOrder.includes(selected)
        ? selected
        : group.activeTabId && group.tabOrder.includes(group.activeTabId)
          ? group.activeTabId
          : (group.tabOrder[0] ?? null)
  }
}

function terminalTab(tab: TerminalTab, groupId: string): Tab {
  return {
    id: tab.id,
    entityId: tab.id,
    groupId,
    worktreeId: tab.worktreeId,
    contentType: 'terminal',
    label: tab.title,
    customLabel: tab.customTitle,
    color: tab.color,
    sortOrder: tab.sortOrder,
    createdAt: tab.createdAt,
    generatedLabel: tab.generatedTitle,
    isPinned: tab.isPinned
  }
}

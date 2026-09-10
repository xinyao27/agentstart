import { isValidTerminalTabId } from '@agentstart/protocol/terminal/tab-identity'
import type { WorkspaceSessionState } from '@agentstart/protocol/workspace/session'
import type { Tab, TabGroup, TabGroupLayoutNode } from '@agentstart/protocol/workspace/tabs'
import { createBrowserUuid } from '~renderer/browser/uuid'

import type { HydratedTabState } from './hydration'

export function hydrateLegacyTabFormat(
  session: WorkspaceSessionState,
  validWorktreeIds: Set<string>
): HydratedTabState {
  const tabsByWorktree: Record<string, Tab[]> = {}
  const groupsByWorktree: Record<string, TabGroup[]> = {}
  const activeGroupIdByWorktree: Record<string, string> = {}
  const layoutByWorktree: Record<string, TabGroupLayoutNode> = {}

  for (const worktreeId of validWorktreeIds) {
    const terminalTabs = (session.tabsByWorktree[worktreeId] ?? []).filter((tab) =>
      isValidTerminalTabId(tab.id)
    )
    const editorFiles = session.openFilesByWorktree?.[worktreeId] ?? []

    if (terminalTabs.length === 0 && editorFiles.length === 0) {
      continue
    }

    const groupId = createBrowserUuid()
    const tabs: Tab[] = []
    const tabOrder: string[] = []

    for (const terminal of terminalTabs) {
      tabs.push({
        id: terminal.id,
        entityId: terminal.id,
        groupId,
        worktreeId,
        contentType: 'terminal',
        label: terminal.title,
        ...(terminal.quickCommandLabel?.trim()
          ? { quickCommandLabel: terminal.quickCommandLabel.trim() }
          : {}),
        ...(terminal.generatedTitle?.trim()
          ? { generatedLabel: terminal.generatedTitle.trim() }
          : {}),
        customLabel: terminal.customTitle,
        color: terminal.color,
        sortOrder: terminal.sortOrder,
        createdAt: terminal.createdAt,
        isPreview: false,
        isPinned: false
      })
      tabOrder.push(terminal.id)
    }

    for (const file of editorFiles) {
      tabs.push({
        id: file.filePath,
        entityId: file.filePath,
        groupId,
        worktreeId,
        contentType: 'editor',
        label: file.relativePath,
        customLabel: null,
        color: null,
        sortOrder: tabs.length,
        createdAt: Date.now(),
        isPreview: file.isPreview,
        isPinned: false
      })
      tabOrder.push(file.filePath)
    }

    const activeTabType = session.activeTabTypeByWorktree?.[worktreeId] ?? 'terminal'
    let activeTabId: string | null = null
    if (activeTabType === 'editor') {
      activeTabId = session.activeFileIdByWorktree?.[worktreeId] ?? null
    } else {
      // Why: the global active tab only names the last-focused worktree.
      // Restore every other worktree from its own remembered terminal first.
      const rememberedTabId = session.activeTabIdByWorktree?.[worktreeId]
      if (rememberedTabId && terminalTabs.some((tab) => tab.id === rememberedTabId)) {
        activeTabId = rememberedTabId
      } else if (
        session.activeTabId &&
        terminalTabs.some((tab) => tab.id === session.activeTabId)
      ) {
        activeTabId = session.activeTabId
      }
    }
    if (activeTabId && !tabs.some((tab) => tab.id === activeTabId)) {
      activeTabId = tabs[0]?.id ?? null
    }

    tabsByWorktree[worktreeId] = tabs
    groupsByWorktree[worktreeId] = [
      {
        id: groupId,
        worktreeId,
        activeTabId,
        tabOrder,
        // Why: legacy sessions have no MRU. Seed the active tab so the first
        // close still falls back predictably to its neighbor.
        recentTabIds: activeTabId ? [activeTabId] : []
      }
    ]
    activeGroupIdByWorktree[worktreeId] = groupId
    layoutByWorktree[worktreeId] = { type: 'leaf', groupId }
  }

  return {
    unifiedTabsByWorktree: tabsByWorktree,
    groupsByWorktree,
    activeGroupIdByWorktree,
    layoutByWorktree
  }
}

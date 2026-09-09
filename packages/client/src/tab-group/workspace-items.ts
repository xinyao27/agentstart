import type { BrowserTab } from '@yiru/protocol/workspace/browser-session'
import type { Tab, TabGroup, TerminalTab } from '@yiru/protocol/workspace/tabs'
import { useShallow } from 'zustand/react/shallow'
import type { OpenFile } from '~renderer/editor/state'
import { useAppStore } from '~renderer/store/state'
import { resolveUnifiedTabLabel } from '~renderer/tab-title-resolution'

export type GroupEditorItem = OpenFile & { tabId: string }
export type GroupBrowserItem = BrowserTab & { tabId: string }

const EMPTY_GROUPS: readonly TabGroup[] = []
const EMPTY_UNIFIED_TABS: readonly Tab[] = []
const EMPTY_BROWSER_TABS: readonly BrowserTab[] = []
const EMPTY_TERMINAL_TABS: readonly TerminalTab[] = []
const EMPTY_TERMINAL_LAYOUTS_BY_TAB_ID: NonNullable<
  ReturnType<typeof useAppStore.getState>['terminalLayoutsByTabId']
> = {}

export function useTabGroupWorkspaceItems({
  groupId,
  worktreeId
}: {
  groupId: string
  worktreeId: string
}) {
  const state = useAppStore(
    useShallow((store) => ({
      // Why: Zustand v5 requires stable selector snapshots. Fresh fallback
      // collections trap the split-group render path in an update loop.
      groups: store.groupsByWorktree[worktreeId] ?? EMPTY_GROUPS,
      unifiedTabs: store.unifiedTabsByWorktree[worktreeId] ?? EMPTY_UNIFIED_TABS,
      terminalTabs: store.tabsByWorktree[worktreeId] ?? EMPTY_TERMINAL_TABS,
      openFiles: store.openFiles,
      browserTabs: store.browserTabsByWorktree[worktreeId] ?? EMPTY_BROWSER_TABS,
      expandedPaneByTabId: store.expandedPaneByTabId,
      terminalLayoutsByTabId: store.terminalLayoutsByTabId ?? EMPTY_TERMINAL_LAYOUTS_BY_TAB_ID,
      generatedTabTitlesEnabled: store.settings?.tabAutoGenerateTitle === true,
      mobileEmulatorEnabled: store.settings?.mobileEmulatorEnabled !== false
    }))
  )
  const group = (() => state.groups.find((item) => item.id === groupId) ?? null)()
  const groupTabs = (() => state.unifiedTabs.filter((item) => item.groupId === groupId))()
  const activeTab = groupTabs.find((item) => item.id === group?.activeTabId) ?? null
  // Why: unified tabs own split-group labels while terminal tabs own shell
  // identity, so the two records must be joined before rendering the tab bar.
  const terminalTabById = (() => new Map(state.terminalTabs.map((item) => [item.id, item])))()
  const terminalTabs = (() =>
    groupTabs
      .filter((item) => item.contentType === 'terminal')
      .map((item) => {
        const terminalTab = terminalTabById.get(item.entityId)
        return {
          id: item.entityId,
          unifiedTabId: item.id,
          ptyId: terminalTab?.ptyId ?? null,
          worktreeId,
          title: resolveUnifiedTabLabel(
            {
              ...item,
              quickCommandLabel: item.quickCommandLabel ?? terminalTab?.quickCommandLabel,
              generatedLabel: item.generatedLabel ?? terminalTab?.generatedTitle
            },
            state.generatedTabTitlesEnabled,
            item.label
          ),
          defaultTitle: terminalTab?.defaultTitle,
          quickCommandLabel: terminalTab?.quickCommandLabel ?? item.quickCommandLabel ?? null,
          generatedTitle: terminalTab?.generatedTitle ?? item.generatedLabel ?? null,
          customTitle: item.customLabel ?? terminalTab?.customTitle ?? null,
          color: item.color ?? terminalTab?.color ?? null,
          sortOrder: item.sortOrder,
          createdAt: item.createdAt,
          generation: terminalTab?.generation,
          shellOverride: terminalTab?.shellOverride,
          startupCwd: terminalTab?.startupCwd,
          // Why: the rebuilt record otherwise drops the pre-hook provider icon.
          launchAgent: terminalTab?.launchAgent,
          pendingActivationSpawn: terminalTab?.pendingActivationSpawn
        }
      }))()
  const editorItems = (() =>
    groupTabs
      .filter(
        (item) =>
          item.contentType === 'editor' ||
          item.contentType === 'diff' ||
          item.contentType === 'conflict-review' ||
          item.contentType === 'check-details'
      )
      .map((item) => {
        const file = state.openFiles.find((candidate) => candidate.id === item.entityId)
        return file ? { ...file, tabId: item.id } : null
      })
      .filter((item): item is GroupEditorItem => item !== null))()
  const browserItems = (() =>
    groupTabs
      .filter((item) => item.contentType === 'browser')
      .map((item) => {
        const tab = state.browserTabs.find((candidate) => candidate.id === item.entityId)
        return tab ? { ...tab, tabId: item.id } : null
      })
      .filter((item): item is GroupBrowserItem => item !== null))()
  const tabBarOrder = (() =>
    (group?.tabOrder ?? []).map((itemId) => {
      const item = groupTabs.find((candidate) => candidate.id === itemId)
      if (!item) {
        return itemId
      }
      return item.contentType === 'terminal' || item.contentType === 'browser'
        ? item.entityId
        : item.id
    }))()

  return {
    activeTab,
    browserItems,
    editorItems,
    expandedPaneByTabId: state.expandedPaneByTabId,
    group,
    groupTabs,
    mobileEmulatorEnabled: state.mobileEmulatorEnabled,
    tabBarOrder,
    terminalLayoutsByTabId: state.terminalLayoutsByTabId,
    terminalTabs
  }
}

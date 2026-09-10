import type { Tab } from '@agentstart/protocol/workspace/tabs'
import { getEditorDisplayLabel } from '~renderer/editor/labels'
import { normalizeRelativePath } from '~renderer/path'
import { useAppStore } from '~renderer/store/state'
import { getBrowserTabLabel } from '~renderer/tab-bar/browser-tab'
import { resolveTerminalTabTitle } from '~renderer/tab-title-resolution'

import { resolveTabIndicatorEdges } from '../tab-group/tab-insertion'
import { buildStatusMap } from '../workspace-panel/status-display'
import type { DropIndicator } from './drop-indicator'
import { reconcileTabOrder } from './reconcile-order'
import type { TabBarProps, TabStripItem } from './tab-bar-types'

type GitStatusEntries = ReturnType<typeof useAppStore.getState>['gitStatusByWorktree'][string]
const EMPTY_GIT_STATUS_ENTRIES: GitStatusEntries = []
const EMPTY_UNIFIED_TABS: readonly Tab[] = []

function getTabDragLabel(item: TabStripItem, generatedTitlesEnabled: boolean): string {
  if (item.type === 'terminal') {
    return resolveTerminalTabTitle(item.data, generatedTitlesEnabled, item.data.title)
  }
  if (item.type === 'browser') {
    return getBrowserTabLabel(item.data)
  }
  if (item.type === 'simulator') {
    return item.data.label || 'Mobile Emulator'
  }
  if (item.type === 'git-graph') {
    return item.data.label
  }
  return getEditorDisplayLabel(item.data)
}

function getTabLayoutSignature(
  item: TabStripItem,
  options: { generatedTitlesEnabled: boolean; isExpanded: boolean; status: string | null }
): string {
  const { generatedTitlesEnabled, isExpanded, status } = options
  const label = getTabDragLabel(item, generatedTitlesEnabled)
  if (item.type === 'terminal') {
    return `${item.type}:${item.id}:${item.isPinned}:${isExpanded}:${item.data.color ?? ''}:${label}`
  }
  if (item.type === 'editor') {
    return `${item.type}:${item.id}:${item.isPinned}:${item.data.isDirty}:${item.data.isPreview}:${item.data.externalMutation ?? ''}:${status ?? ''}:${label}`
  }
  return `${item.type}:${item.id}:${item.isPinned}:${label}`
}

function createUnifiedTabLookup(tabs: readonly Tab[], groupId: string): Map<string, Tab> {
  const lookup = new Map<string, Tab>()
  for (const tab of tabs) {
    if (tab.groupId !== groupId) {
      continue
    }
    lookup.set(tab.id, tab)
    if (tab.contentType === 'terminal' || tab.contentType === 'browser') {
      lookup.set(tab.entityId, tab)
    }
  }
  return lookup
}

export function getTabStripDragLabel(item: TabStripItem, generatedTitlesEnabled: boolean): string {
  return getTabDragLabel(item, generatedTitlesEnabled)
}

export function useTabStripModel(props: TabBarProps) {
  const {
    activeBrowserTabId,
    activeFileId,
    activeGitGraphTabId,
    activeSimulatorTabId,
    activeTabId,
    activeTabType,
    browserTabs,
    editorFiles,
    expandedPaneByTabId,
    groupId,
    hoveredTabInsertion,
    onPinFile,
    tabBarOrder,
    tabs,
    worktreeId
  } = props
  const generatedTitlesEnabled = useAppStore(
    (state) => state.settings?.tabAutoGenerateTitle === true
  )
  const gitStatusEntries = useAppStore(
    (state) => state.gitStatusByWorktree[worktreeId] ?? EMPTY_GIT_STATUS_ENTRIES
  )
  const unifiedTabs = useAppStore(
    (state) => state.unifiedTabsByWorktree[worktreeId] ?? EMPTY_UNIFIED_TABS
  )
  const pinTab = useAppStore((state) => state.pinTab)
  const unpinTab = useAppStore((state) => state.unpinTab)
  const activeGroupId = useAppStore((state) => state.activeGroupIdByWorktree[worktreeId])
  const resolvedGroupId = groupId ?? activeGroupId ?? worktreeId
  const statusByRelativePath = (() => buildStatusMap(gitStatusEntries))()
  const unifiedTabByVisibleId = (() => createUnifiedTabLookup(unifiedTabs, resolvedGroupId))()

  const orderedItems = (() => {
    const terminalMap = new Map(tabs.map((tab) => [tab.id, tab]))
    const editorMap = new Map((editorFiles ?? []).map((file) => [file.tabId ?? file.id, file]))
    const browserMap = new Map((browserTabs ?? []).map((tab) => [tab.id, tab]))
    const simulatorIds = unifiedTabs
      .filter((tab) => tab.groupId === resolvedGroupId && tab.contentType === 'simulator')
      .map((tab) => tab.id)
    const gitGraphTabs = unifiedTabs.filter(
      (tab): tab is Tab & { contentType: 'git-graph' } =>
        tab.groupId === resolvedGroupId && tab.contentType === 'git-graph'
    )
    const gitGraphMap = new Map(gitGraphTabs.map((tab) => [tab.id, tab]))
    const ids = reconcileTabOrder(
      tabBarOrder,
      tabs.map((tab) => tab.id),
      (editorFiles ?? []).map((file) => file.tabId ?? file.id),
      (browserTabs ?? []).map((tab) => tab.id),
      simulatorIds,
      gitGraphTabs.map((tab) => tab.id)
    )
    const items: TabStripItem[] = []
    for (const id of ids) {
      const terminal = terminalMap.get(id)
      const file = editorMap.get(id)
      const browser = browserMap.get(id)
      const unifiedTab = unifiedTabByVisibleId.get(id)
      const gitGraph = gitGraphMap.get(id)
      if (terminal) {
        items.push({
          type: 'terminal',
          id,
          unifiedTabId: terminal.unifiedTabId ?? unifiedTab?.id ?? terminal.id,
          isPinned: unifiedTab?.isPinned === true,
          data: terminal
        })
      } else if (file) {
        const fileUnifiedTab = unifiedTab ?? unifiedTabByVisibleId.get(file.id)
        items.push({
          type: 'editor',
          id,
          unifiedTabId: file.tabId ?? fileUnifiedTab?.id ?? file.id,
          isPinned: fileUnifiedTab?.isPinned === true,
          data: file
        })
      } else if (browser) {
        items.push({
          type: 'browser',
          id,
          unifiedTabId: browser.tabId ?? unifiedTab?.id ?? browser.id,
          isPinned: unifiedTab?.isPinned === true,
          data: browser
        })
      } else if (unifiedTab?.contentType === 'simulator') {
        items.push({
          type: 'simulator',
          id,
          unifiedTabId: unifiedTab.id,
          isPinned: unifiedTab.isPinned === true,
          data: unifiedTab
        })
      } else if (gitGraph) {
        items.push({
          type: 'git-graph',
          id,
          unifiedTabId: gitGraph.id,
          isPinned: gitGraph.isPinned === true,
          data: gitGraph
        })
      }
    }
    return items
  })()

  const activeIndicator =
    hoveredTabInsertion?.groupId === resolvedGroupId ? hoveredTabInsertion : null
  const dropIndicatorByVisibleId = (() => {
    const indicators = new Map<string, DropIndicator>()
    for (const edge of resolveTabIndicatorEdges(
      orderedItems.map((item) => item.id),
      activeIndicator
    )) {
      indicators.set(edge.visibleTabId, edge.side)
    }
    return indicators
  })()
  const activeVisibleTabId = (() =>
    orderedItems.find((item) => {
      if (item.type === 'terminal') {
        return (
          (activeTabType === 'terminal' || activeTabType === 'simulator') && item.id === activeTabId
        )
      }
      if (item.type === 'browser') {
        return activeTabType === 'browser' && item.id === activeBrowserTabId
      }
      if (item.type === 'simulator') {
        return activeTabType === 'simulator' && item.id === activeSimulatorTabId
      }
      if (item.type === 'git-graph') {
        return item.id === activeGitGraphTabId
      }
      return (
        (activeTabType === 'editor' || activeTabType === 'simulator') && activeFileId === item.id
      )
    })?.id ?? null)()
  const layoutKey = (() =>
    orderedItems
      .map((item) =>
        getTabLayoutSignature(item, {
          generatedTitlesEnabled,
          isExpanded: expandedPaneByTabId[item.id] === true,
          status:
            item.type === 'editor'
              ? (statusByRelativePath.get(normalizeRelativePath(item.data.relativePath)) ?? null)
              : null
        })
      )
      .join('\u001f'))()
  const togglePinned = (item: TabStripItem): void => {
    if (item.isPinned) {
      unpinTab(item.unifiedTabId)
    } else if (item.type === 'editor' && onPinFile) {
      onPinFile(item.data.id, item.unifiedTabId)
    } else {
      pinTab(item.unifiedTabId)
    }
  }

  return {
    activeVisibleTabId,
    dropIndicatorByVisibleId,
    generatedTitlesEnabled,
    layoutKey,
    orderedItems,
    resolvedGroupId,
    sortableIds: orderedItems.map((item) => item.id),
    statusByRelativePath,
    togglePinned,
    unifiedTabByVisibleId
  }
}

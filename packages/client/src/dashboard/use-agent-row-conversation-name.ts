import { parsePaneKey } from '@yiru/protocol/terminal/pane-identity'
import { getAgentRowConversationName } from '~renderer/agent/row-conversation-name'
import { useAppStore } from '~renderer/store/state'
import type { AppState } from '~renderer/store/types'

import type { DashboardAgentRow } from './use-dashboard-data'

type WorktreeTabs = NonNullable<AppState['tabsByWorktree'][string]>

const tabIndexByTabs = new WeakMap<WorktreeTabs, ReadonlyMap<string, WorktreeTabs[number]>>()

function getIndexedTab(
  tabs: WorktreeTabs | undefined,
  tabId: string
): WorktreeTabs[number] | undefined {
  if (!tabs) {
    return undefined
  }
  let tabIndex = tabIndexByTabs.get(tabs)
  if (!tabIndex) {
    tabIndex = new Map(tabs.map((tab) => [tab.id, tab]))
    tabIndexByTabs.set(tabs, tabIndex)
  }
  return tabIndex.get(tabId)
}

/** The row's conversation name, or null when nothing usable exists. */
export function useAgentRowConversationName(agent: DashboardAgentRow): string | null {
  const parentPaneKey = agent.entry.orchestration?.parentPaneKey
  const usesParentTab =
    agent.lineage?.depth === 1 &&
    parentPaneKey !== undefined &&
    parsePaneKey(parentPaneKey)?.tabId === agent.tab.id
  const cannotOwnTabName = agent.rowSource === 'subagent' || usesParentTab
  const generatedTitlesEnabled = useAppStore(
    (state) => !cannotOwnTabName && state.settings?.tabAutoGenerateTitle === true
  )
  const liveTab = useAppStore((state) =>
    cannotOwnTabName
      ? undefined
      : getIndexedTab(state.tabsByWorktree[agent.tab.worktreeId], agent.tab.id)
  )
  // Why: synthetic and same-tab child rows do not own the parent tab's name.
  if (cannotOwnTabName) {
    return null
  }
  // Why: retained row snapshots need a fallback after their live tab disappears.
  return getAgentRowConversationName(liveTab ?? agent.tab, agent.agentType, generatedTitlesEnabled)
}

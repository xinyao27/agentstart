import type { TerminalPaneLayoutNode } from '@yiru/protocol/workspace/session'
import type { RuntimeMobileSessionTabsSnapshot } from '~renderer/runtime/remote-session/session-model'

export type RuntimeSyncedTab = {
  tabId: string
  worktreeId: string
  title: string | null
  activeLeafId: string | null
  layout: TerminalPaneLayoutNode | null
}

export type RuntimeSyncedLeaf = {
  tabId: string
  worktreeId: string
  leafId: string
  paneRuntimeId: number
  ptyId: string | null
  paneTitle?: string | null
  title?: string | null
}

export type RuntimeSyncWindowGraph = {
  tabs: RuntimeSyncedTab[]
  leaves: RuntimeSyncedLeaf[]
  mobileSessionTabs?: RuntimeMobileSessionTabsSnapshot[]
}

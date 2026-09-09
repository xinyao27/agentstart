import type {
  SessionTabsMarkdownTabValue,
  SessionTabsFileTabValue,
  SessionTabsBrowserTabValue,
  SessionTabsTabGroupValue
} from '@yiru/protocol'
import type { AgentStatusEntry } from '@yiru/protocol/agent/status-records'
import type { TuiAgent } from '@yiru/protocol/agent/types'
import type { ExecutionHostId } from '@yiru/protocol/host/identity'
import type { TerminalColorOverrides } from '@yiru/protocol/terminal/theme-types'
import type {
  BrowserCertificateFailure,
  BrowserLoadError
} from '@yiru/protocol/workspace/browser-session'
import type { TerminalLayoutSnapshot } from '@yiru/protocol/workspace/session'
import type { TabGroupLayoutNode } from '@yiru/protocol/workspace/tabs'

export type RuntimeMobileSessionTerminalTab = {
  type: 'terminal'
  id: string
  title: string
  quickCommandLabel?: string | null
  parentTabId: string
  leafId: string
  ptyId?: string | null
  terminalTheme?: RuntimeMobileTerminalTheme
  agentStatus?: AgentStatusEntry | null
  launchAgent?: TuiAgent
  startupCwd?: string
  parentLayout?: TerminalLayoutSnapshot
  /** Tab-level color/pin (per parentTabId), host-persisted for runtime hosts. */
  color?: string | null
  isPinned?: boolean
  isActive: boolean
}

export type RuntimeMobileTerminalTheme = {
  mode: 'dark' | 'light'
  theme: TerminalColorOverrides
}

export type RuntimeMobileSessionMarkdownTab = SessionTabsMarkdownTabValue

export type RuntimeMobileSessionFileTab = SessionTabsFileTabValue

export type RuntimeMobileSessionBrowserTab = SessionTabsBrowserTabValue & {
  loadError?: BrowserLoadError | null
  certificateFailure?: BrowserCertificateFailure | null
}

export type RuntimeMobileSessionSnapshotTab =
  | RuntimeMobileSessionTerminalTab
  | RuntimeMobileSessionMarkdownTab
  | RuntimeMobileSessionFileTab
  | RuntimeMobileSessionBrowserTab

export type RuntimeMobileSessionTerminalClientTab =
  | (RuntimeMobileSessionTerminalTab & {
      status: 'pending-handle' | 'sleeping'
      terminal: null
    })
  | (RuntimeMobileSessionTerminalTab & {
      status: 'ready'
      terminal: string
      // Why: a missing instance binding must not grant a shareable terminal handle.
      worktreeInstanceId?: string | null
    })

export type RuntimeMobileSessionClientTab =
  | RuntimeMobileSessionTerminalClientTab
  | RuntimeMobileSessionMarkdownTab
  | RuntimeMobileSessionFileTab
  | RuntimeMobileSessionBrowserTab

export type RuntimeMobileSessionTabGroup = SessionTabsTabGroupValue

type RuntimeMobileSessionTabMoveBase = {
  tabId: string
  targetGroupId: string
}

export type RuntimeMobileSessionTabMove =
  | (RuntimeMobileSessionTabMoveBase & {
      kind: 'reorder'
      tabOrder: string[]
    })
  | (RuntimeMobileSessionTabMoveBase & {
      kind: 'move-to-group'
      index?: number
    })
  | (RuntimeMobileSessionTabMoveBase & {
      kind: 'split'
      splitDirection: 'left' | 'right' | 'up' | 'down'
    })

export type RuntimeMobileSessionTabsSnapshot = {
  worktree: string
  // Why: local routing provenance is not part of the daemon snapshot response.
  hostId?: ExecutionHostId
  publicationEpoch: string
  snapshotVersion: number
  activeGroupId: string | null
  activeTabId: string | null
  activeTabType: 'terminal' | 'markdown' | 'file' | 'browser' | null
  tabGroups?: RuntimeMobileSessionTabGroup[]
  tabGroupLayout?: TabGroupLayoutNode | null
  tabs: RuntimeMobileSessionSnapshotTab[]
}

export type RuntimeMobileSessionTabsResult = {
  worktree: string
  publicationEpoch: string
  snapshotVersion: number
  activeGroupId: string | null
  activeTabId: string | null
  activeTabType: 'terminal' | 'markdown' | 'file' | 'browser' | null
  tabGroups?: RuntimeMobileSessionTabGroup[]
  tabGroupLayout?: TabGroupLayoutNode | null
  tabs: RuntimeMobileSessionClientTab[]
}

export type RuntimeMobileSessionCreateTerminalResult = {
  tab: RuntimeMobileSessionTerminalClientTab
  publicationEpoch: string
  snapshotVersion: number
}

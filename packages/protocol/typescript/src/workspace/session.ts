import type { SleepingAgentSessionRecord } from '../agent/session-resume.js'
import type { BrowserHistoryEntry, BrowserPage, BrowserWorkspace } from './browser-session.js'
import type { WorkspaceKey } from './identity.js'
import type {
  Tab,
  TabGroup,
  TabGroupLayoutNode,
  TerminalTab,
  WorkspaceVisibleTabType
} from './tabs.js'

export type TerminalPaneSplitDirection = 'vertical' | 'horizontal'

export type TerminalPaneLayoutNode =
  | {
      type: 'leaf'
      leafId: string
    }
  | {
      type: 'split'
      direction: TerminalPaneSplitDirection
      first: TerminalPaneLayoutNode
      second: TerminalPaneLayoutNode

      ratio?: number
    }

export type TerminalLayoutSnapshot = {
  root: TerminalPaneLayoutNode | null
  activeLeafId: string | null
  expandedLeafId: string | null

  ptyIdsByLeafId?: Record<string, string>

  buffersByLeafId?: Record<string, string>

  scrollbackRefsByLeafId?: Record<string, string>

  titlesByLeafId?: Record<string, string>
}

export type PersistedOpenFile = {
  filePath: string
  relativePath: string
  worktreeId: string
  language: string
  isPreview?: boolean
  runtimeEnvironmentId?: string | null

  dirtyDraftContent?: string

  lastKnownDiskSignature?: string

  readOnly?: boolean

  liveTail?: boolean
}

export type WorkspaceSessionState = {
  activeRepoId: string | null

  activeWorkspaceKey?: WorkspaceKey | null
  activeWorktreeId: string | null
  activeTabId: string | null

  tabsByWorktree: Record<string, TerminalTab[]>
  terminalLayoutsByTabId: Record<string, TerminalLayoutSnapshot>

  activeWorktreeIdsOnShutdown?: string[]

  openFilesByWorktree?: Record<string, PersistedOpenFile[]>

  activeFileIdByWorktree?: Record<string, string | null>

  markdownFrontmatterVisible?: Record<string, boolean>

  browserTabsByWorktree?: Record<string, BrowserWorkspace[]>

  browserPagesByWorkspace?: Record<string, BrowserPage[]>

  activeBrowserTabIdByWorktree?: Record<string, string | null>

  activeTabTypeByWorktree?: Record<string, WorkspaceVisibleTabType>

  browserUrlHistory?: BrowserHistoryEntry[]

  activeTabIdByWorktree?: Record<string, string | null>

  unifiedTabs?: Record<string, Tab[]>

  tabGroups?: Record<string, TabGroup[]>

  tabGroupLayouts?: Record<string, TabGroupLayoutNode>

  activeGroupIdByWorktree?: Record<string, string>

  activeConnectionIdsAtShutdown?: string[]

  remoteSessionIdsByTabId?: Record<string, string>

  lastVisitedAtByWorktreeId?: Record<string, number>

  defaultTerminalTabsAppliedByWorktreeId?: Record<string, true>

  sleepingAgentSessionsByPaneKey?: Record<string, SleepingAgentSessionRecord>
}

export type WorkspaceSessionPatch = Partial<WorkspaceSessionState>

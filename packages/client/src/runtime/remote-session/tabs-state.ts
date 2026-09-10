import type {
  BrowserCertificateFailure,
  BrowserPage,
  BrowserWorkspace
} from '@agentstart/protocol/workspace/browser-session'
import type { TerminalLayoutSnapshot } from '@agentstart/protocol/workspace/session'
import type { Tab, TerminalTab } from '@agentstart/protocol/workspace/tabs'

import type { OpenFile } from '../../editor/state'
import type { AppState } from '../../store/state'
import type {
  RuntimeMobileSessionBrowserTab,
  RuntimeMobileSessionFileTab,
  RuntimeMobileSessionMarkdownTab,
  RuntimeMobileSessionTerminalClientTab
} from './session-model'

export type TerminalSurface = RuntimeMobileSessionTerminalClientTab
export type ReadyTerminalSurface = RuntimeMobileSessionTerminalClientTab & { status: 'ready' }
export type ReadyBrowserSurface = RuntimeMobileSessionBrowserTab & { browserPageId: string }
export type ReadyEditorSurface = RuntimeMobileSessionMarkdownTab | RuntimeMobileSessionFileTab

export type MirroredTerminalTab = {
  tab: TerminalTab
  hostTabId: string
  ptyIds: string[]
  layout: TerminalLayoutSnapshot
}

export type MirroredBrowserTab = {
  workspace: BrowserWorkspace
  page: BrowserPage
  certificateFailure: BrowserCertificateFailure | null
  remotePageId: string
  unifiedTab: Tab
  hostTabId: string
}

export type MirroredEditorTab = {
  file: OpenFile
  unifiedTab: Tab
  hostTabId: string
}

export type RemoteSessionTabsSyncState = Pick<
  AppState,
  | 'activeBrowserTabId'
  | 'activeBrowserTabIdByWorktree'
  | 'activeGroupIdByWorktree'
  | 'activeFileId'
  | 'activeFileIdByWorktree'
  | 'activeTabId'
  | 'activeTabIdByWorktree'
  | 'activeTabType'
  | 'activeTabTypeByWorktree'
  | 'activeWorktreeId'
  | 'agentStatusByPaneKey'
  | 'agentStatusEpoch'
  | 'browserPagesByWorkspace'
  | 'browserCertificateFailuresByPageId'
  | 'browserTabsByWorktree'
  | 'groupsByWorktree'
  | 'layoutByWorktree'
  | 'openFiles'
  | 'ptyIdsByTabId'
  | 'remoteBrowserPageHandlesByPageId'
  | 'tabBarOrderByWorktree'
  | 'tabsByWorktree'
  | 'terminalLayoutsByTabId'
  | 'unifiedTabsByWorktree'
  | 'unreadTerminalTabs'
  | 'sortEpoch'
>

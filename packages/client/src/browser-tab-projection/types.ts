import type {
  BrowserCertificateFailure,
  BrowserHistoryEntry,
  BrowserLoadError,
  BrowserPage,
  BrowserWorkspace
} from '@agentstart/protocol/workspace/browser-session'
import type { WorkspaceSessionState } from '@agentstart/protocol/workspace/session'
import type { WorkspaceSessionHydrationOptions } from '~renderer/workspace/session-hydration-keys'

export type CreateBrowserTabOptions = {
  activate?: boolean
  workspaceId?: string
  pageId?: string
  title?: string
  sessionProfileId?: string | null
  sessionPartition?: string | null
  targetGroupId?: string
  focusAddressBar?: boolean
  browserRuntimeEnvironmentId?: string | null
}

export type BrowserTabPageState = {
  title?: string
  loading?: boolean
  faviconUrl?: string | null
  canGoBack?: boolean
  canGoForward?: boolean
  loadError?: BrowserLoadError | null
}

type RemoteBrowserPageHandle = {
  environmentId: string
  remotePageId: string
}

export type HostBrowserTabProjection = {
  browserPageId: string
  browserRuntimeEnvironmentId?: string | null
  workspaceId?: string
  worktreeId: string
  url: string
  title: string
  activate?: boolean
  targetGroupId?: string
}

export type BrowserSlice = {
  browserTabsByWorktree: Record<string, BrowserWorkspace[]>
  browserPagesByWorkspace: Record<string, BrowserPage[]>
  browserCertificateFailuresByPageId: Record<string, BrowserCertificateFailure>
  remoteBrowserPageHandlesByPageId: Record<string, RemoteBrowserPageHandle>
  activeBrowserTabId: string | null
  activeBrowserTabIdByWorktree: Record<string, string | null>
  upsertHostBrowserTab: (projection: HostBrowserTabProjection) => BrowserWorkspace
  removeHostBrowserTab: (browserPageId: string) => void
  createBrowserTab: (
    worktreeId: string,
    url: string,
    options?: CreateBrowserTabOptions
  ) => BrowserWorkspace
  openNewBrowserTabInActiveWorkspace: (groupId: string) => Promise<void>
  closeBrowserTab: (tabId: string) => void
  shutdownWorktreeBrowsers: (worktreeId: string) => Promise<void>
  setActiveBrowserTab: (tabId: string) => void
  focusBrowserTabInWorktree: (
    worktreeId: string,
    browserPageId: string,
    options?: { surfacePane?: boolean }
  ) => void
  updateBrowserPageState: (pageId: string, updates: BrowserTabPageState) => void
  setBrowserPageUrl: (pageId: string, url: string) => void
  setRemoteBrowserPageHandle: (pageId: string, handle: RemoteBrowserPageHandle) => void
  hydrateBrowserSession: (
    session: WorkspaceSessionState,
    options?: WorkspaceSessionHydrationOptions
  ) => void
  browserUrlHistory: BrowserHistoryEntry[]
}

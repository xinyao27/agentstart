import type {
  BrowserReplayEvent,
  WorkspaceConsoleSensorEntry as ConsoleSensorEntry
} from '@yiru/protocol'
import type { AgentPhase } from '@yiru/protocol/agent/phase'
import type {
  NotificationDismissResult,
  NotificationDisplayInput,
  NotificationDisplayResult
} from '~renderer/extension/notification-request'
import type { PdfExportInput, PdfExportResult } from '~renderer/extension/pdf-export'

export type BrowserReplayCapture = {
  endedAt: number
  events: BrowserReplayEvent[]
  pageTitle: string
  pageUrl: string
  startedAt: number
  video: Blob | null
}

export type NetworkMockMode = 'empty' | 'error-500' | 'slow'

export type PickedElementContext = {
  column: number | null
  componentName: string | null
  computedStyles: Record<string, string>
  line: number | null
  outerHtml: string
  pageUrl: string
  selector: string
  sourceFile: string | null
  tagName: string
  text: string
}

export type BrowserContextPayload = {
  imageUrl: string | null
  kind: 'active-tab' | 'context-menu' | 'history'
  linkUrl: string | null
  pageTitle: string
  pageUrl: string
  selectionText: string | null
  text: string
}

export type BrowserPerformanceCapture = {
  data: Blob
  metrics: Record<string, number>
  pageUrl: string
}

export type BrowserWorkspacePreferences = {
  favoriteProjectIds: string[]
  layoutMode: 'cascade' | 'displays'
  useNewTabLauncher: boolean
}

export type BrowserProjectBookmarkKind = 'dashboard' | 'docs' | 'pr' | 'staging'

export type BrowserProjectBookmark = {
  kind: BrowserProjectBookmarkKind
  url: string
}

export type BrowserAiStatus = {
  availability: 'available' | 'downloadable' | 'downloading' | 'unavailable'
  enabled: boolean
}

export type BrowserTabProjectionEvent =
  | { browserPageId: string; kind: 'removed' }
  | {
      active: boolean
      browserPageId: string
      faviconUrl: string | null
      kind: 'changed'
      loading: boolean
      title: string
      url: string
      worktreeId: string | null
    }

export type ExtensionBrowserCapabilities = {
  applyScheduledRitual: (input: {
    eventId: number
    kind: 'end-day' | 'start-day'
    projectIds: string[]
  }) => Promise<void>
  arrangeStartDay: (projectIds: string[]) => Promise<void>
  captureVisiblePage: () => Promise<string>
  captureActivePageContext: (grant: 'always-site' | 'once') => Promise<BrowserContextPayload>
  clearPendingPageContext: () => Promise<void>
  createDangerousCredential: (input: { challenge: string; userId: string }) => Promise<{
    authenticatorData: string
    clientDataJson: string
    credentialId: string
    publicKeySpki: string
  }>
  consumePendingAgentApproval: () => Promise<string | null>
  consumePendingPageContext: () => Promise<BrowserContextPayload | null>
  drainConsoleSensor: () => Promise<ConsoleSensorEntry[]>
  drainClaimedConsoleSensors: () => Promise<
    {
      entries: ConsoleSensorEntry[]
      pageUrl: string
      projectId: string
      worktreeId: string
    }[]
  >
  downloadArtifact: (input: { id: string; ticket: string }) => Promise<void>
  dismissWorkbenchNotifications: (notificationIds: string[]) => Promise<NotificationDismissResult>
  disableContextAwareness: () => Promise<void>
  displayWorkbenchNotification: (
    input: NotificationDisplayInput
  ) => Promise<NotificationDisplayResult>
  enableContextAwareness: () => Promise<boolean>
  executeBrowserCommand: (
    method: string,
    input: unknown,
    authorityId?: string | null,
    stream?: {
      sendBinary: (
        receiptId: string,
        sequence: number,
        isEnd: boolean,
        payload: Uint8Array<ArrayBufferLike>,
        signal: AbortSignal
      ) => Promise<void>
      signal: AbortSignal
    }
  ) => Promise<unknown>
  exportHtmlToPdf: (input: PdfExportInput) => Promise<PdfExportResult>
  fillGitHubComment: (draft: string) => Promise<void>
  finishDay: () => Promise<void>
  highlightVisualChanges: (
    regions: { height: number; width: number; x: number; y: number }[]
  ) => Promise<void>
  getNotificationPermissionStatus: () => Promise<{
    platform: NodeJS.Platform
    requested: boolean
    supported: boolean
  }>
  isConsoleSensorActive: () => Promise<boolean>
  isContextAwarenessEnabled: () => Promise<boolean>
  isNetworkMockActive: () => Promise<boolean>
  isRecording: () => Promise<boolean>
  openFocusWorkspace: (projectId: string) => Promise<void>
  openNotificationSettings: () => Promise<void>
  openDaemonTabCommand: (input: {
    eventId: number
    projectId?: string
    url: string
  }) => Promise<void>
  openAgentMonitor: (input: { body: string; title: string }) => Promise<void>
  openExtensionSettings: () => Promise<void>
  pickPageElement: () => Promise<PickedElementContext | null>
  pickProjectDirectory: () => Promise<string | null>
  pickColor: () => Promise<string>
  prepareLongRunningAgent: () => Promise<void>
  probeNotificationDelivery: (options?: { force?: boolean }) => Promise<{
    authoritative: boolean
    state: 'awaiting-decision' | 'blocked' | 'delivered' | 'unsupported'
  }>
  publishOperationProgress: (input: {
    id: string
    message: string
    progress: number
    title: string
  }) => Promise<void>
  publishProjectCatalog: (projects: { displayName: string; projectId: string }[]) => Promise<void>
  publishWorkspacePortClaims: (
    claims: { displayName: string; port: number; projectId: string; worktreeId: string }[]
  ) => Promise<void>
  publishAgentPresence: (input: {
    activeCount: number
    activeProjectIds: string[]
    activeTerminalHandles: string[]
    phase: AgentPhase | null
    waiting: {
      projectId: string
      terminal: string
      title: string
      worktreeId: string
    }[]
  }) => Promise<void>
  readProjectBookmarks: (input: {
    displayName: string
    projectId: string
  }) => Promise<{ enabled: boolean; links: BrowserProjectBookmark[] }>
  readOnDeviceAiStatus: () => Promise<BrowserAiStatus>
  readGitHubContext: () => Promise<string>
  readWorkspacePreferences: () => Promise<BrowserWorkspacePreferences>
  readRecentHistoryContext: (minutes: number) => Promise<BrowserContextPayload>
  replay: (events: BrowserReplayEvent[]) => Promise<void>
  requestDangerousAssertion: (input: { challenge: string; credentialId: string }) => Promise<{
    authenticatorData: string
    clientDataJson: string
    credentialId: string
    signature: string
  }>
  hasBrowserControlAccess: () => Promise<boolean>
  hasPersistentPageCaptureAccess: () => Promise<boolean>
  requestGitHubPage: () => Promise<boolean>
  requestPageCapture: () => Promise<boolean>
  runPerformanceAudit: () => Promise<BrowserPerformanceCapture>
  arrangeWorkspaceWindows: (
    projectIds: string[],
    mode: BrowserWorkspacePreferences['layoutMode']
  ) => Promise<void>
  setWorkspacePreferences: (preferences: BrowserWorkspacePreferences) => Promise<void>
  saveProjectBookmarks: (input: {
    displayName: string
    links: BrowserProjectBookmark[]
    projectId: string
  }) => Promise<BrowserProjectBookmark[]>
  setOnDeviceAiEnabled: (enabled: boolean) => Promise<void>
  startConsoleSensor: () => Promise<void>
  startNetworkMock: (rule: { mode: NetworkMockMode; urlIncludes: string }) => Promise<void>
  startRecording: () => Promise<void>
  stopRecording: () => Promise<BrowserReplayCapture | null>
  stopConsoleSensor: () => Promise<void>
  stopNetworkMock: () => Promise<void>
  summarizeText: (text: string) => Promise<{ source: 'browser-ai' | 'fallback'; text: string }>
  subscribeBrowserTabProjections: (
    listener: (event: BrowserTabProjectionEvent) => void
  ) => () => void
}

let activeCapabilities: ExtensionBrowserCapabilities | null = null

export function configureExtensionBrowserCapabilities(
  capabilities: ExtensionBrowserCapabilities
): void {
  activeCapabilities = capabilities
}

export function getExtensionBrowserCapabilities(): ExtensionBrowserCapabilities {
  if (!activeCapabilities) {
    throw new Error('extension_browser_capabilities_not_configured')
  }
  return activeCapabilities
}

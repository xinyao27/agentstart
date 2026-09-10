import {
  configureExtensionBrowserCapabilities,
  type ExtensionBrowserCapabilities
} from './browser-capabilities'
import type { ExtensionPage, ExtensionWorkspaceTarget } from './navigation'
import { configureExtensionHostNavigation } from './navigation'
import type { ExtensionRuntimeHostFactory } from './runtime/host'
import type {
  configureExtensionRuntime,
  getExtensionRuntimeQueryCacheBuster
} from './runtime/session'
import { mountExtensionConnecting, mountExtensionUnavailable } from './unavailable'

type ExtensionSurface = 'side-panel' | 'workspace'

type RuntimeSessionModule = {
  configureExtensionRuntime: typeof configureExtensionRuntime
  getExtensionRuntimeQueryCacheBuster: typeof getExtensionRuntimeQueryCacheBuster
}
type RuntimeSessionLoad = { module: RuntimeSessionModule; ok: true } | { error: unknown; ok: false }

let runtimeSessionLoad: Promise<RuntimeSessionLoad> | null = null

export function preloadExtensionClient(): void {
  runtimeSessionLoad ??= import('./runtime/session').then(
    (module): RuntimeSessionLoad => ({ module, ok: true }),
    (error: unknown): RuntimeSessionLoad => ({ error, ok: false })
  )
}

async function loadRuntimeSession(): Promise<RuntimeSessionModule> {
  preloadExtensionClient()
  const loaded = await runtimeSessionLoad
  if (!loaded?.ok) {
    throw loaded?.error ?? new Error('extension_runtime_session_load_failed')
  }
  return loaded.module
}

export type ExtensionClientOptions = {
  browserCapabilities: ExtensionBrowserCapabilities
  openExternalUrl: (target: { projectId?: string; url: string }) => Promise<void>
  openPage: (page: ExtensionPage) => void
  openWorkspace: (target: ExtensionWorkspaceTarget) => void
  publishAgentAttention: (count: number) => void
  readActivePageUrl: () => Promise<string | null>
  runtimeHost: ExtensionRuntimeHostFactory
  surface: ExtensionSurface
}

export async function mountExtensionClient(options: ExtensionClientOptions): Promise<void> {
  Reflect.set(globalThis, '__AGENTSTART_EXTENSION_CLIENT__', true)
  configureExtensionBrowserCapabilities(options.browserCapabilities)
  configureExtensionHostNavigation({
    openExternalUrl: options.openExternalUrl,
    openPage: options.openPage,
    openWorkspace: options.openWorkspace,
    publishAgentAttention: options.publishAgentAttention,
    readActivePageUrl: options.readActivePageUrl
  })
  if (options.surface === 'workspace') {
    const [runtimeSession, { mountExtensionWorkbench }] = await Promise.all([
      loadRuntimeSession(),
      import('./workbench/bootstrap')
    ])
    runtimeSession.configureExtensionRuntime(options.runtimeHost)
    mountExtensionWorkbench(runtimeSession.getExtensionRuntimeQueryCacheBuster())
    return
  }
  const [runtimeSession, { mountExtensionSidePanel }] = await Promise.all([
    loadRuntimeSession(),
    import('./side-panel/bootstrap')
  ])
  runtimeSession.configureExtensionRuntime(options.runtimeHost)
  mountExtensionSidePanel(runtimeSession.getExtensionRuntimeQueryCacheBuster())
}

export type {
  BrowserAiStatus,
  BrowserContextPayload,
  CommunityAdapter,
  CommunityAdaptersState,
  BrowserPerformanceCapture,
  BrowserProjectBookmark,
  BrowserProjectBookmarkKind,
  BrowserReplayCapture,
  BrowserTabProjectionEvent,
  BrowserWorkspacePreferences,
  ExtensionBrowserCapabilities
} from './browser-capabilities'
export type {
  ExtensionConnectionState,
  ExtensionRuntimeHost,
  ExtensionRuntimeHostFactory,
  ExtensionRuntimeHostMessages,
  ExtensionRuntimeHostSetup,
  ExtensionRuntimeTerminalHandle,
  ExtensionRuntimeTerminalOptions
} from './runtime/host'
export { mountExtensionConnecting, mountExtensionUnavailable }
export type {
  DaemonConnectionSettings,
  ExtensionUnavailableActions,
  ExtensionUnavailableFailure,
  ExtensionUnavailableReason
} from './unavailable'

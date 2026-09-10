import {
  mountExtensionClient,
  mountExtensionConnecting,
  mountExtensionUnavailable,
  preloadExtensionClient,
  type ExtensionUnavailableFailure
} from '@agentstart/client/extension-bootstrap'

import { classifyUnavailableError } from './bootstrap-response'
import { createBrowserCapabilities } from './bootstrap/browser-capabilities'
import { verifyRuntimeHealth } from './bootstrap/health'
import { requestRuntimeLoopbackAccess } from './bootstrap/loopback-access'
import {
  clearDaemonConnectionSettings,
  readDaemonConnectionSettings,
  savePermittedDaemonConnectionSettings
} from './connection-settings'
import { requestRuntimeBootstrap } from './runtime/bootstrap'
import { createExtensionRuntimeHostFactory } from './runtime/client'

type ConnectionStage = 'client-mount' | 'health-check' | 'native-bootstrap'

export async function mountExtensionSurface(surface: 'side-panel' | 'workspace'): Promise<void> {
  Reflect.set(globalThis, '__AGENTSTART_EXTENSION_SURFACE__', surface)
  const browserWindowIdPromise = chrome.windows.getCurrent().then(
    (browserWindow) => browserWindow.id ?? null,
    () => null
  )
  // Why: start parsing the full client while Native Messaging starts the daemon. Keeping it out
  // of the synchronous entry chunk gets the connecting surface on screen first without moving
  // this work behind the connection round trip.
  preloadExtensionClient()
  let unmountSurface: (() => void) | null = mountExtensionConnecting()
  let retryInFlight: Promise<ExtensionUnavailableFailure | null> | null = null
  let connectionStage: ConnectionStage = 'native-bootstrap'

  const replaceSurface = (mount: () => () => void): void => {
    unmountSurface?.()
    unmountSurface = mount()
  }

  const connect = async (): Promise<void> => {
    connectionStage = 'native-bootstrap'
    const [browserWindowId, response] = await Promise.all([
      browserWindowIdPromise,
      requestRuntimeBootstrap()
    ])
    if (browserWindowId !== null) {
      // Why: the source-only client cannot read Chrome globals. Supplying the exact
      // window fact lets its two extension surfaces coordinate without guessing.
      Reflect.set(globalThis, '__AGENTSTART_BROWSER_WINDOW_ID__', browserWindowId)
    }
    connectionStage = 'health-check'
    await verifyRuntimeHealth(response)
    connectionStage = 'client-mount'
    unmountSurface?.()
    unmountSurface = null
    const browserCapabilities = createBrowserCapabilities(response)
    await mountExtensionClient({
      browserCapabilities,
      openExternalUrl: async (target) => {
        const navigationResponse: unknown = await chrome.runtime.sendMessage({
          ...target,
          type: 'open-external-url'
        })
        if (
          typeof navigationResponse !== 'object' ||
          navigationResponse === null ||
          Reflect.get(navigationResponse, 'ok') !== true
        ) {
          throw new Error('extension_browser_action_failed')
        }
      },
      openPage: (page) => {
        void chrome.runtime.sendMessage({ page, type: 'open-page' })
      },
      openWorkspace: (target) => {
        void chrome.runtime.sendMessage({ target, type: 'open-workspace' })
      },
      publishAgentAttention: (count) => {
        void chrome.runtime.sendMessage({ count, type: 'agent-attention' })
      },
      readActivePageUrl: async () => {
        const stored: unknown = await chrome.storage.local.get('contextAwarenessEnabled')
        if (
          typeof stored !== 'object' ||
          stored === null ||
          Reflect.get(stored, 'contextAwarenessEnabled') !== true
        ) {
          return null
        }
        const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
        return tabs[0]?.url ?? null
      },
      runtimeHost: createExtensionRuntimeHostFactory(
        response,
        requestRuntimeBootstrap,
        browserCapabilities.executeBrowserCommand
      ),
      surface
    })
  }

  const mountFailure = (failure: ExtensionUnavailableFailure): void => {
    replaceSurface(() =>
      mountExtensionUnavailable(failure.reason, {
        connectionSettings: {
          read: readDaemonConnectionSettings,
          reset: clearDaemonConnectionSettings,
          save: savePermittedDaemonConnectionSettings
        },
        diagnostic: failure.diagnostic,
        requestLoopbackAccess: async () => {
          const bootstrap = await requestRuntimeBootstrap()
          await requestRuntimeLoopbackAccess(bootstrap)
        },
        retry,
        retryDelayMs: 1_500
      })
    )
  }

  const retry = (): Promise<ExtensionUnavailableFailure | null> => {
    if (retryInFlight) {
      return retryInFlight
    }
    const attempt = connect()
      .then(() => null)
      .catch((error: unknown): ExtensionUnavailableFailure => {
        const reason = classifyUnavailableError(error)
        const failure = { diagnostic: safeDiagnostic(reason, connectionStage), reason }
        if (connectionStage === 'client-mount' && unmountSurface === null) {
          mountFailure(failure)
        }
        return failure
      })
      .finally(() => {
        if (retryInFlight === attempt) {
          retryInFlight = null
        }
      })
    retryInFlight = attempt
    return attempt
  }

  const failure = await retry()
  if (failure && unmountSurface !== null) {
    mountFailure(failure)
  }
}

function safeDiagnostic(reason: string, stage: ConnectionStage): string {
  return [
    'AgentStart extension connection diagnostic',
    `reason: ${reason}`,
    `stage: ${stage}`,
    'protocol: agentstart-protobuf-v2',
    'protocol version: 2'
  ].join('\n')
}

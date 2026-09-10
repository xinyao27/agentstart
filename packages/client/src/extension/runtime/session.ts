import { translate } from '~renderer/i18n/i18n'
import {
  configureBrowserHostAppControl,
  configureBrowserHostDiagnostics,
  configureBrowserHostLocalDownloads,
  configureBrowserHostNotificationSounds,
  configureBrowserHostProtocol,
  configureBrowserHostStats,
  configureBrowserHostStatus,
  configureBrowserHostTerminalMultiplex
} from '~renderer/runtime/browser-host-runtime'
import { installShellHostHandlers } from '~renderer/runtime/shell-host/handler'

import { ExtensionRuntimeCalls } from './calls'
import type {
  ExtensionConnectionState,
  ExtensionRuntimeHost,
  ExtensionRuntimeHostFactory
} from './host'

let runtimeHost: ExtensionRuntimeHost | null = null

export function configureExtensionRuntime(createRuntimeHost: ExtensionRuntimeHostFactory): void {
  runtimeHost?.close()
  const nextRuntimeHost = createRuntimeHost({
    installShellHandlers: installShellHostHandlers,
    messages: {
      connectionClosed: translate('terminal.connection.closed', 'Terminal connection closed'),
      connectionFailed: translate(
        'extension.runtime.connectionFailed',
        'Failed to connect to the AgentStart daemon.'
      ),
      connectionTimedOut: translate(
        'extension.runtime.connectionTimedOut',
        'Timed out while connecting to the AgentStart daemon.'
      ),
      invalidMultiplexResponse: translate(
        'terminal.multiplex.invalidResponse',
        'Invalid terminal multiplex response'
      ),
      invalidMultiplexTicket: translate(
        'terminal.multiplex.invalidTicket',
        'Runtime host returned an invalid terminal bulk ticket.'
      )
    }
  })
  runtimeHost = nextRuntimeHost
  const calls = new ExtensionRuntimeCalls((timeoutMs) => nextRuntimeHost.openProtocol(timeoutMs))
  configureBrowserHostAppControl({
    restart: (timeoutMs) => calls.restartApp(timeoutMs),
    recordStartupDiagnostic: (event, details, timeoutMs) =>
      calls.recordStartupDiagnostic(event, details, timeoutMs)
  })
  configureBrowserHostDiagnostics((timeoutMs) => calls.getMemorySnapshot(timeoutMs))
  configureBrowserHostLocalDownloads(() => calls.getLocalDownloadClient())
  configureBrowserHostNotificationSounds((cachedAssetId) =>
    calls.loadNotificationSound(cachedAssetId)
  )
  configureBrowserHostProtocol(
    () => calls.getProtocolTransport(),
    () => nextRuntimeHost.isLocalDevice()
  )
  configureBrowserHostStats((input, timeoutMs) => calls.getStatsSummary(input, timeoutMs))
  configureBrowserHostStatus((timeoutMs) => calls.getStatus(timeoutMs))
  configureBrowserHostTerminalMultiplex((options) => nextRuntimeHost.openTerminalMultiplex(options))
}

export function getExtensionRuntimeLabel(): string {
  return runtimeHost?.label ?? ''
}

export function getExtensionRuntimeQueryCacheBuster(): string {
  return runtimeHost?.queryCacheBuster ?? 'extension-runtime-unconfigured'
}

export function getExtensionConnectionSnapshot(): ExtensionConnectionState {
  return runtimeHost?.getConnectionState() ?? 'connecting'
}

export function subscribeExtensionConnection(listener: () => void): () => void {
  return runtimeHost?.subscribe(listener) ?? (() => {})
}

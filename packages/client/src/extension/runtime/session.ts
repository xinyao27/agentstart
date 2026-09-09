import {
  configureBrowserHostAppControl,
  configureBrowserHostDiagnostics,
  configureBrowserHostLocalDownloads,
  configureBrowserHostNotificationSounds,
  configureBrowserHostProtocol,
  configureBrowserHostStats,
  configureBrowserHostStatus,
  configureBrowserHostTerminalMultiplex
} from '../../runtime/browser-host-runtime'
import { ExtensionRuntimeClient, type ExtensionConnectionState } from './client'
import { openExtensionTerminalMultiplex } from './terminal-multiplex'

export type ExtensionRuntimeBootstrap = {
  authToken: string
  endpoint: string
  expectedRuntimeId: string | null
  protocolVersion: number
  rpcProtocol: 'yiru-protobuf-v2'
}

let runtimeClient: ExtensionRuntimeClient | null = null
let runtimeLabel = ''

export function configureExtensionRuntime(bootstrap: ExtensionRuntimeBootstrap): void {
  runtimeClient?.close()
  const nextRuntimeClient = new ExtensionRuntimeClient(bootstrap)
  runtimeClient = nextRuntimeClient
  runtimeLabel = new URL(bootstrap.endpoint).host
  configureBrowserHostAppControl({
    restart: (timeoutMs) => nextRuntimeClient.restartApp(timeoutMs),
    recordStartupDiagnostic: (event, details, timeoutMs) =>
      nextRuntimeClient.recordStartupDiagnostic(event, details, timeoutMs)
  })
  configureBrowserHostDiagnostics((timeoutMs) => nextRuntimeClient.getMemorySnapshot(timeoutMs))
  configureBrowserHostLocalDownloads(() => nextRuntimeClient.getLocalDownloadClient())
  configureBrowserHostNotificationSounds((cachedAssetId) =>
    nextRuntimeClient.loadNotificationSound(cachedAssetId)
  )
  configureBrowserHostProtocol(() => nextRuntimeClient.getProtocolTransport())
  configureBrowserHostStats((input, timeoutMs) =>
    nextRuntimeClient.getStatsSummary(input, timeoutMs)
  )
  configureBrowserHostStatus((timeoutMs) => nextRuntimeClient.getStatus(timeoutMs))
  configureBrowserHostTerminalMultiplex((options) =>
    openExtensionTerminalMultiplex(bootstrap, options)
  )
}

export function getExtensionRuntimeLabel(): string {
  return runtimeLabel
}

export function getExtensionConnectionSnapshot(): ExtensionConnectionState {
  return runtimeClient?.getConnectionState() ?? 'connecting'
}

export function subscribeExtensionConnection(listener: () => void): () => void {
  return runtimeClient?.subscribe(listener) ?? (() => {})
}

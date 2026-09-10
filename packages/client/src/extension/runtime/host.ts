import type { RuntimeHandlerRegistry, RuntimeTransport } from '@agentstart/protocol'
import type {
  BrowserHostTerminalMultiplexHandle,
  BrowserHostTerminalMultiplexOptions
} from '~renderer/runtime/browser-host-runtime'

export type ExtensionConnectionState = 'connecting' | 'connected' | 'reconnecting'
export type ExtensionRuntimeTerminalHandle = BrowserHostTerminalMultiplexHandle
export type ExtensionRuntimeTerminalOptions = BrowserHostTerminalMultiplexOptions

export type ExtensionRuntimeHostMessages = {
  connectionClosed: string
  connectionFailed: string
  connectionTimedOut: string
  invalidMultiplexResponse: string
  invalidMultiplexTicket: string
}

export type ExtensionRuntimeHostSetup = {
  installShellHandlers: (registry: RuntimeHandlerRegistry) => () => void
  messages: ExtensionRuntimeHostMessages
}

export type ExtensionRuntimeHost = {
  close: () => void
  getConnectionState: () => ExtensionConnectionState
  isLocalDevice: () => boolean
  label: string
  openProtocol: (timeoutMs?: number) => Promise<RuntimeTransport>
  openTerminalMultiplex: (
    options: BrowserHostTerminalMultiplexOptions
  ) => Promise<BrowserHostTerminalMultiplexHandle>
  queryCacheBuster: string
  subscribe: (listener: () => void) => () => void
}

export type ExtensionRuntimeHostFactory = (setup: ExtensionRuntimeHostSetup) => ExtensionRuntimeHost

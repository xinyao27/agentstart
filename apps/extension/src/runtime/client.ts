import type {
  ExtensionConnectionState,
  ExtensionRuntimeHost,
  ExtensionRuntimeHostFactory,
  ExtensionRuntimeHostSetup,
  ExtensionRuntimeTerminalHandle,
  ExtensionRuntimeTerminalOptions
} from '@agentstart/client/extension-bootstrap'
import {
  installBrowserHostHandlers,
  type BrowserCommandExecutor,
  type RuntimeTransport
} from '@agentstart/protocol'

import type { ExtensionBootstrapResult } from '../bootstrap-response'
import {
  isLocalDeviceRuntime,
  refreshedRuntimeIdentity,
  remainingRuntimeConnectTimeout,
  runtimeQueryCacheBuster,
  runtimeReconnectDelay
} from './connection-policy'
import { ExtensionSocketMultiplexer } from './socket'
import { extensionRuntimeSocketUrl, waitForExtensionRuntimeSocket } from './socket-endpoint'
import { openExtensionTerminalMultiplex } from './terminal-multiplex'

export function createExtensionRuntimeHostFactory(
  bootstrap: ExtensionBootstrapResult,
  refreshRuntimeBootstrap: () => Promise<ExtensionBootstrapResult>,
  executeBrowserCommand: BrowserCommandExecutor
): ExtensionRuntimeHostFactory {
  return (setup) =>
    new ExtensionRuntimeClient(bootstrap, refreshRuntimeBootstrap, executeBrowserCommand, setup)
}

class ExtensionRuntimeClient implements ExtensionRuntimeHost {
  private clientPromise: Promise<void> | null = null
  private connectionState: ExtensionConnectionState = 'connecting'
  private credentials: ExtensionBootstrapResult
  private expectedRuntimeId: string | null
  private readonly executeBrowserCommand: BrowserCommandExecutor
  private readonly instanceId = crypto.randomUUID()
  private isClosed = false
  readonly label: string
  private readonly listeners = new Set<() => void>()
  private multiplexer: ExtensionSocketMultiplexer | null = null
  readonly queryCacheBuster: string
  private reconnectAttempt = 0
  private refreshBootstrapOnNextConnect = false
  private readonly refreshRuntimeBootstrap: () => Promise<ExtensionBootstrapResult>
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private readonly setup: ExtensionRuntimeHostSetup
  private socket: WebSocket | null = null

  constructor(
    credentials: ExtensionBootstrapResult,
    refreshRuntimeBootstrap: () => Promise<ExtensionBootstrapResult>,
    executeBrowserCommand: BrowserCommandExecutor,
    setup: ExtensionRuntimeHostSetup
  ) {
    this.credentials = credentials
    this.expectedRuntimeId = credentials.expectedRuntimeId
    this.executeBrowserCommand = executeBrowserCommand
    this.label = new URL(credentials.endpoint).host
    this.queryCacheBuster = runtimeQueryCacheBuster(credentials)
    this.refreshRuntimeBootstrap = refreshRuntimeBootstrap
    this.setup = setup
  }

  async openProtocol(timeoutMs = 12_000): Promise<RuntimeTransport> {
    await this.ensureConnected(timeoutMs)
    const transport = this.multiplexer?.protocolPeer
    if (!transport) {
      throw new Error('extension_runtime_protocol_unavailable')
    }
    return transport
  }

  async openTerminalMultiplex(
    options: ExtensionRuntimeTerminalOptions
  ): Promise<ExtensionRuntimeTerminalHandle> {
    await this.ensureConnected()
    return openExtensionTerminalMultiplex(this.currentBootstrap(), this.setup, options)
  }

  close(): void {
    this.isClosed = true
    this.clearReconnectTimer()
    this.multiplexer?.close()
    this.multiplexer = null
    this.socket?.close(1000, 'Client closed')
    this.socket = null
    this.clientPromise = null
  }

  getConnectionState(): ExtensionConnectionState {
    return this.connectionState
  }

  isLocalDevice(): boolean {
    return isLocalDeviceRuntime(this.credentials)
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private async ensureConnected(timeoutMs = 12_000): Promise<void> {
    if (this.isClosed) {
      throw new Error('extension_runtime_client_closed')
    }
    if (!this.clientPromise) {
      this.setConnectionState(this.socket ? 'reconnecting' : this.connectionState)
      this.clientPromise = this.connect(timeoutMs)
    }
    try {
      return await this.clientPromise
    } catch (error) {
      this.clientPromise = null
      if (!this.isClosed) {
        this.refreshBootstrapOnNextConnect = true
        this.setConnectionState('reconnecting')
        this.scheduleReconnect()
      }
      throw error
    }
  }

  private async connect(timeoutMs: number): Promise<void> {
    const deadline = performance.now() + timeoutMs
    let refreshed = false
    if (this.refreshBootstrapOnNextConnect) {
      await this.refreshBootstrap()
      this.throwIfClosed()
      this.refreshBootstrapOnNextConnect = false
      refreshed = true
    }
    try {
      await this.connectCurrent(deadline)
    } catch (error) {
      this.clearFailedConnection()
      this.throwIfClosed()
      if (refreshed) {
        throw error
      }
      // Why: the daemon can restart between page bootstrap and the first socket attempt. Refresh
      // once through Native Messaging; the reconnect schedule owns any later retries.
      await this.refreshBootstrap()
      this.throwIfClosed()
      try {
        await this.connectCurrent(deadline)
      } catch (retryError) {
        this.clearFailedConnection()
        throw retryError
      }
    }
  }

  private async connectCurrent(deadline: number): Promise<void> {
    const socket = new WebSocket(extensionRuntimeSocketUrl(this.credentials))
    this.socket = socket
    await waitForExtensionRuntimeSocket(
      socket,
      this.setup.messages,
      remainingRuntimeConnectTimeout(deadline)
    )
    this.throwIfClosed()
    const multiplexer = new ExtensionSocketMultiplexer(socket, this.setup)
    this.multiplexer = multiplexer
    let didConnect = false
    let didClose = false
    const handleClose = (): void => {
      if (!didConnect) {
        didClose = true
        return
      }
      if (this.socket === socket) {
        multiplexer.close()
        this.multiplexer = null
        this.socket = null
        this.clientPromise = null
        this.refreshBootstrapOnNextConnect = true
        this.setConnectionState('reconnecting')
        this.scheduleReconnect()
      }
    }
    socket.addEventListener('close', handleClose)
    try {
      await this.connectProtocol(multiplexer, deadline)
      if (!(await multiplexer.connectShellServices())) {
        throw new Error('extension_shell_services_unavailable')
      }
      this.throwIfClosed()
      if (didClose || socket.readyState !== WebSocket.OPEN) {
        throw new Error('extension_runtime_connection_closed')
      }
    } catch (error) {
      socket.removeEventListener('close', handleClose)
      multiplexer.close()
      this.multiplexer = null
      socket.close(1011, 'Runtime protocol unavailable')
      if (this.socket === socket) {
        this.socket = null
      }
      throw error
    }
    didConnect = true
    this.setConnectionState('connected')
    this.reconnectAttempt = 0
    this.clearReconnectTimer()
  }

  private async connectProtocol(
    multiplexer: ExtensionSocketMultiplexer,
    deadline: number
  ): Promise<void> {
    installBrowserHostHandlers(multiplexer.protocolPeer.handlers, this.executeBrowserCommand)
    const welcome = await multiplexer.protocolPeer.hello(
      {
        kind: 'chrome-extension',
        reverseCalls: true,
        name: 'agentstart-extension',
        version: String(this.credentials.protocolVersion),
        instanceId: this.instanceId
      },
      remainingRuntimeConnectTimeout(deadline)
    )
    this.throwIfClosed()
    if (this.expectedRuntimeId !== null && welcome.runtimeId !== this.expectedRuntimeId) {
      throw new Error('extension_runtime_identity_mismatch')
    }
    // Why: custom endpoints learn identity from authenticated Hello once, then reconnects retain
    // the same anti-confusion check as Native Messaging sessions.
    this.expectedRuntimeId = welcome.runtimeId
  }

  private async refreshBootstrap(): Promise<void> {
    const credentials = await this.refreshRuntimeBootstrap()
    this.throwIfClosed()
    this.credentials = credentials
    // Why: only Native Messaging may authorize a runtime identity change; Hello still proves it
    // reached that exact refreshed runtime.
    this.expectedRuntimeId = refreshedRuntimeIdentity(this.expectedRuntimeId, credentials)
  }

  private currentBootstrap(): ExtensionBootstrapResult {
    return { ...this.credentials, expectedRuntimeId: this.expectedRuntimeId }
  }

  private throwIfClosed(): void {
    if (this.isClosed) {
      throw new Error('extension_runtime_client_closed')
    }
  }

  private clearFailedConnection(): void {
    this.multiplexer?.close()
    this.multiplexer = null
    this.socket?.close(1011, 'Runtime connection failed')
    this.socket = null
  }

  private setConnectionState(state: ExtensionConnectionState): void {
    if (state === this.connectionState) {
      return
    }
    this.connectionState = state
    for (const listener of this.listeners) {
      listener()
    }
  }

  private scheduleReconnect(): void {
    if (this.isClosed || this.reconnectTimer || this.clientPromise) {
      return
    }
    const delayMs = runtimeReconnectDelay(this.reconnectAttempt, Math.random())
    this.reconnectAttempt += 1
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      void this.ensureConnected().catch(() => {})
    }, delayMs)
  }

  private clearReconnectTimer(): void {
    if (!this.reconnectTimer) {
      return
    }
    clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
  }
}

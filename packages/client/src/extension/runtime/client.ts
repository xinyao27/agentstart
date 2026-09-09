import {
  NotificationsClient,
  installBrowserHostHandlers,
  type LocalDownloadClient,
  type NotificationSoundLoadResult,
  type RuntimeTransport
} from '@yiru/protocol'
import type { MemorySnapshot } from '@yiru/protocol/diagnostics/memory-values'
import type { StatsSummaryInput } from '@yiru/protocol/stats/client'
import type { StatsSummaryResult } from '@yiru/protocol/stats/values'
import { mapProtocolMemorySnapshot } from '~renderer/runtime/memory-snapshot'
import { mapProtocolStatus } from '~renderer/runtime/status-mapping'
import type { RuntimeStatusResult } from '~renderer/runtime/status/model'
import { mapProtocolStatsSummary } from '~renderer/stats/protocol-summary'

import { getExtensionBrowserCapabilities } from '../browser-capabilities'
import { recordRuntimeStartupDiagnostic, restartRuntimeApp } from './app-control'
import { ExtensionProtocolClients } from './protocol-clients'
import type { ExtensionRuntimeBootstrap } from './session'
import { ExtensionSocketMultiplexer } from './socket'
import { extensionRuntimeSocketUrl, waitForExtensionRuntimeSocket } from './socket-endpoint'

export type ExtensionConnectionState = 'connecting' | 'connected' | 'reconnecting'

const NOTIFICATION_SOUND_PROTOCOL_CAPABILITY = 'notifications.customSound.protobuf.v1'

export class ExtensionRuntimeClient {
  private clientPromise: Promise<void> | null = null
  private connectionState: ExtensionConnectionState = 'connecting'
  private readonly credentials: ExtensionRuntimeBootstrap
  private expectedRuntimeId: string | null
  private readonly instanceId = crypto.randomUUID()
  private isClosed = false
  private readonly listeners = new Set<() => void>()
  private multiplexer: ExtensionSocketMultiplexer | null = null
  private readonly protocol = new ExtensionProtocolClients()
  private reconnectAttempt = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private socket: WebSocket | null = null

  constructor(credentials: ExtensionRuntimeBootstrap) {
    this.credentials = credentials
    this.expectedRuntimeId = credentials.expectedRuntimeId
  }

  async ensureConnected(timeoutMs = 12_000): Promise<void> {
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
      this.setConnectionState('reconnecting')
      this.scheduleReconnect()
      throw error
    }
  }

  async getStatus(timeoutMs = 12_000): Promise<RuntimeStatusResult> {
    const deadline = performance.now() + timeoutMs
    await this.ensureConnected(timeoutMs)
    const callTimeoutMs = remainingConnectTimeout(deadline)
    const statusClient = this.protocol.status
    if (!statusClient) {
      throw new Error('extension_runtime_protocol_unavailable')
    }
    const status = await statusClient.get({ timeoutMs: callTimeoutMs })
    return mapProtocolStatus(status)
  }

  async restartApp(timeoutMs = 12_000): Promise<void> {
    const deadline = performance.now() + timeoutMs
    await this.ensureConnected(timeoutMs)
    await restartRuntimeApp({
      deadline,
      protocolClient: this.protocol.appControl,
      remainingTimeout: remainingConnectTimeout
    })
  }

  async recordStartupDiagnostic(
    event: string,
    details?: Record<string, unknown>,
    timeoutMs = 12_000
  ): Promise<void> {
    const deadline = performance.now() + timeoutMs
    await this.ensureConnected(timeoutMs)
    await recordRuntimeStartupDiagnostic({
      deadline,
      details,
      event,
      protocolClient: this.protocol.appControl,
      remainingTimeout: remainingConnectTimeout
    })
  }

  async getMemorySnapshot(timeoutMs = 12_000): Promise<MemorySnapshot> {
    const deadline = performance.now() + timeoutMs
    await this.ensureConnected(timeoutMs)
    const callTimeoutMs = remainingConnectTimeout(deadline)
    const diagnosticsClient = this.protocol.diagnostics
    if (!diagnosticsClient) {
      throw new Error('extension_runtime_protocol_unavailable')
    }
    const snapshot = await diagnosticsClient.getMemorySnapshot({ timeoutMs: callTimeoutMs })
    return mapProtocolMemorySnapshot(snapshot)
  }

  async loadNotificationSound(
    cachedAssetId?: string,
    timeoutMs = 12_000
  ): Promise<NotificationSoundLoadResult> {
    const deadline = performance.now() + timeoutMs
    await this.ensureConnected(timeoutMs)
    const callTimeoutMs = remainingConnectTimeout(deadline)
    if (
      !(await this.protocol.supportsCapability(
        NOTIFICATION_SOUND_PROTOCOL_CAPABILITY,
        deadline,
        remainingConnectTimeout
      ))
    ) {
      return { state: 'unavailable', reason: 'read-failed' }
    }
    const transport = await this.getProtocolTransport(callTimeoutMs)
    return new NotificationsClient(transport).loadCustomSound(cachedAssetId, {
      timeoutMs: remainingConnectTimeout(deadline)
    })
  }

  async getLocalDownloadClient(timeoutMs = 12_000): Promise<LocalDownloadClient> {
    await this.ensureConnected(timeoutMs)
    const client = this.protocol.localDownload
    if (!client) {
      throw new Error('extension_runtime_protocol_unavailable')
    }
    return client
  }

  async getProtocolTransport(timeoutMs = 12_000): Promise<RuntimeTransport> {
    await this.ensureConnected(timeoutMs)
    const transport = this.multiplexer?.protocolPeer
    if (!transport) {
      throw new Error('extension_runtime_protocol_unavailable')
    }
    return transport
  }

  async getStatsSummary(input: StatsSummaryInput, timeoutMs = 12_000): Promise<StatsSummaryResult> {
    const deadline = performance.now() + timeoutMs
    await this.ensureConnected(timeoutMs)
    const callTimeoutMs = remainingConnectTimeout(deadline)
    const statsClient = this.protocol.stats
    if (!statsClient) {
      throw new Error('extension_runtime_protocol_unavailable')
    }
    const summary = await statsClient.getSummary(input, { timeoutMs: callTimeoutMs })
    return mapProtocolStatsSummary(summary, input.range)
  }

  close(): void {
    this.isClosed = true
    this.clearReconnectTimer()
    this.multiplexer?.close()
    this.multiplexer = null
    this.protocol.clear()
    this.socket?.close(1000, 'Client closed')
    this.socket = null
    this.clientPromise = null
  }

  getConnectionState(): ExtensionConnectionState {
    return this.connectionState
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private async connect(timeoutMs: number): Promise<void> {
    const deadline = performance.now() + timeoutMs
    const socket = new WebSocket(extensionRuntimeSocketUrl(this.credentials))
    this.socket = socket
    await waitForExtensionRuntimeSocket(socket, remainingConnectTimeout(deadline))
    const multiplexer = new ExtensionSocketMultiplexer(socket)
    this.multiplexer = multiplexer
    try {
      await this.connectProtocol(multiplexer, deadline)
      if (!(await multiplexer.connectShellServices())) {
        throw new Error('extension_shell_services_unavailable')
      }
    } catch (error) {
      multiplexer.close()
      this.multiplexer = null
      this.protocol.clear()
      socket.close(1011, 'Runtime protocol unavailable')
      if (this.socket === socket) {
        this.socket = null
      }
      throw error
    }
    this.setConnectionState('connected')
    this.reconnectAttempt = 0
    this.clearReconnectTimer()
    socket.addEventListener('close', () => {
      if (this.socket === socket) {
        multiplexer.close()
        this.multiplexer = null
        this.protocol.clear()
        this.socket = null
        this.clientPromise = null
        this.setConnectionState('reconnecting')
        this.scheduleReconnect()
      }
    })
  }

  private async connectProtocol(
    multiplexer: ExtensionSocketMultiplexer,
    deadline: number
  ): Promise<void> {
    installBrowserHostHandlers(
      multiplexer.protocolPeer.handlers,
      getExtensionBrowserCapabilities().executeBrowserCommand
    )
    const welcome = await multiplexer.protocolPeer.hello(
      {
        kind: 'chrome-extension',
        reverseCalls: true,
        name: 'yiru-extension',
        version: String(this.credentials.protocolVersion),
        instanceId: this.instanceId
      },
      remainingConnectTimeout(deadline)
    )
    if (this.expectedRuntimeId !== null && welcome.runtimeId !== this.expectedRuntimeId) {
      throw new Error('extension_runtime_identity_mismatch')
    }
    // Why: custom endpoints learn identity from the authenticated Hello once, then reconnects
    // retain the same anti-confusion check as native bootstrap sessions.
    this.expectedRuntimeId = welcome.runtimeId
    this.protocol.connect(multiplexer.protocolPeer)
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
    const exponentialMs = Math.min(30_000, 500 * 2 ** Math.min(this.reconnectAttempt, 6))
    const delayMs = exponentialMs + Math.floor(Math.random() * Math.min(1_000, exponentialMs / 4))
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

function remainingConnectTimeout(deadline: number): number {
  const timeoutMs = Math.ceil(deadline - performance.now())
  if (timeoutMs <= 0) {
    throw new Error('extension_runtime_connection_timed_out')
  }
  return timeoutMs
}

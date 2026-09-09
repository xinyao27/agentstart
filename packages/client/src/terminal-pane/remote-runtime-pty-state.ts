import { translate } from '~renderer/i18n/i18n'
import { isRemoteTerminalSurfaceTabId } from '~renderer/runtime/remote-terminal-surface-id'
import type { RuntimeClientTarget } from '~renderer/runtime/rpc-client'
import {
  REMOTE_TERMINAL_SNAPSHOT_TOO_LARGE,
  type RemoteRuntimeMultiplexedTerminal
} from '~renderer/runtime/terminal-multiplex/multiplexer'
import { runtimeTerminalErrorMessage } from '~renderer/runtime/terminal-stream'

import type { PtyTransport, RuntimePtyTransportOptions } from './pty/transport-types'

export type RemoteRuntimeViewport = { cols: number; rows: number }
export type RemoteRuntimeDelivery = Parameters<NonNullable<PtyTransport['setDeliveryState']>>[0]
export type RemoteRuntimeCallbacks = Parameters<PtyTransport['connect']>[0]['callbacks']

const PENDING_VIEWPORT_CLAIM_TIMEOUT_MS = 15_000

function remoteTerminalGoneMessage(): string {
  return translate(
    'auto.components.terminal.pane.remoteRuntimePtyTransport.gone',
    'Remote terminal was closed.'
  )
}

function isRemoteTerminalGoneMessage(message: string): boolean {
  const normalized = message.toLowerCase()
  return (
    normalized.includes('terminal_handle_stale') ||
    normalized.includes('terminal handle is stale') ||
    normalized.includes('terminal_exited') ||
    normalized.includes('terminal_gone') ||
    normalized.includes('no_connected_pty') ||
    normalized.includes('terminal has no connected pty')
  )
}

export class RemoteRuntimePtyState {
  private connectedValue = false
  private destroyedValue = false
  private handleValue: string | null = null
  private ptyIdValue: string | null = null
  private targetValue: RuntimeClientTarget
  private stream: RemoteRuntimeMultiplexedTerminal | null = null
  private streamHandle: string | null = null
  private viewportValue: RemoteRuntimeViewport | null = null
  private deliveryValue: RemoteRuntimeDelivery = {
    visible: true,
    interested: true,
    priority: 'active'
  }
  private callbacksValue: RemoteRuntimeCallbacks = {}
  private pendingClaim = false
  private pendingClaimInput = ''
  private pendingClaimTimer: ReturnType<typeof setTimeout> | null = null
  private readonly claimWaiters = new Set<(ready: boolean) => void>()
  private readonly tabId: string | undefined
  private readonly onPtyExit: RuntimePtyTransportOptions['onPtyExit']
  private readonly onPtySpawn: RuntimePtyTransportOptions['onPtySpawn']

  constructor(
    runtimeTarget: RuntimeClientTarget,
    tabId: string | undefined,
    onPtyExit: RuntimePtyTransportOptions['onPtyExit'],
    onPtySpawn: RuntimePtyTransportOptions['onPtySpawn']
  ) {
    this.targetValue = runtimeTarget
    this.tabId = tabId
    this.onPtyExit = onPtyExit
    this.onPtySpawn = onPtySpawn
  }

  get connected(): boolean {
    return this.connectedValue
  }

  get destroyed(): boolean {
    return this.destroyedValue
  }

  get handle(): string | null {
    return this.handleValue
  }

  get ptyId(): string | null {
    return this.ptyIdValue
  }

  get target(): RuntimeClientTarget {
    return this.targetValue
  }

  get viewport(): RemoteRuntimeViewport | null {
    return this.viewportValue
  }

  get delivery(): RemoteRuntimeDelivery {
    return this.deliveryValue
  }

  get callbacks(): RemoteRuntimeCallbacks {
    return this.callbacksValue
  }

  get hasPendingViewportClaim(): boolean {
    return this.pendingClaim
  }

  setCallbacks(callbacks: RemoteRuntimeCallbacks): void {
    this.callbacksValue = callbacks
  }

  setViewport(cols: number, rows: number): void {
    this.viewportValue = { cols, rows }
  }

  setDelivery(delivery: RemoteRuntimeDelivery): void {
    this.deliveryValue = delivery
  }

  markConnected(handle: string, ptyId: string, viewport: RemoteRuntimeViewport): void {
    this.handleValue = handle
    this.ptyIdValue = ptyId
    this.connectedValue = true
    this.viewportValue = viewport
    this.onPtySpawn?.(ptyId)
  }

  replaceHandle(handle: string, ptyId: string): void {
    this.handleValue = handle
    this.ptyIdValue = ptyId
    this.onPtySpawn?.(ptyId)
  }

  restoreHandle(
    handle: string,
    ptyId: string,
    target: RuntimeClientTarget,
    viewport: RemoteRuntimeViewport
  ): void {
    this.handleValue = handle
    this.ptyIdValue = ptyId
    this.targetValue = target
    this.connectedValue = true
    this.viewportValue = viewport
  }

  clearInvalidHandle(): void {
    this.handleValue = null
    this.ptyIdValue = null
    this.connectedValue = false
    this.closeStream()
  }

  isCurrent(handle: string, ptyId: string | null): boolean {
    return (
      !this.destroyedValue &&
      this.connectedValue &&
      this.handleValue === handle &&
      this.ptyIdValue === ptyId &&
      ptyId !== null
    )
  }

  getCurrentStream(handle: string): RemoteRuntimeMultiplexedTerminal | null {
    return this.streamHandle === handle ? this.stream : null
  }

  installStream(handle: string, stream: RemoteRuntimeMultiplexedTerminal): void {
    this.closeStream()
    this.stream = stream
    this.streamHandle = handle
  }

  clearStreamReference(): void {
    this.stream = null
    this.streamHandle = null
  }

  closeStream(): void {
    this.stream?.close()
    this.clearStreamReference()
  }

  beginViewportClaim(): void {
    this.pendingClaim = true
    if (this.pendingClaimTimer !== null) {
      return
    }
    this.pendingClaimTimer = setTimeout(() => {
      if (!this.pendingClaim) {
        return
      }
      this.clearViewportClaim()
      this.callbacksValue.onError?.(remoteTerminalGoneMessage())
    }, PENDING_VIEWPORT_CLAIM_TIMEOUT_MS)
  }

  finishViewportClaim(stream: RemoteRuntimeMultiplexedTerminal): void {
    if (this.pendingClaimTimer !== null) {
      clearTimeout(this.pendingClaimTimer)
      this.pendingClaimTimer = null
    }
    this.pendingClaim = false
    const input = this.pendingClaimInput
    this.pendingClaimInput = ''
    if (input) {
      stream.sendInput(input)
    }
    this.resolveClaimWaiters(true)
  }

  clearViewportClaim(): void {
    if (this.pendingClaimTimer !== null) {
      clearTimeout(this.pendingClaimTimer)
      this.pendingClaimTimer = null
    }
    this.pendingClaim = false
    this.pendingClaimInput = ''
    this.resolveClaimWaiters(false)
  }

  queueClaimInput(input: string): void {
    this.pendingClaimInput += input
  }

  waitForViewportClaim(): Promise<boolean> {
    return new Promise((resolve) => this.claimWaiters.add(resolve))
  }

  retire(): void {
    this.connectedValue = false
    this.clearViewportClaim()
    const stalePtyId = this.ptyIdValue
    this.handleValue = null
    this.ptyIdValue = null
    this.closeStream()
    if (stalePtyId) {
      this.onPtyExit?.(stalePtyId)
    }
  }

  disconnect(notify: boolean): void {
    if (!this.connectedValue && !this.handleValue) {
      return
    }
    this.connectedValue = false
    this.clearViewportClaim()
    const ptyId = this.ptyIdValue
    this.closeStream()
    this.handleValue = null
    this.ptyIdValue = null
    if (notify) {
      this.callbacksValue.onDisconnect?.()
      if (ptyId) {
        this.onPtyExit?.(ptyId)
      }
    }
  }

  detach(): void {
    this.connectedValue = false
    this.clearViewportClaim()
    this.closeStream()
    this.callbacksValue = {}
  }

  endSubscription(ptyId: string | null): void {
    this.connectedValue = false
    this.handleValue = null
    this.ptyIdValue = null
    this.clearStreamReference()
    this.clearViewportClaim()
    this.callbacksValue.onExit?.(0)
    this.callbacksValue.onDisconnect?.()
    if (ptyId) {
      this.onPtyExit?.(ptyId)
    }
  }

  markTransportDisconnected(): void {
    this.connectedValue = false
    this.clearViewportClaim()
    this.clearStreamReference()
    this.callbacksValue.onDisconnect?.()
  }

  destroy(): void {
    this.destroyedValue = true
  }

  handleRemoteError(error: unknown): void {
    const message = runtimeTerminalErrorMessage(error)
    if (message === REMOTE_TERMINAL_SNAPSHOT_TOO_LARGE) {
      return
    }
    if (isRemoteTerminalGoneMessage(message)) {
      this.retire()
      if (!isRemoteTerminalSurfaceTabId(this.tabId ?? '')) {
        this.callbacksValue.onError?.(remoteTerminalGoneMessage())
      }
      return
    }
    this.callbacksValue.onError?.(message)
  }

  isGoneError(error: unknown): boolean {
    return isRemoteTerminalGoneMessage(runtimeTerminalErrorMessage(error))
  }

  private resolveClaimWaiters(ready: boolean): void {
    for (const resolve of this.claimWaiters) {
      resolve(ready)
    }
    this.claimWaiters.clear()
  }
}

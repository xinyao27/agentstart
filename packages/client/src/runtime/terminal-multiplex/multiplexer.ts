import { TERMINAL_MULTIPLEX_PROTOCOL_CAPABILITY } from '@yiru/protocol/terminal-multiplex'
import type { TerminalMultiplexOpcode as TerminalMultiplexOpcodeValue } from '@yiru/protocol/terminal-multiplex/frame'

import type { RuntimeClientTarget } from '../runtime-target'
import { readRuntimeStatus } from '../status-client'
import { openRuntimeTerminalClient } from '../terminal-protocol'
import {
  openTerminalMultiplexSubscription,
  type RuntimeTerminalMultiplexHandle
} from './connection/open'
import { RemoteTerminalMultiplexWire } from './connection/wire'
import { RemoteTerminalMultiplexedStream } from './stream/stream'
import type {
  RemoteRuntimeMultiplexedTerminal,
  RemoteRuntimeMultiplexedTerminalCallbacks
} from './types'

export {
  REMOTE_TERMINAL_SNAPSHOT_TOO_LARGE,
  type RemoteRuntimeMultiplexedTerminal,
  type RemoteRuntimeMultiplexedTerminalCallbacks
} from './types'

const RECONNECT_DELAY_MS = 250

export class RemoteRuntimeTerminalMultiplexer {
  private readonly target: RuntimeClientTarget
  private readonly targetKey: string
  private readonly releaseIfCurrent: (
    targetKey: string,
    multiplexer: RemoteRuntimeTerminalMultiplexer
  ) => void
  private readonly streams = new Map<number, RemoteTerminalMultiplexedStream>()
  private readonly wire: RemoteTerminalMultiplexWire
  private subscription: RuntimeTerminalMultiplexHandle | null = null
  private connectPromise: Promise<void> | null = null
  private resolveReady: (() => void) | null = null
  private rejectReady: ((error: Error) => void) | null = null
  private serverReady = false
  private nextStreamId = 1
  private nextCorrelationId = 1
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private connectionAttempt = 0
  private recovering = false
  private pendingFrames: Uint8Array<ArrayBufferLike>[] = []

  constructor(
    target: RuntimeClientTarget,
    targetKey: string,
    releaseIfCurrent: (targetKey: string, multiplexer: RemoteRuntimeTerminalMultiplexer) => void
  ) {
    this.target = target
    this.targetKey = targetKey
    this.releaseIfCurrent = releaseIfCurrent
    this.wire = new RemoteTerminalMultiplexWire({
      sendBytes: (bytes) => {
        if (!this.subscription) {
          return false
        }
        this.subscription.sendBinary(bytes)
        return true
      },
      allocateCorrelationId: () => this.allocateCorrelationId(),
      onStreamFrame: (frame) => this.streams.get(frame.routeId)?.handle(frame),
      onAccepted: () => this.resolveIfReady(),
      onError: (error) => this.failConnection(this.connectionAttempt, error)
    })
  }

  async subscribeTerminal(args: {
    terminal: string
    client: { id: string; type: 'desktop' | 'mobile' }
    viewport?: { cols: number; rows: number }
    callbacks: RemoteRuntimeMultiplexedTerminalCallbacks
  }): Promise<RemoteRuntimeMultiplexedTerminal> {
    const [show] = await Promise.all([
      openRuntimeTerminalClient(this.target).then((client) => client.show(args.terminal)),
      this.ensureConnected()
    ])
    const transportGeneration = show.terminal.transportGeneration
    if (!transportGeneration) {
      throw new Error('Runtime host did not return a terminal transport generation.')
    }
    const streamId = this.allocateStreamId()
    const stream = new RemoteTerminalMultiplexedStream({
      streamId,
      terminal: args.terminal,
      transportGeneration,
      client: args.client,
      ...(args.viewport ? { viewport: args.viewport } : {}),
      callbacks: args.callbacks,
      send: (opcode, routeId, seq, correlationId, payload) =>
        this.send(opcode, routeId, seq, correlationId, payload),
      allocateCorrelationId: () => this.allocateCorrelationId(),
      onClose: (closedStreamId) => {
        this.streams.delete(closedStreamId)
        this.closeIfIdle()
      }
    })
    this.streams.set(streamId, stream)
    if (!stream.subscribe()) {
      this.streams.delete(streamId)
      throw new Error('Remote terminal multiplex connection is not writable.')
    }
    return stream.publicStream
  }

  private ensureConnected(): Promise<void> {
    if (this.subscription && this.wire.accepted && this.serverReady) {
      return Promise.resolve()
    }
    if (this.connectPromise) {
      return this.connectPromise
    }
    const promise = new Promise<void>((resolve, reject) => {
      this.resolveReady = resolve
      this.rejectReady = reject
      void this.openConnection()
    })
    this.connectPromise = promise
    return promise
  }

  private async openConnection(): Promise<void> {
    const attempt = ++this.connectionAttempt
    try {
      const status = await readRuntimeStatus(this.target)
      if (
        this.target.kind !== 'local' &&
        !status.capabilities?.includes(TERMINAL_MULTIPLEX_PROTOCOL_CAPABILITY)
      ) {
        throw new Error('Runtime host does not advertise terminal.multiplex.')
      }
      const subscription = await openTerminalMultiplexSubscription({
        environmentIdentity: this.target.kind === 'local' ? 'local' : this.target.environmentId,
        onReady: () => {
          if (attempt === this.connectionAttempt) {
            this.serverReady = true
            this.resolveIfReady()
          }
        },
        onBinary: (bytes) => this.handleBinary(attempt, bytes),
        onError: (error) => this.failConnection(attempt, error),
        onClose: () =>
          this.handleClose(attempt, 'Runtime host closed the terminal bulk connection.')
      })
      if (attempt !== this.connectionAttempt) {
        subscription.unsubscribe()
        return
      }
      this.subscription = subscription
      for (const frame of this.pendingFrames.splice(0)) {
        this.handleBinary(attempt, frame)
      }
      this.resolveIfReady()
    } catch (error) {
      this.failConnection(attempt, error instanceof Error ? error : new Error(String(error)))
    }
  }

  private handleBinary(attempt: number, bytes: Uint8Array<ArrayBufferLike>): void {
    if (attempt !== this.connectionAttempt) {
      return
    }
    if (!this.subscription) {
      this.pendingFrames.push(bytes)
      return
    }
    this.wire.handle(bytes)
  }

  private send(
    opcode: TerminalMultiplexOpcodeValue,
    routeId: number,
    seq: bigint,
    correlationId: number,
    payload: Uint8Array<ArrayBufferLike> = new Uint8Array()
  ): boolean {
    return this.subscription ? this.wire.send(opcode, routeId, seq, correlationId, payload) : false
  }

  private allocateStreamId(): number {
    if (this.nextStreamId > 0x7fffffff) {
      throw new Error('Terminal stream id space exhausted; reconnect is required.')
    }
    return this.nextStreamId++
  }

  private allocateCorrelationId(): number {
    if (this.nextCorrelationId > 0xffffffff) {
      throw new Error('Terminal correlation id space exhausted; reconnect is required.')
    }
    return this.nextCorrelationId++
  }

  private resolveIfReady(): void {
    if (!this.subscription || !this.wire.accepted || !this.serverReady) {
      return
    }
    if (this.recovering) {
      this.recovering = false
      for (const stream of this.streams.values()) {
        if (!stream.resubscribe()) {
          this.failConnection(
            this.connectionAttempt,
            new Error('Remote terminal recovery subscription was not writable.')
          )
          return
        }
      }
    }
    this.resolveReady?.()
    this.resolveReady = null
    this.rejectReady = null
  }

  private failConnection(attempt: number, error: Error): void {
    if (attempt !== this.connectionAttempt) {
      return
    }
    this.handleClose(attempt, error.message)
  }

  private handleClose(attempt: number, message?: string): void {
    if (attempt !== this.connectionAttempt) {
      return
    }
    const subscription = this.subscription
    if (this.streams.size === 0) {
      this.rejectReady?.(new Error(message))
      this.resetConnection()
      subscription?.unsubscribe()
      this.releaseIfCurrent(this.targetKey, this)
      return
    }
    for (const stream of this.streams.values()) {
      stream.transportClosed(false)
    }
    this.recovering = true
    this.resetConnection()
    subscription?.unsubscribe()
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      void this.ensureConnected().catch(() => {})
    }, RECONNECT_DELAY_MS)
  }

  private closeIfIdle(): void {
    if (this.streams.size === 0) {
      const subscription = this.subscription
      this.resetConnection()
      subscription?.unsubscribe()
      this.releaseIfCurrent(this.targetKey, this)
    }
  }

  private resetConnection(): void {
    this.connectionAttempt += 1
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
    }
    this.reconnectTimer = null
    this.subscription = null
    this.connectPromise = null
    this.resolveReady = null
    this.rejectReady = null
    this.wire.reset()
    this.serverReady = false
    this.nextCorrelationId = 1
    this.pendingFrames.splice(0)
  }
}

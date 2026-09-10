import {
  TerminalMultiplexOpcode,
  type TerminalMultiplexFrame,
  type TerminalMultiplexOpcode as TerminalMultiplexOpcodeValue
} from '@agentstart/protocol/terminal-multiplex/frame'
import {
  decodeTerminalMultiplexJson,
  encodeTerminalMultiplexJson
} from '@agentstart/protocol/terminal-multiplex/json'

import { RemoteTerminalDelivery } from '../delivery/delivery'
import type {
  RemoteRuntimeMultiplexedTerminal,
  RemoteRuntimeMultiplexedTerminalCallbacks
} from '../types'
import { RemoteTerminalControlSender } from './control-sender'

type SendFrame = (
  opcode: TerminalMultiplexOpcodeValue,
  routeId: number,
  seq: bigint,
  correlationId: number,
  payload?: Uint8Array<ArrayBufferLike>
) => boolean

type RemoteTerminalStreamOptions = {
  streamId: number
  terminal: string
  transportGeneration: string
  client: { id: string; type: 'desktop' | 'mobile' }
  viewport?: { cols: number; rows: number }
  callbacks: RemoteRuntimeMultiplexedTerminalCallbacks
  send: SendFrame
  allocateCorrelationId: () => number
  onClose: (streamId: number) => void
}

export class RemoteTerminalMultiplexedStream {
  readonly publicStream: RemoteRuntimeMultiplexedTerminal
  private readonly options: RemoteTerminalStreamOptions
  private readonly controls: RemoteTerminalControlSender
  private readonly delivery: RemoteTerminalDelivery
  private closed = false

  constructor(options: RemoteTerminalStreamOptions) {
    this.options = options
    this.delivery = new RemoteTerminalDelivery({
      routeId: options.streamId,
      callbacks: options.callbacks,
      send: options.send,
      allocateCorrelationId: options.allocateCorrelationId,
      setCredit: (bytes, reason) => this.controls.sendCredit(bytes, reason),
      onEnd: () => this.close(false)
    })
    this.controls = new RemoteTerminalControlSender({
      routeId: options.streamId,
      clientId: options.client.id,
      send: options.send,
      allocateCorrelationId: options.allocateCorrelationId,
      callbacks: options.callbacks,
      getParsedSeq: () => this.delivery.parsedSeq,
      gateOutputCredit: () => this.delivery.gateOutputCredit(),
      setDeliveryGated: (gated) => this.delivery.setDeliveryGated(gated),
      beginReveal: () => this.delivery.beginReveal()
    })
    this.publicStream = {
      streamId: options.streamId,
      sendInput: (text) => !this.closed && this.controls.sendInput(text),
      sendInputAccepted: (text) =>
        this.closed ? Promise.resolve(false) : this.controls.sendInputAccepted(text),
      sendQueryReply: (text) => !this.closed && this.controls.sendQueryReply(text),
      resize: (cols, rows) => !this.closed && this.controls.resize(cols, rows),
      claimViewport: (cols, rows) => !this.closed && this.controls.claimViewport(cols, rows),
      setDeliveryState: (state) => !this.closed && this.controls.setDeliveryState(state),
      signal: (signal) => !this.closed && this.controls.signal(signal),
      kill: (keepHistory) => !this.closed && this.controls.kill(keepHistory),
      serializeBuffer: (snapshotOptions) =>
        this.closed
          ? Promise.resolve(null)
          : this.delivery.requestSnapshot(snapshotOptions?.scrollbackRows),
      close: () => this.close(true)
    }
  }

  subscribe(): boolean {
    const correlationId = this.options.allocateCorrelationId()
    return this.options.send(
      TerminalMultiplexOpcode.Subscribe,
      this.options.streamId,
      this.delivery.parsedSeq,
      correlationId,
      encodeTerminalMultiplexJson({
        terminal: this.options.terminal,
        transportGeneration: this.options.transportGeneration,
        client: this.options.client,
        ...(this.options.viewport ? { viewport: this.options.viewport } : {}),
        lastParsedSeq: this.delivery.parsedSeq.toString(),
        delivery: this.controls.getDeliveryState(),
        snapshotMaxBytes: 2 * 1024 * 1024,
        capabilities: { dualScreenSnapshot: 1, parseAck: 1, explicitWriteAck: 1 }
      })
    )
  }

  resubscribe(): boolean {
    this.delivery.prepareForNewEpoch()
    this.controls.prepareForNewEpoch()
    return this.subscribe()
  }

  handle(frame: TerminalMultiplexFrame): void {
    if (this.closed) {
      return
    }
    if (frame.unsupportedOpcode !== undefined) {
      this.fail('Remote terminal sent an unsupported opcode.')
      return
    }
    if (this.delivery.handle(frame)) {
      return
    }
    if (frame.opcode === TerminalMultiplexOpcode.Subscribed) {
      this.handleSubscribed(frame)
      return
    }
    if (frame.opcode === TerminalMultiplexOpcode.Error) {
      this.handleError(frame)
      return
    }
    if (frame.opcode === TerminalMultiplexOpcode.FitOverride) {
      this.handleFitOverride(frame)
      return
    }
    if (frame.opcode === TerminalMultiplexOpcode.Driver) {
      this.handleDriver(frame)
      return
    }
    if (frame.opcode === TerminalMultiplexOpcode.Ack) {
      this.controls.handleAck(frame)
      return
    }
    if (frame.opcode === TerminalMultiplexOpcode.Credit) {
      if (!this.controls.handleCredit(frame)) {
        this.fail('Invalid remote terminal input credit.')
      }
    }
  }

  transportClosed(permanent = true): void {
    if (this.closed) {
      return
    }
    if (permanent) {
      this.closed = true
      this.controls.dispose()
      this.delivery.dispose()
      this.options.callbacks.onTransportClose?.()
    } else {
      this.delivery.prepareForNewEpoch()
      this.controls.prepareForNewEpoch()
    }
  }

  private handleSubscribed(frame: TerminalMultiplexFrame): void {
    const value = decodeTerminalMultiplexJson(frame.payload)
    if (
      value?.terminal !== this.options.terminal ||
      value.transportGeneration !== this.options.transportGeneration ||
      value.initialState !== 'snapshot' ||
      typeof value.snapshotId !== 'number'
    ) {
      this.fail('Invalid terminal subscription response.')
      return
    }
    this.delivery.beginInitialSnapshot(value.snapshotId)
  }

  private handleError(frame: TerminalMultiplexFrame): void {
    const value = decodeTerminalMultiplexJson(frame.payload)
    this.fail(
      typeof value?.message === 'string' ? value.message : 'Remote terminal protocol error.',
      value?.retryable === true
    )
  }

  private handleFitOverride(frame: TerminalMultiplexFrame): void {
    const value = decodeTerminalMultiplexJson(frame.payload)
    if (
      value &&
      (value.mode === 'mobile-fit' ||
        value.mode === 'desktop-fit' ||
        value.mode === 'remote-desktop-fit') &&
      typeof value.cols === 'number' &&
      typeof value.rows === 'number'
    ) {
      this.options.callbacks.onFitOverrideChanged?.({
        mode: value.mode,
        cols: value.cols,
        rows: value.rows
      })
    }
  }

  private handleDriver(frame: TerminalMultiplexFrame): void {
    const value = decodeTerminalMultiplexJson(frame.payload)
    if (isDriver(value?.driver)) {
      this.options.callbacks.onDriverChanged?.(value.driver)
    }
  }

  private fail(message: string, retryable = false): void {
    this.options.callbacks.onError?.(message, { kind: 'protocol', retryable })
    this.close(false)
    if (retryable) {
      this.options.callbacks.onTransportClose?.()
    }
  }

  private close(sendUnsubscribe: boolean): void {
    if (this.closed) {
      return
    }
    if (sendUnsubscribe) {
      this.controls.close()
    } else {
      this.controls.dispose()
    }
    this.closed = true
    this.delivery.dispose()
    this.options.onClose(this.options.streamId)
  }
}

function isDriver(
  value: unknown
): value is { kind: 'idle' } | { kind: 'desktop' } | { kind: 'mobile'; clientId: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    (value.kind === 'idle' ||
      value.kind === 'desktop' ||
      (value.kind === 'mobile' && 'clientId' in value && typeof value.clientId === 'string'))
  )
}

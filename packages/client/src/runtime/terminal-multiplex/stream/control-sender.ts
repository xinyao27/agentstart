import {
  decodeTerminalMultiplexAckRecord,
  decodeTerminalMultiplexCreditRecord,
  encodeTerminalMultiplexCreditRecord,
  encodeTerminalMultiplexInputRecord,
  encodeTerminalMultiplexKillRecord,
  encodeTerminalMultiplexVisibilityRecord
} from '@yiru/protocol/terminal-multiplex/flow-records'
import {
  TerminalMultiplexOpcode,
  type TerminalMultiplexFrame,
  type TerminalMultiplexOpcode as TerminalMultiplexOpcodeValue
} from '@yiru/protocol/terminal-multiplex/frame'
import { encodeTerminalMultiplexJson } from '@yiru/protocol/terminal-multiplex/json'

import type { RemoteRuntimeMultiplexedTerminalCallbacks } from '../types'

type SendFrame = (
  opcode: TerminalMultiplexOpcodeValue,
  routeId: number,
  seq: bigint,
  correlationId: number,
  payload?: Uint8Array<ArrayBufferLike>
) => boolean

type DeliveryState = {
  visible: boolean
  interested: boolean
  priority: 'parked' | 'visible' | 'active'
}

type RemoteTerminalControlSenderOptions = {
  routeId: number
  clientId: string
  send: SendFrame
  allocateCorrelationId: () => number
  callbacks: RemoteRuntimeMultiplexedTerminalCallbacks
  getParsedSeq: () => bigint
  gateOutputCredit: () => void
  setDeliveryGated: (gated: boolean) => void
  beginReveal: () => void
}

export class RemoteTerminalControlSender {
  private readonly options: RemoteTerminalControlSenderOptions
  private inputSeq = 0n
  private inputAckSeq = 0n
  private inputCreditBytes = 0
  private inputMaxFrameBytes = 64 * 1024
  private readonly pendingInputs = new Map<
    number,
    {
      resolve: ((accepted: boolean) => void) | null
      timer: ReturnType<typeof setTimeout> | null
    }
  >()
  private delivery: DeliveryState = {
    visible: true,
    interested: true,
    priority: 'active'
  }
  private pendingRevealStateVersion: number | null = null

  constructor(options: RemoteTerminalControlSenderOptions) {
    this.options = options
  }

  sendInput(text: string): boolean {
    return this.sendInputFrame(text, 0, null)
  }

  sendInputAccepted(text: string): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.sendInputFrame(text, 0, resolve)) {
        resolve(false)
      }
    })
  }

  sendQueryReply(text: string): boolean {
    return this.sendInputFrame(text, 1, null)
  }

  private sendInputFrame(
    text: string,
    kind: 0 | 1,
    resolve: ((accepted: boolean) => void) | null
  ): boolean {
    const data = new TextEncoder().encode(text)
    const inFlight = this.inputSeq - this.inputAckSeq
    if (
      data.byteLength > this.inputMaxFrameBytes ||
      inFlight + BigInt(data.byteLength) > BigInt(this.inputCreditBytes)
    ) {
      return false
    }
    const nextSeq = this.inputSeq + BigInt(data.byteLength)
    const correlationId = this.options.allocateCorrelationId()
    const sent = this.options.send(
      TerminalMultiplexOpcode.Input,
      this.options.routeId,
      nextSeq,
      correlationId,
      encodeTerminalMultiplexInputRecord({ kind, data })
    )
    if (sent) {
      this.inputSeq = nextSeq
      const timer = setTimeout(() => {
        const pending = this.pendingInputs.get(correlationId)
        if (!pending) {
          return
        }
        this.pendingInputs.delete(correlationId)
        pending.resolve?.(false)
        this.options.callbacks.onError?.('Remote terminal input acknowledgement timed out.')
      }, 10_000)
      this.pendingInputs.set(correlationId, { resolve, timer })
    }
    return sent
  }

  resize(cols: number, rows: number): boolean {
    return this.sendJson(TerminalMultiplexOpcode.Resize, { cols, rows, reason: 'fit' })
  }

  claimViewport(cols: number, rows: number): boolean {
    return this.sendJson(TerminalMultiplexOpcode.ClaimViewport, {
      action: 'claim',
      cols,
      rows,
      clientId: this.options.clientId
    })
  }

  signal(signal: string): boolean {
    return this.sendJson(TerminalMultiplexOpcode.Signal, { signal })
  }

  kill(keepHistory: boolean): boolean {
    return this.options.send(
      TerminalMultiplexOpcode.Kill,
      this.options.routeId,
      0n,
      this.options.allocateCorrelationId(),
      encodeTerminalMultiplexKillRecord({ keepHistory, immediate: true })
    )
  }

  setDeliveryState(state: DeliveryState): boolean {
    const stateVersion = this.options.allocateCorrelationId()
    const revealing =
      !this.delivery.visible && !this.delivery.interested && (state.visible || state.interested)
    if (revealing) {
      this.options.gateOutputCredit()
    }
    const sent = this.options.send(
      TerminalMultiplexOpcode.VisibilityGate,
      this.options.routeId,
      this.options.getParsedSeq(),
      stateVersion,
      encodeTerminalMultiplexVisibilityRecord({
        visible: state.visible,
        deliveryInterest: state.interested,
        priority: state.priority === 'parked' ? 0 : state.priority === 'visible' ? 1 : 2,
        stateVersion
      })
    )
    if (sent) {
      this.delivery = state
      this.options.setDeliveryGated(!state.visible && !state.interested)
      this.pendingRevealStateVersion = revealing ? stateVersion : null
    }
    return sent
  }

  getDeliveryState(): DeliveryState {
    return this.delivery
  }

  prepareForNewEpoch(): void {
    this.inputSeq = 0n
    this.inputAckSeq = 0n
    this.inputCreditBytes = 0
    this.pendingRevealStateVersion = null
    this.clearPendingInputs()
  }

  handleAck(frame: TerminalMultiplexFrame): void {
    const ack = decodeTerminalMultiplexAckRecord(frame.payload)
    if (!ack || ack.cumulativeSeq !== frame.seq) {
      this.options.callbacks.onError?.('Remote terminal control was rejected.')
      return
    }
    if (ack.kind === 1) {
      const pending = this.pendingInputs.get(frame.correlationId)
      if (pending) {
        if (pending.timer) {
          clearTimeout(pending.timer)
        }
        this.pendingInputs.delete(frame.correlationId)
        pending.resolve?.(ack.status === 0)
      }
      if (ack.status !== 0) {
        this.inputSeq = ack.cumulativeSeq
        this.inputAckSeq = ack.cumulativeSeq
        this.options.callbacks.onError?.('Remote terminal input was rejected.')
      } else if (ack.cumulativeSeq > this.inputAckSeq) {
        this.inputAckSeq = ack.cumulativeSeq
      }
      return
    }
    if (ack.status === 1) {
      this.options.callbacks.onError?.('Remote terminal control was rejected.')
      return
    }
    if (
      ack.kind === 3 &&
      this.pendingRevealStateVersion !== null &&
      frame.correlationId === this.pendingRevealStateVersion
    ) {
      const stateVersion = this.pendingRevealStateVersion
      this.pendingRevealStateVersion = null
      this.options.beginReveal()
      this.options.send(
        TerminalMultiplexOpcode.RevealSnapshot,
        this.options.routeId,
        this.options.getParsedSeq(),
        this.options.allocateCorrelationId(),
        encodeTerminalMultiplexJson({ stateVersion })
      )
    }
  }

  handleCredit(frame: TerminalMultiplexFrame): boolean {
    const credit = decodeTerminalMultiplexCreditRecord(frame.payload)
    if (!credit || credit.direction !== 1 || frame.seq !== 0n || frame.correlationId !== 0) {
      return false
    }
    this.inputCreditBytes = credit.maxInFlightBytes
    this.inputMaxFrameBytes = Math.min(64 * 1024, credit.maxFrameBytes)
    return true
  }

  close(): void {
    this.dispose()
    this.options.send(
      TerminalMultiplexOpcode.Unsubscribe,
      this.options.routeId,
      this.options.getParsedSeq(),
      this.options.allocateCorrelationId(),
      new Uint8Array()
    )
  }

  dispose(): void {
    this.clearPendingInputs()
  }

  private clearPendingInputs(): void {
    for (const pending of this.pendingInputs.values()) {
      if (pending.timer) {
        clearTimeout(pending.timer)
      }
      pending.resolve?.(false)
    }
    this.pendingInputs.clear()
  }

  sendCredit(bytes: number, reason: 0 | 1 | 2 | 3 = bytes === 0 ? 2 : 0): void {
    this.options.send(
      TerminalMultiplexOpcode.Credit,
      this.options.routeId,
      0n,
      0,
      encodeTerminalMultiplexCreditRecord({
        direction: 0,
        reason,
        maxInFlightBytes: bytes,
        ackEveryBytes: Math.max(16 * 1024, Math.floor(bytes / 8)),
        maxFrameBytes: 64 * 1024
      })
    )
  }

  private sendJson(opcode: TerminalMultiplexOpcodeValue, value: Record<string, unknown>): boolean {
    return this.options.send(
      opcode,
      this.options.routeId,
      0n,
      this.options.allocateCorrelationId(),
      encodeTerminalMultiplexJson(value)
    )
  }
}

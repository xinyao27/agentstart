import { encodeTerminalMultiplexAckRecord } from '@agentstart/protocol/terminal-multiplex/flow-records'
import {
  TerminalMultiplexOpcode,
  type TerminalMultiplexOpcode as TerminalMultiplexOpcodeValue
} from '@agentstart/protocol/terminal-multiplex/frame'

type SendFrame = (
  opcode: TerminalMultiplexOpcodeValue,
  routeId: number,
  seq: bigint,
  correlationId: number,
  payload?: Uint8Array<ArrayBufferLike>
) => boolean

type RemoteTerminalDeliveryAcksOptions = {
  routeId: number
  send: SendFrame
  onAdvance: (seq: bigint) => void
  onEnd: () => void
}

export class RemoteTerminalDeliveryAcks {
  private readonly options: RemoteTerminalDeliveryAcksOptions
  private readonly completions = new Map<bigint, bigint>()
  private parsedSequence = 0n
  private pendingBytes = 0
  private pendingExitSequence: bigint | null = null
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(options: RemoteTerminalDeliveryAcksOptions) {
    this.options = options
  }

  get parsedSeq(): bigint {
    return this.parsedSequence
  }

  rebase(seq: bigint): void {
    this.parsedSequence = seq
    this.completions.clear()
    this.pendingBytes = 0
    this.options.onAdvance(seq)
  }

  resetPending(): void {
    this.completions.clear()
    this.pendingBytes = 0
    this.pendingExitSequence = null
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  noteParsed(startSeq: bigint, endSeq: bigint, bytes: number): void {
    this.completions.set(startSeq, endSeq)
    let next = this.completions.get(this.parsedSequence)
    while (next !== undefined) {
      this.completions.delete(this.parsedSequence)
      this.parsedSequence = next
      next = this.completions.get(this.parsedSequence)
    }
    this.pendingBytes += bytes
    this.options.onAdvance(this.parsedSequence)
    if (this.pendingBytes >= 16 * 1024 || this.pendingExitSequence !== null) {
      this.flush()
    } else if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), 4)
    }
    this.publishExit()
  }

  deferExit(seq: bigint): void {
    this.pendingExitSequence = seq
    this.publishExit()
  }

  dispose(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  private flush(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    const bytes = this.pendingBytes
    this.pendingBytes = 0
    sendRemoteTerminalDeliveryAck(
      this.options.send,
      this.options.routeId,
      0,
      0,
      this.parsedSequence,
      bytes
    )
  }

  private publishExit(): void {
    if (this.pendingExitSequence !== null && this.parsedSequence >= this.pendingExitSequence) {
      this.pendingExitSequence = null
      this.options.onEnd()
    }
  }
}

export function sendRemoteTerminalDeliveryAck(
  send: SendFrame,
  routeId: number,
  kind: 0 | 1 | 2 | 3,
  correlationId: number,
  seq: bigint,
  bytes: number
): void {
  send(
    TerminalMultiplexOpcode.Ack,
    routeId,
    seq,
    correlationId,
    encodeTerminalMultiplexAckRecord({
      kind,
      status: 0,
      errorCode: 0,
      acknowledgedBytes: bytes,
      cumulativeSeq: seq,
      receiverQueueBytes: 0
    })
  )
}

export function once(callback: () => void): () => void {
  let called = false
  return () => {
    if (!called) {
      called = true
      callback()
    }
  }
}

export function safeSequenceNumber(value: bigint): number | undefined {
  return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : undefined
}

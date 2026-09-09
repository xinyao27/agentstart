import { decodeTerminalMultiplexAckRecord } from '@yiru/protocol/terminal-multiplex/flow-records'
import {
  TerminalMultiplexOpcode,
  type TerminalMultiplexFrame,
  type TerminalMultiplexOpcode as TerminalMultiplexOpcodeValue
} from '@yiru/protocol/terminal-multiplex/frame'
import { encodeTerminalMultiplexJson } from '@yiru/protocol/terminal-multiplex/json'

import type { RemoteTerminalSnapshot } from './snapshot'

type RemoteTerminalManualSnapshotOptions = {
  routeId: number
  allocateCorrelationId: () => number
  send: (
    opcode: TerminalMultiplexOpcodeValue,
    routeId: number,
    seq: bigint,
    correlationId: number,
    payload?: Uint8Array<ArrayBufferLike>
  ) => boolean
  getParsedSeq: () => bigint
  isSnapshotting: () => boolean
}

type PendingManualSnapshot = {
  id: number
  resolve: ((snapshot: RemoteTerminalSnapshot | null) => void) | null
  timer: ReturnType<typeof setTimeout> | null
}

export class RemoteTerminalManualSnapshot {
  private readonly options: RemoteTerminalManualSnapshotOptions
  private pending: PendingManualSnapshot | null = null

  constructor(options: RemoteTerminalManualSnapshotOptions) {
    this.options = options
  }

  request(scrollbackRows = 0): Promise<RemoteTerminalSnapshot | null> {
    if (this.options.isSnapshotting() || this.pending) {
      return Promise.resolve(null)
    }
    const id = this.options.allocateCorrelationId()
    const request = new Promise<RemoteTerminalSnapshot | null>((resolve) => {
      const timer = setTimeout(() => {
        if (this.pending?.id !== id || !this.pending.resolve) {
          return
        }
        const complete = this.pending.resolve
        this.pending.resolve = null
        this.pending.timer = null
        complete(null)
      }, 10_000)
      this.pending = { id, resolve, timer }
    })
    this.options.send(
      TerminalMultiplexOpcode.SnapshotRequest,
      this.options.routeId,
      this.options.getParsedSeq(),
      id,
      encodeTerminalMultiplexJson({
        requestedScrollbackRows: Math.max(0, scrollbackRows)
      })
    )
    return request
  }

  matches(snapshotId: number): boolean {
    return this.pending?.id === snapshotId
  }

  handleAck(frame: TerminalMultiplexFrame): boolean {
    if (this.pending?.id !== frame.correlationId) {
      return false
    }
    const ack = decodeTerminalMultiplexAckRecord(frame.payload)
    if (!ack || ack.kind !== 3 || ack.cumulativeSeq !== frame.seq) {
      return false
    }
    this.complete(null)
    return true
  }

  complete(snapshot: RemoteTerminalSnapshot | null): void {
    const pending = this.pending
    if (!pending) {
      return
    }
    if (pending.timer) {
      clearTimeout(pending.timer)
    }
    this.pending = null
    pending.resolve?.(snapshot)
  }

  cancel(): void {
    this.complete(null)
  }
}

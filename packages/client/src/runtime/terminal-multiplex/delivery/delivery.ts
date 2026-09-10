import {
  TerminalMultiplexOpcode,
  type TerminalMultiplexFrame
} from '@agentstart/protocol/terminal-multiplex/frame'
import {
  createTerminalMultiplexRecoveryState,
  reduceRecovery,
  type TerminalMultiplexRecoveryEvent,
  type TerminalMultiplexRecoveryState
} from '@agentstart/protocol/terminal-multiplex/recovery'
import { decodeTerminalMultiplexSnapshotEndRecord } from '@agentstart/protocol/terminal-multiplex/snapshot-records'
import * as streamRecords from '@agentstart/protocol/terminal-multiplex/stream-records'

import { RemoteTerminalManualSnapshot } from '../snapshot/manual'
import { publishRemoteTerminalSnapshot } from '../snapshot/publication'
import { RemoteTerminalSnapshotAssembler, type RemoteTerminalSnapshot } from '../snapshot/snapshot'
import {
  once,
  RemoteTerminalDeliveryAcks,
  safeSequenceNumber,
  sendRemoteTerminalDeliveryAck
} from './ack'
import { applyRemoteTerminalOutputCredit } from './credit'
import { reportTerminalDeliveryFailure } from './failure-message'
import { RemoteTerminalOrderedEvents } from './ordered-events'
import { TerminalOutputTextDecoder } from './output-text-decoder'
import { executeRemoteTerminalRecoveryEffect } from './recovery-effects'
import type { PendingRemoteTerminalOutput, RemoteTerminalDeliveryOptions } from './types'

export class RemoteTerminalDelivery {
  private readonly options: RemoteTerminalDeliveryOptions
  private readonly snapshot = new RemoteTerminalSnapshotAssembler()
  private readonly pendingOutput: PendingRemoteTerminalOutput[] = []
  private readonly orderedEvents: RemoteTerminalOrderedEvents
  private readonly manualSnapshot: RemoteTerminalManualSnapshot
  private readonly acks: RemoteTerminalDeliveryAcks
  private readonly outputTextDecoder = new TerminalOutputTextDecoder()
  private recovery: TerminalMultiplexRecoveryState = createTerminalMultiplexRecoveryState()
  private expectedSequence = 0n
  private initialSnapshotId = 0

  constructor(options: RemoteTerminalDeliveryOptions) {
    this.options = options
    this.orderedEvents = new RemoteTerminalOrderedEvents(options.callbacks, () =>
      this.recover('side-effect backlog')
    )
    this.acks = new RemoteTerminalDeliveryAcks({
      routeId: options.routeId,
      send: options.send,
      onAdvance: (seq) => this.orderedEvents.publishThrough(seq),
      onEnd: () => {
        this.options.callbacks.onEnd?.()
        this.options.onEnd()
      }
    })
    this.manualSnapshot = new RemoteTerminalManualSnapshot({
      routeId: options.routeId,
      allocateCorrelationId: options.allocateCorrelationId,
      send: options.send,
      getParsedSeq: () => this.acks.parsedSeq,
      isSnapshotting: () => this.isSnapshotting
    })
  }

  get parsedSeq(): bigint {
    return this.acks.parsedSeq
  }

  beginInitialSnapshot(snapshotId: number): void {
    this.initialSnapshotId = snapshotId
    this.dispatch({ type: 'client-begin-initial' })
  }

  gateOutputCredit(): void {
    this.dispatch({ type: 'client-gate-credit' })
  }

  setDeliveryGated(gated: boolean): void {
    this.dispatch({ type: gated ? 'delivery-gated' : 'delivery-active' })
  }

  beginReveal(): void {
    this.dispatch({ type: 'client-begin-reveal' })
  }

  handle(frame: TerminalMultiplexFrame): boolean {
    if (this.orderedEvents.handle(frame)) {
      return true
    }
    if (frame.opcode === TerminalMultiplexOpcode.Ack && this.manualSnapshot.handleAck(frame)) {
      return true
    }
    if (
      frame.opcode === TerminalMultiplexOpcode.Credit &&
      applyRemoteTerminalOutputCredit(frame, this.options.setCredit)
    ) {
      return true
    }
    if (frame.opcode === TerminalMultiplexOpcode.Output) {
      this.handleOutput(frame)
      return true
    }
    if (frame.opcode === TerminalMultiplexOpcode.SnapshotStart) {
      this.dispatch({ type: 'client-snapshot-started', accepted: this.snapshot.start(frame) })
      return true
    }
    if (frame.opcode === TerminalMultiplexOpcode.SnapshotChunk) {
      if (!this.snapshot.chunk(frame)) {
        this.recover('snapshot chunk mismatch')
      }
      return true
    }
    if (frame.opcode === TerminalMultiplexOpcode.SnapshotEnd) {
      this.handleSnapshotEnd(frame)
      return true
    }
    if (frame.opcode === TerminalMultiplexOpcode.End) {
      if (!streamRecords.decodeTerminalMultiplexEndRecord(frame)) {
        reportTerminalDeliveryFailure(this.options.callbacks, 'end-record')
        return true
      }
      this.acks.deferExit(frame.seq)
      return true
    }
    if (frame.opcode === TerminalMultiplexOpcode.ModelRestore) {
      const value = streamRecords.decodeTerminalMultiplexModelRestoreRecord(frame)
      if (!value) {
        reportTerminalDeliveryFailure(this.options.callbacks, 'restore-record')
        return true
      }
      if (!value.snapshotFollows) {
        this.orderedEvents.publishThrough(frame.seq)
      }
      this.dispatch({ type: 'client-model-restore', snapshotFollows: value.snapshotFollows })
      return true
    }
    return false
  }

  requestSnapshot(scrollbackRows = 0): Promise<RemoteTerminalSnapshot | null> {
    return this.manualSnapshot.request(scrollbackRows)
  }

  prepareForNewEpoch(): void {
    // Why: docs/reference/terminal-multiplex.md OQ-6 always restores a new epoch from an
    // authoritative snapshot; raw bytes from the previous epoch are never resumed.
    this.dispatch({ type: 'reset' })
    this.snapshot.clear()
    this.pendingOutput.splice(0)
    this.outputTextDecoder.reset()
    this.acks.resetPending()
    this.orderedEvents.clear()
    this.manualSnapshot.cancel()
  }

  dispose(): void {
    this.acks.dispose()
    this.manualSnapshot.cancel()
  }

  private handleOutput(frame: TerminalMultiplexFrame): void {
    const startSeq = frame.seq - BigInt(frame.payload.byteLength)
    if (startSeq < 0n) {
      this.recover('invalid output sequence')
      return
    }
    const output = { payload: frame.payload, startSeq, endSeq: frame.seq }
    if (this.isSnapshotting) {
      this.pendingOutput.push(output)
      return
    }
    this.deliverOutput(output)
  }

  private deliverOutput(output: PendingRemoteTerminalOutput): void {
    if (output.endSeq <= this.expectedSequence) {
      return
    }
    let payload = output.payload
    let startSeq = output.startSeq
    if (startSeq < this.expectedSequence) {
      payload = payload.slice(Number(this.expectedSequence - startSeq))
      startSeq = this.expectedSequence
    }
    if (startSeq !== this.expectedSequence) {
      this.recover('output sequence gap')
      return
    }
    const decoded = this.outputTextDecoder.decode(payload)
    if (!decoded.ok) {
      reportTerminalDeliveryFailure(this.options.callbacks, 'utf8')
      this.recover('invalid output utf8')
      return
    }
    this.expectedSequence = output.endSeq
    const onParsed = once(() => this.acks.noteParsed(startSeq, output.endSeq, payload.byteLength))
    this.options.callbacks.onData(
      decoded.data,
      {
        seq: safeSequenceNumber(output.endSeq),
        rawLength: decoded.data.length,
        wireByteLength: payload.byteLength
      },
      onParsed
    )
  }

  private handleSnapshotEnd(frame: TerminalMultiplexFrame): void {
    const end = decodeTerminalMultiplexSnapshotEndRecord(frame.payload)
    if (!end || end.snapshotId !== frame.correlationId || end.coverageEndSeq !== frame.seq) {
      this.recover('invalid snapshot end')
      return
    }
    if (end.status !== 0) {
      this.snapshot.clear()
      const isManual = this.manualSnapshot.matches(end.snapshotId)
      if (isManual) {
        this.manualSnapshot.complete(null)
        if (end.status !== 3) {
          this.resumeWithoutSnapshot()
        }
      } else if (end.status !== 3) {
        // Why: the host rebases failed snapshots to this live-tail boundary.
        // Matching it keeps initial subscribe usable even without scrollback.
        this.resumeWithoutSnapshot(end.coverageEndSeq)
        if (end.snapshotId === this.initialSnapshotId) {
          this.options.callbacks.onSubscribed?.()
        }
      }
      if (end.status === 2) {
        reportTerminalDeliveryFailure(this.options.callbacks, 'snapshot-too-large')
      } else if (end.status === 1) {
        reportTerminalDeliveryFailure(this.options.callbacks, 'snapshot-unavailable')
      }
      return
    }
    const result = this.snapshot.end(frame)
    if (!result) {
      this.recover('invalid snapshot')
      return
    }
    if (this.manualSnapshot.matches(result.id)) {
      this.manualSnapshot.complete(result)
      this.ackManualSnapshot(result)
      return
    }
    publishRemoteTerminalSnapshot(
      result,
      this.options.callbacks,
      once(() => this.ackSnapshot(result))
    )
  }

  private ackSnapshot(snapshot: RemoteTerminalSnapshot): void {
    this.acks.rebase(snapshot.coverageEndSeq)
    this.outputTextDecoder.reset()
    this.expectedSequence = snapshot.coverageEndSeq
    sendRemoteTerminalDeliveryAck(
      this.options.send,
      this.options.routeId,
      2,
      snapshot.id,
      snapshot.coverageEndSeq,
      0
    )
    this.dispatch({ type: 'client-resumed' })
    for (const output of this.pendingOutput.splice(0)) {
      if (
        output.endSeq > snapshot.pendingDeliveryStartSeq &&
        output.endSeq <= snapshot.coverageEndSeq
      ) {
        continue
      }
      if (output.endSeq <= snapshot.pendingDeliveryStartSeq) {
        this.recover('output predates snapshot delivery window')
        return
      }
      this.deliverOutput(output)
    }
    if (snapshot.id === this.initialSnapshotId) {
      this.options.callbacks.onSubscribed?.()
    }
  }

  private ackManualSnapshot(snapshot: RemoteTerminalSnapshot): void {
    sendRemoteTerminalDeliveryAck(
      this.options.send,
      this.options.routeId,
      2,
      snapshot.id,
      snapshot.coverageEndSeq,
      0
    )
    this.resumeWithoutSnapshot()
  }

  private resumeWithoutSnapshot(coverageEndSeq?: bigint): void {
    if (coverageEndSeq !== undefined) {
      this.acks.rebase(coverageEndSeq)
      this.outputTextDecoder.reset()
      this.expectedSequence = coverageEndSeq
    }
    this.dispatch({ type: 'client-resumed' })
    for (const output of this.pendingOutput.splice(0)) {
      this.deliverOutput(output)
    }
  }

  private get isSnapshotting(): boolean {
    return this.recovery.memory.clientSnapshotting
  }

  private dispatch(event: TerminalMultiplexRecoveryEvent): void {
    const transition = reduceRecovery(this.recovery, event)
    this.recovery = transition.state
    transition.effects.forEach((effect) =>
      executeRemoteTerminalRecoveryEffect(effect, this.snapshot, this.options, this.acks.parsedSeq)
    )
  }

  private recover(_reason: string): void {
    this.dispatch({ type: 'client-recovery-needed' })
  }
}

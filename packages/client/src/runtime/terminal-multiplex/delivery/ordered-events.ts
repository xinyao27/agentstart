import {
  TerminalMultiplexOpcode,
  type TerminalMultiplexFrame
} from '@yiru/protocol/terminal-multiplex/frame'
import { decodeTerminalMultiplexJson } from '@yiru/protocol/terminal-multiplex/json'
import { decodeTerminalMultiplexSideEffectBatch } from '@yiru/protocol/terminal-multiplex/side-effects'
import { translate } from '~renderer/i18n/i18n'

import type { RemoteRuntimeMultiplexedTerminalCallbacks } from '../types'

type PendingEvent = { seq: bigint; bytes: number; publish: () => void }

export class RemoteTerminalOrderedEvents {
  private readonly callbacks: RemoteRuntimeMultiplexedTerminalCallbacks
  private readonly pending: PendingEvent[] = []

  private releasedThrough = 0n
  private pendingBytes = 0
  private readonly onOverflow: () => void

  constructor(callbacks: RemoteRuntimeMultiplexedTerminalCallbacks, onOverflow: () => void) {
    this.callbacks = callbacks
    this.onOverflow = onOverflow
  }

  handle(frame: TerminalMultiplexFrame): boolean {
    if (frame.opcode === TerminalMultiplexOpcode.SideEffectBatch) {
      const batch = decodeTerminalMultiplexSideEffectBatch(frame.payload)
      if (!batch) {
        this.callbacks.onError?.(
          translate(
            'terminal.multiplex.invalidSideEffects',
            'Invalid remote terminal side-effect batch.'
          )
        )
        return true
      }
      this.enqueue({
        seq: frame.seq,
        bytes: frame.payload.byteLength,
        publish: () =>
          this.callbacks.onSideEffectBatch?.(batch, { seq: frame.seq, epoch: frame.epoch })
      })
      return true
    }
    if (frame.opcode === TerminalMultiplexOpcode.Metadata) {
      const metadata = decodeTerminalMultiplexJson(frame.payload)
      if (!metadata) {
        this.callbacks.onError?.(
          translate('terminal.multiplex.invalidMetadata', 'Invalid remote terminal metadata.')
        )
        return true
      }
      this.enqueue({
        seq: frame.seq,
        bytes: frame.payload.byteLength,
        publish: () => this.callbacks.onMetadata?.(metadata)
      })
      return true
    }
    if (frame.opcode === TerminalMultiplexOpcode.ClearBuffer) {
      const clear = decodeTerminalMultiplexJson(frame.payload)
      if (clear?.operation !== 'applied') {
        this.callbacks.onError?.(
          translate('terminal.multiplex.invalidClear', 'Invalid remote terminal clear record.')
        )
        return true
      }
      this.enqueue({
        seq: frame.seq,
        bytes: frame.payload.byteLength,
        publish: () => this.callbacks.onClearBuffer?.()
      })
      return true
    }
    return false
  }

  publishThrough(parsedSeq: bigint): void {
    this.releasedThrough = parsedSeq > this.releasedThrough ? parsedSeq : this.releasedThrough
    let index = 0
    while (this.pending[index] && this.pending[index]!.seq <= this.releasedThrough) {
      this.pendingBytes -= this.pending[index]!.bytes
      this.pending[index]!.publish()
      index += 1
    }
    if (index > 0) {
      this.pending.splice(0, index)
    }
  }

  clear(): void {
    this.pending.splice(0)
    this.pendingBytes = 0
    this.releasedThrough = 0n
  }
  private enqueue(event: PendingEvent): void {
    if (this.pending.length >= 256 || this.pendingBytes + event.bytes > 4 * 1024 * 1024) {
      this.clear()
      this.onOverflow()
      return
    }
    this.pending.push(event)
    this.pendingBytes += event.bytes
    this.publishThrough(this.releasedThrough)
  }
}

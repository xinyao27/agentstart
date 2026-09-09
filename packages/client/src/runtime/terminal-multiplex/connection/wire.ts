import {
  decodeTerminalMultiplexEpochRecord,
  decodeTerminalMultiplexHeartbeatRecord,
  encodeTerminalMultiplexEpochRecord,
  encodeTerminalMultiplexHeartbeatRecord
} from '@yiru/protocol/terminal-multiplex/connection-records'
import {
  decodeTerminalMultiplexFrame,
  encodeTerminalMultiplexFrame,
  TerminalMultiplexOpcode,
  type TerminalMultiplexFrame,
  type TerminalMultiplexOpcode as TerminalMultiplexOpcodeValue
} from '@yiru/protocol/terminal-multiplex/frame'

const HEARTBEAT_MS = 15_000
const HEARTBEAT_TIMEOUT_MS = HEARTBEAT_MS * 2

type RemoteTerminalMultiplexWireOptions = {
  sendBytes: (bytes: Uint8Array<ArrayBufferLike>) => boolean
  allocateCorrelationId: () => number
  onStreamFrame: (frame: TerminalMultiplexFrame) => void
  onAccepted: () => void
  onError: (error: Error) => void
}

export class RemoteTerminalMultiplexWire {
  private readonly options: RemoteTerminalMultiplexWireOptions
  private epoch = 0n
  private epochAccepted = false
  private lastAuthenticatedFrameAt = 0
  private readonly pendingHeartbeats = new Map<number, bigint>()
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null

  constructor(options: RemoteTerminalMultiplexWireOptions) {
    this.options = options
  }

  get accepted(): boolean {
    return this.epochAccepted
  }

  handle(bytes: Uint8Array<ArrayBufferLike>): void {
    const decoded = decodeTerminalMultiplexFrame(bytes)
    if (!decoded.ok) {
      this.options.onError(new Error(`Invalid terminal multiplex frame: ${decoded.error.code}`))
      return
    }
    this.lastAuthenticatedFrameAt = Date.now()
    const frame = decoded.frame
    if (frame.opcode === TerminalMultiplexOpcode.Epoch) {
      this.handleEpoch(frame)
      return
    }
    if (this.epoch === 0n || frame.epoch !== this.epoch) {
      this.options.onError(new Error('Remote terminal epoch mismatch.'))
      return
    }
    if (frame.opcode === TerminalMultiplexOpcode.Heartbeat) {
      this.handleHeartbeat(frame)
      return
    }
    this.options.onStreamFrame(frame)
  }

  send(
    opcode: TerminalMultiplexOpcodeValue,
    routeId: number,
    seq: bigint,
    correlationId: number,
    payload: Uint8Array<ArrayBufferLike> = new Uint8Array()
  ): boolean {
    if (this.epoch === 0n) {
      return false
    }
    try {
      return this.options.sendBytes(
        encodeTerminalMultiplexFrame({
          opcode,
          routeId,
          epoch: this.epoch,
          seq,
          correlationId,
          payload
        })
      )
    } catch {
      return false
    }
  }

  reset(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
    }
    this.heartbeatTimer = null
    this.epoch = 0n
    this.epochAccepted = false
    this.lastAuthenticatedFrameAt = 0
    this.pendingHeartbeats.clear()
  }

  private handleEpoch(frame: TerminalMultiplexFrame): void {
    const record = decodeTerminalMultiplexEpochRecord(frame.payload)
    if (!record || record.phase !== 0 || frame.epoch === 0n || this.epoch !== 0n) {
      this.options.onError(new Error('Remote terminal epoch offer is invalid.'))
      return
    }
    this.epoch = frame.epoch
    this.send(
      TerminalMultiplexOpcode.Epoch,
      0,
      0n,
      0,
      encodeTerminalMultiplexEpochRecord({ ...record, phase: 1 })
    )
    this.epochAccepted = true
    this.sendHeartbeat(0, this.options.allocateCorrelationId(), monotonicMicros())
    this.heartbeatTimer = setInterval(() => this.heartbeatTick(), HEARTBEAT_MS)
    this.options.onAccepted()
  }

  private handleHeartbeat(frame: TerminalMultiplexFrame): void {
    const record = decodeTerminalMultiplexHeartbeatRecord(frame.payload)
    if (!record || frame.routeId !== 0 || frame.seq !== 0n || frame.correlationId === 0) {
      this.options.onError(new Error('Remote terminal heartbeat is invalid.'))
      return
    }
    if (record.phase === 0) {
      this.sendHeartbeat(1, frame.correlationId, record.monotonicMicros)
    } else if (this.pendingHeartbeats.get(frame.correlationId) !== record.monotonicMicros) {
      this.options.onError(new Error('Remote terminal heartbeat pong is invalid.'))
    } else {
      this.pendingHeartbeats.delete(frame.correlationId)
    }
  }

  private heartbeatTick(): void {
    const idleMs = Date.now() - this.lastAuthenticatedFrameAt
    if (idleMs >= HEARTBEAT_TIMEOUT_MS) {
      this.options.onError(new Error('Remote terminal heartbeat timed out.'))
      return
    }
    if (idleMs >= HEARTBEAT_MS) {
      this.sendHeartbeat(0, this.options.allocateCorrelationId(), monotonicMicros())
    }
  }

  private sendHeartbeat(phase: 0 | 1, correlationId: number, micros: bigint): void {
    if (phase === 0) {
      this.pendingHeartbeats.set(correlationId, micros)
    }
    this.send(
      TerminalMultiplexOpcode.Heartbeat,
      0,
      0n,
      correlationId,
      encodeTerminalMultiplexHeartbeatRecord({
        phase,
        appState: document.hidden ? 1 : 0,
        senderQueueBytes: 0,
        monotonicMicros: micros
      })
    )
  }
}

function monotonicMicros(): bigint {
  return BigInt(Math.floor(performance.now() * 1_000))
}

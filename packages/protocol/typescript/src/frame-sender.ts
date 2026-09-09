import { create } from '@bufbuild/protobuf'

import { StatusCode, StatusSchema } from '../generated/yiru/protocol/v1/errors_pb.js'
import {
  CallDestinationSchema,
  CallEndSchema,
  CallStartSchema,
  CancelSchema,
  FrameSchema,
  HelloSchema,
  PayloadSchema,
  PingSchema,
  PongSchema,
  RuntimeEnvironmentDestinationSchema,
  WindowUpdateSchema
} from '../generated/yiru/protocol/v1/frame_pb.js'
import type { Frame, Welcome } from '../generated/yiru/protocol/v1/frame_pb.js'
import type { CallLifecycle } from './call-state.js'
import { RuntimeProtocolError } from './error.js'
import { encodeProtocolFrame } from './frame-codec.js'
import {
  INITIAL_CALL_CREDIT_BYTES,
  MAX_FRAME_BYTES,
  MAX_PENDING_SEND_BATCHES,
  MAX_PENDING_SEND_BYTES,
  PROTOCOL_VERSION,
  resolvePeerKind,
  resolveTransportFeatures
} from './peer-values.js'
import type { RuntimeCall, RuntimeFrameSender, RuntimePeerInfo } from './transport.js'

type FrameBody = Exclude<Frame['body'], { case: undefined }>

const MIN_KEEP_ALIVE_INTERVAL_MS = 1000
const MAX_TIMER_MS = 0x7fff_ffff
const MAX_SEQUENCE = 0xffff_ffff_ffff_ffffn

export class ProtocolSender {
  private readonly abort = new AbortController()
  private initialCallCreditBytes = 0n
  private isClosed = false
  private keepAliveIntervalMs = 0
  private keepAliveNonce = 0n
  private keepAliveTimer: ReturnType<typeof setTimeout> | null = null
  private maxFrameBytes = MAX_FRAME_BYTES
  private readonly onFailure: (error: unknown) => void
  private pendingBatchCount = 0
  private pendingBytes = 0
  private pendingPongNonce: bigint | null = null
  private pongTimer: ReturnType<typeof setTimeout> | null = null
  private readonly sendBytes: RuntimeFrameSender
  private sequence = 0n
  private tail = Promise.resolve()

  constructor(sendBytes: RuntimeFrameSender, onFailure: (error: unknown) => void) {
    this.onFailure = onFailure
    this.sendBytes = sendBytes
  }

  close(): void {
    if (this.isClosed) {
      return
    }
    this.isClosed = true
    this.abort.abort(new RuntimeProtocolError(StatusCode.UNAVAILABLE, 'Runtime connection closed'))
    if (this.keepAliveTimer) {
      clearTimeout(this.keepAliveTimer)
    }
    if (this.pongTimer) {
      clearTimeout(this.pongTimer)
    }
    this.keepAliveTimer = null
    this.pongTimer = null
    this.pendingPongNonce = null
  }

  configure(welcome: Welcome): void {
    this.initialCallCreditBytes = welcome.initialCallCreditBytes
    this.maxFrameBytes = Math.min(welcome.maxFrameBytes, MAX_FRAME_BYTES)
  }

  hello(info: RuntimePeerInfo, signal: AbortSignal): Promise<void> {
    return this.send(
      {
        case: 'hello',
        value: create(HelloSchema, {
          supportedProtocolVersions: [PROTOCOL_VERSION],
          peerKind: resolvePeerKind(info.kind),
          peerName: info.name,
          peerVersion: info.version,
          peerInstanceId: info.instanceId,
          maxFrameBytes: MAX_FRAME_BYTES,
          initialCallCreditBytes: BigInt(INITIAL_CALL_CREDIT_BYTES),
          supportedTransportFeatures: [...resolveTransportFeatures(info)]
        })
      },
      signal
    )
  }

  async start(
    callId: bigint,
    call: RuntimeCall,
    lifecycle: CallLifecycle,
    duplex = false
  ): Promise<void> {
    if (BigInt(call.payload.byteLength) > this.initialCallCreditBytes) {
      throw new RuntimeProtocolError(
        StatusCode.RESOURCE_EXHAUSTED,
        'Runtime request exceeds daemon call credit'
      )
    }
    const bodies: readonly FrameBody[] = [
      {
        case: 'callStart',
        value: create(CallStartSchema, {
          callId,
          procedure: call.method,
          timeoutMs: lifecycle.timeoutMs,
          destination: call.options?.destination
            ? create(CallDestinationSchema, {
                target: {
                  case: 'runtimeEnvironment',
                  value: create(RuntimeEnvironmentDestinationSchema, {
                    environmentId: call.options.destination.environmentId
                  })
                }
              })
            : undefined
        })
      },
      {
        case: 'payload',
        value: create(PayloadSchema, { callId, data: call.payload })
      },
      {
        case: 'callEnd',
        value: create(CallEndSchema, { callId, status: create(StatusSchema) })
      }
    ]
    await this.sendBatch(duplex ? bodies.slice(0, -1) : bodies, lifecycle.abort.signal)
  }

  cancel(callId: bigint, reason: string, code: StatusCode): Promise<void> {
    return this.send({
      case: 'cancel',
      value: create(CancelSchema, {
        callId,
        status: create(StatusSchema, { code, message: reason })
      })
    })
  }

  end(callId: bigint, status?: Readonly<{ code: StatusCode; message: string }>): Promise<void> {
    return this.send({
      case: 'callEnd',
      value: create(CallEndSchema, { callId, status: create(StatusSchema, status) })
    })
  }

  payload(callId: bigint, data: Uint8Array, signal: AbortSignal): Promise<void> {
    return this.send({ case: 'payload', value: create(PayloadSchema, { callId, data }) }, signal)
  }

  restoreCredit(callId: bigint, byteLength: number): Promise<void> {
    return this.send({
      case: 'windowUpdate',
      value: create(WindowUpdateSchema, { callId, creditBytes: BigInt(byteLength) })
    })
  }

  ping(nonce: bigint): Promise<void> {
    return this.send({ case: 'ping', value: create(PingSchema, { nonce }) })
  }

  keepAlive(intervalMs: number): void {
    if (intervalMs === 0 || this.isClosed) {
      return
    }
    this.keepAliveIntervalMs = Math.min(
      Math.max(intervalMs, MIN_KEEP_ALIVE_INTERVAL_MS),
      MAX_TIMER_MS
    )
    this.schedulePing()
  }

  acceptPong(nonce: bigint): void {
    if (this.pendingPongNonce !== nonce) {
      throw new RuntimeProtocolError(StatusCode.INTERNAL, 'Runtime daemon sent an unexpected Pong')
    }
    this.pendingPongNonce = null
    if (this.pongTimer) {
      clearTimeout(this.pongTimer)
    }
    this.pongTimer = null
    this.schedulePing()
  }

  pong(nonce: bigint): Promise<void> {
    return this.send({ case: 'pong', value: create(PongSchema, { nonce }) })
  }

  private send(body: FrameBody, signal?: AbortSignal): Promise<void> {
    return this.sendBatch([body], signal)
  }

  private async sendBatch(bodies: readonly FrameBody[], signal?: AbortSignal): Promise<void> {
    const byteLength = this.measureBatch(bodies)
    if (
      this.pendingBatchCount >= MAX_PENDING_SEND_BATCHES ||
      byteLength > MAX_PENDING_SEND_BYTES - this.pendingBytes
    ) {
      throw new RuntimeProtocolError(
        StatusCode.RESOURCE_EXHAUSTED,
        'Runtime protocol send queue budget exceeded'
      )
    }
    this.pendingBatchCount += 1
    this.pendingBytes += byteLength
    const scheduled = this.tail.then(async () => {
      try {
        await this.transmitBatch(bodies, signal)
      } finally {
        this.pendingBatchCount -= 1
        this.pendingBytes -= byteLength
      }
    })
    this.tail = scheduled.catch((error: unknown) => {
      if (!signal?.aborted && !this.abort.signal.aborted) {
        this.onFailure(error)
      }
    })
    await scheduled
  }

  private measureBatch(bodies: readonly FrameBody[]): number {
    let byteLength = 0
    for (const body of bodies) {
      const bytes = encodeProtocolFrame(
        create(FrameSchema, {
          protocolVersion: PROTOCOL_VERSION,
          sequence: MAX_SEQUENCE,
          body
        })
      )
      if (bytes.byteLength > this.maxFrameBytes) {
        throw new RuntimeProtocolError(
          StatusCode.RESOURCE_EXHAUSTED,
          'Runtime protocol frame exceeds the negotiated limit'
        )
      }
      byteLength += bytes.byteLength
    }
    return byteLength
  }

  private async transmitBatch(bodies: readonly FrameBody[], signal?: AbortSignal): Promise<void> {
    if (this.isClosed) {
      throw new RuntimeProtocolError(StatusCode.UNAVAILABLE, 'Runtime connection closed')
    }
    const sendSignal = signal ? AbortSignal.any([signal, this.abort.signal]) : this.abort.signal
    sendSignal.throwIfAborted()
    let sequence = this.sequence
    const frames = bodies.map((body) => {
      if (sequence === MAX_SEQUENCE) {
        throw new RuntimeProtocolError(
          StatusCode.RESOURCE_EXHAUSTED,
          'Runtime protocol sequence is exhausted'
        )
      }
      sequence += 1n
      const bytes = encodeProtocolFrame(
        create(FrameSchema, { protocolVersion: PROTOCOL_VERSION, sequence, body })
      )
      if (bytes.byteLength > this.maxFrameBytes) {
        throw new RuntimeProtocolError(
          StatusCode.RESOURCE_EXHAUSTED,
          'Runtime protocol frame exceeds the negotiated limit'
        )
      }
      return { bytes, sequence }
    })
    for (const frame of frames) {
      sendSignal.throwIfAborted()
      await this.sendBytes(frame.bytes, sendSignal)
      this.sequence = frame.sequence
    }
  }

  private schedulePing(): void {
    if (this.isClosed || this.keepAliveIntervalMs === 0) {
      return
    }
    this.keepAliveTimer = setTimeout(() => this.sendPing(), this.keepAliveIntervalMs)
  }

  private sendPing(): void {
    this.keepAliveTimer = null
    this.keepAliveNonce += 1n
    const nonce = this.keepAliveNonce
    void this.ping(nonce)
      .then(() => {
        if (this.isClosed) {
          return
        }
        this.pendingPongNonce = nonce
        this.pongTimer = setTimeout(() => {
          if (this.pendingPongNonce === nonce) {
            this.onFailure(
              new RuntimeProtocolError(StatusCode.DEADLINE_EXCEEDED, 'Runtime keepalive timed out')
            )
          }
        }, this.keepAliveIntervalMs)
      })
      .catch(() => {})
  }
}

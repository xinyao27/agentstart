import { StatusCode, type Status } from '../generated/yiru/protocol/v1/errors_pb.js'
import { TransportFeature } from '../generated/yiru/protocol/v1/frame_pb.js'
import type { CallStart, Welcome } from '../generated/yiru/protocol/v1/frame_pb.js'
import { RuntimeProtocolError } from './error.js'
import type { EncodedRuntimeHandler, RuntimeHandlerRegistry } from './handler.js'
import { INITIAL_CALL_CREDIT_BYTES, MAX_PENDING_REQUEST_BYTES } from './peer-values.js'

const MAX_ACTIVE_REVERSE_CALLS = 128

type IncomingCall = {
  abort: AbortController
  creditWaiter: CreditWaiter | undefined
  failure: RuntimeProtocolError | undefined
  handler: EncodedRuntimeHandler | undefined
  incomingCreditBytes: number
  outgoingCreditBytes: number
  request: Uint8Array | undefined
  timeout: ReturnType<typeof setTimeout> | undefined
  timeoutMs: number
}

type CreditWaiter = Readonly<{
  byteLength: number
  reject: (reason?: unknown) => void
  resolve: () => void
}>

export type IncomingCallSender = Readonly<{
  end: (callId: bigint, status?: Pick<Status, 'code' | 'message'>) => Promise<void>
  payload: (callId: bigint, data: Uint8Array, signal: AbortSignal) => Promise<void>
  restoreCredit: (callId: bigint, byteLength: number) => Promise<void>
}>

export class IncomingCalls {
  private readonly calls = new Map<bigint, IncomingCall>()
  private initialOutgoingCreditBytes = 0
  private lastCallId = 0n
  private requestBytes = 0
  private readonly handlers: RuntimeHandlerRegistry
  private readonly sender: IncomingCallSender

  constructor(handlers: RuntimeHandlerRegistry, sender: IncomingCallSender) {
    this.handlers = handlers
    this.sender = sender
  }

  configure(initialOutgoingCreditBytes: bigint): void {
    const credit = Number(initialOutgoingCreditBytes)
    if (!Number.isSafeInteger(credit) || credit <= 0) {
      throw new RuntimeProtocolError(StatusCode.INTERNAL, 'Reverse call credit is invalid')
    }
    this.initialOutgoingCreditBytes = credit
  }

  start(start: CallStart, welcome: Welcome | null | undefined): void {
    if (!welcome?.enabledTransportFeatures.includes(TransportFeature.REVERSE_CALLS)) {
      throw new RuntimeProtocolError(
        StatusCode.FAILED_PRECONDITION,
        'Runtime sent a reverse call without negotiation'
      )
    }
    if (start.callId === 0n || start.callId % 2n !== 0n || start.callId <= this.lastCallId) {
      throw new RuntimeProtocolError(StatusCode.INTERNAL, 'Daemon sent an invalid reverse call ID')
    }
    if (this.calls.size >= MAX_ACTIVE_REVERSE_CALLS) {
      throw new RuntimeProtocolError(
        StatusCode.RESOURCE_EXHAUSTED,
        'Runtime protocol has too many reverse calls'
      )
    }
    if (start.destination) {
      throw new RuntimeProtocolError(
        StatusCode.INVALID_ARGUMENT,
        'Reverse calls cannot have a runtime destination'
      )
    }
    this.lastCallId = start.callId
    const abort = new AbortController()
    const call: IncomingCall = {
      abort,
      creditWaiter: undefined,
      failure: undefined,
      handler: this.handlers.get(start.procedure),
      incomingCreditBytes: INITIAL_CALL_CREDIT_BYTES,
      outgoingCreditBytes: this.initialOutgoingCreditBytes,
      request: undefined,
      timeout: undefined,
      timeoutMs: start.timeoutMs
    }
    if (start.timeoutMs > 0) {
      call.timeout = setTimeout(() => {
        this.fail(
          start.callId,
          new RuntimeProtocolError(StatusCode.DEADLINE_EXCEEDED, 'Reverse call deadline exceeded')
        )
      }, start.timeoutMs)
    }
    this.calls.set(start.callId, call)
  }

  payload(callId: bigint, data: Uint8Array): void {
    const call = this.required(callId, 'Payload')
    if (call.failure) {
      return
    }
    if (call.request) {
      throw new RuntimeProtocolError(StatusCode.INTERNAL, 'Reverse unary request has two payloads')
    }
    if (data.byteLength > call.incomingCreditBytes) {
      throw new RuntimeProtocolError(StatusCode.RESOURCE_EXHAUSTED, 'Daemon exceeded call credit')
    }
    if (data.byteLength > MAX_PENDING_REQUEST_BYTES - this.requestBytes) {
      call.failure = new RuntimeProtocolError(
        StatusCode.RESOURCE_EXHAUSTED,
        'Reverse request buffer budget exceeded'
      )
      return
    }
    call.request = data
    call.incomingCreditBytes -= data.byteLength
    this.requestBytes += data.byteLength
  }

  endRequest(callId: bigint, status?: Pick<Status, 'code' | 'message'>): void {
    const call = this.required(callId, 'CallEnd')
    if (status && status.code !== StatusCode.OK_UNSPECIFIED) {
      this.remove(callId, call)
      return
    }
    if (call.failure) {
      this.fail(callId, call.failure)
      return
    }
    if (!call.request) {
      this.fail(callId, new RuntimeProtocolError(StatusCode.INVALID_ARGUMENT, 'Request is missing'))
      return
    }
    const request = call.request
    call.request = undefined
    this.requestBytes -= request.byteLength
    void this.sender.restoreCredit(callId, request.byteLength).catch(() => {})
    if (!call.handler) {
      this.fail(
        callId,
        new RuntimeProtocolError(StatusCode.UNIMPLEMENTED, 'Reverse procedure is not registered')
      )
      return
    }
    void this.invoke(callId, call, request)
  }

  cancel(callId: bigint, status?: Pick<Status, 'code' | 'message'>): void {
    const call = this.calls.get(callId)
    if (!call) {
      if (this.isRetired(callId)) {
        return
      }
      throw new RuntimeProtocolError(
        StatusCode.INTERNAL,
        'Cancel addressed an unknown reverse call'
      )
    }
    const error = new RuntimeProtocolError(
      status?.code === StatusCode.DEADLINE_EXCEEDED
        ? StatusCode.DEADLINE_EXCEEDED
        : StatusCode.CANCELLED,
      status?.message || 'Reverse call cancelled'
    )
    call.abort.abort(error)
    this.remove(callId, call)
    void this.sender.end(callId, error).catch(() => {})
  }

  addCredit(callId: bigint, creditBytes: bigint): void {
    if (creditBytes === 0n) {
      throw new RuntimeProtocolError(StatusCode.INVALID_ARGUMENT, 'WindowUpdate has no credit')
    }
    const call = this.calls.get(callId)
    if (!call) {
      if (this.isRetired(callId)) {
        return
      }
      throw new RuntimeProtocolError(
        StatusCode.INTERNAL,
        'WindowUpdate addressed an unknown reverse call'
      )
    }
    const credit = Number(creditBytes)
    if (
      !Number.isSafeInteger(credit) ||
      credit > this.initialOutgoingCreditBytes - call.outgoingCreditBytes
    ) {
      throw new RuntimeProtocolError(StatusCode.INVALID_ARGUMENT, 'WindowUpdate credit is invalid')
    }
    call.outgoingCreditBytes += credit
    const waiter = call.creditWaiter
    if (waiter && waiter.byteLength <= call.outgoingCreditBytes) {
      call.creditWaiter = undefined
      call.outgoingCreditBytes -= waiter.byteLength
      waiter.resolve()
    }
  }

  close(error: unknown): void {
    for (const [callId, call] of this.calls) {
      call.abort.abort(error)
      this.remove(callId, call)
    }
  }

  private async invoke(callId: bigint, call: IncomingCall, request: Uint8Array): Promise<void> {
    const handler = call.handler
    if (!handler) {
      return
    }
    try {
      const context = { signal: call.abort.signal, timeoutMs: call.timeoutMs }
      if (handler.kind === 'unary') {
        await this.sendPayload(callId, call, await handler.invoke(request, context))
      } else {
        for await (const payload of handler.invoke(request, context)) {
          call.abort.signal.throwIfAborted()
          await this.sendPayload(callId, call, payload)
        }
      }
      if (this.calls.get(callId) === call) {
        this.remove(callId, call)
        await this.sender.end(callId)
      }
    } catch (error) {
      if (this.calls.get(callId) === call) {
        this.fail(callId, normalizeError(error))
      }
    }
  }

  private fail(callId: bigint, error: RuntimeProtocolError): void {
    const call = this.calls.get(callId)
    if (!call) {
      return
    }
    call.abort.abort(error)
    this.remove(callId, call)
    void this.sender.end(callId, error).catch(() => {})
  }

  private isRetired(callId: bigint): boolean {
    return callId > 0n && callId % 2n === 0n && callId <= this.lastCallId
  }

  private remove(callId: bigint, call: IncomingCall): void {
    this.calls.delete(callId)
    if (call.timeout) {
      clearTimeout(call.timeout)
    }
    if (call.request) {
      this.requestBytes -= call.request.byteLength
      call.request = undefined
    }
    call.creditWaiter?.reject(call.abort.signal.reason)
    call.creditWaiter = undefined
  }

  private async sendPayload(
    callId: bigint,
    call: IncomingCall,
    payload: Uint8Array
  ): Promise<void> {
    await this.reserveCredit(call, payload.byteLength)
    await this.sender.payload(callId, payload, call.abort.signal)
  }

  private reserveCredit(call: IncomingCall, byteLength: number): Promise<void> {
    if (byteLength <= call.outgoingCreditBytes) {
      call.outgoingCreditBytes -= byteLength
      return Promise.resolve()
    }
    if (byteLength > this.initialOutgoingCreditBytes || call.creditWaiter) {
      return Promise.reject(
        new RuntimeProtocolError(
          StatusCode.RESOURCE_EXHAUSTED,
          'Reverse response exceeds its flow-control allowance'
        )
      )
    }
    return new Promise((resolve, reject) => {
      call.creditWaiter = { byteLength, reject, resolve }
      call.abort.signal.addEventListener('abort', () => reject(call.abort.signal.reason), {
        once: true
      })
    })
  }

  private required(callId: bigint, frame: string): IncomingCall {
    const call = this.calls.get(callId)
    if (!call) {
      throw new RuntimeProtocolError(
        StatusCode.INTERNAL,
        `${frame} addressed an unknown reverse call`
      )
    }
    return call
  }
}

function normalizeError(error: unknown): RuntimeProtocolError {
  return error instanceof RuntimeProtocolError
    ? error
    : new RuntimeProtocolError(
        StatusCode.INTERNAL,
        error instanceof Error ? error.message : 'Reverse handler failed'
      )
}

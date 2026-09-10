import { StatusCode } from '../generated/agent_start/protocol/v1/errors_pb.js'
import type { Status } from '../generated/agent_start/protocol/v1/errors_pb.js'
import type { Frame, Welcome } from '../generated/agent_start/protocol/v1/frame_pb.js'
import { ensureCallDestination } from './call-destination.js'
import { ClientCallIdSequence } from './call-id-sequence.js'
import type { CallLifecycle } from './call-state.js'
import { completePendingCall, createCallLifecycle, failPendingCall } from './call-state.js'
import { DuplexRequests } from './duplex-requests.js'
import { RuntimeProtocolError } from './error.js'
import { ProtocolReceiver } from './frame-receiver.js'
import { ProtocolSender } from './frame-sender.js'
import { RuntimeHandlerRegistry } from './handler.js'
import { ProtocolHandshake } from './handshake.js'
import { IncomingCalls } from './incoming-calls.js'
import { createIncomingFrameHandler } from './incoming-frame.js'
import { acceptCallPayload } from './incoming-payload.js'
import { LocallyCancelledCalls } from './locally-cancelled-calls.js'
import {
  DEFAULT_TIMEOUT_MS,
  ensureCallAdmission,
  INITIAL_CALL_CREDIT_BYTES,
  MAX_LOCALLY_CANCELLED_CALLS,
  statusError
} from './peer-values.js'
import { PendingCalls } from './pending-calls.js'
import { openRuntimeStream } from './stream-calls.js'
import type {
  RuntimeCall,
  RuntimeDuplex,
  RuntimeFrameSender,
  RuntimePeerInfo,
  RuntimeStream,
  RuntimeTransport
} from './transport.js'

export class RuntimePeer implements RuntimeTransport {
  private readonly callIds = new ClientCallIdSequence()
  private readonly duplexRequests = new DuplexRequests()
  readonly handlers = new RuntimeHandlerRegistry()
  private readonly handshake = new ProtocolHandshake()
  private readonly handleFrame: (frame: Frame) => void
  private readonly incoming: IncomingCalls
  private isClosed = false
  private readonly locallyCancelledCalls = new LocallyCancelledCalls(MAX_LOCALLY_CANCELLED_CALLS)
  private readonly onTerminate: ((error: unknown) => void) | undefined
  private readonly pending = new PendingCalls()
  private readonly receiver = new ProtocolReceiver()
  private readonly sender: ProtocolSender

  constructor(sendBytes: RuntimeFrameSender, onTerminate?: (error: unknown) => void) {
    this.onTerminate = onTerminate
    this.sender = new ProtocolSender(sendBytes, (error) => this.terminate(error))
    this.incoming = new IncomingCalls(this.handlers, {
      end: (callId, status) => this.sender.end(callId, status),
      payload: (callId, data, signal) => this.sender.payload(callId, data, signal),
      restoreCredit: (callId, byteLength) => this.sender.restoreCredit(callId, byteLength)
    })
    this.handleFrame = createIncomingFrameHandler({
      acceptCallStart: (start) => this.incoming.start(start, this.handshake.accepted),
      acceptPong: (nonce) => this.sender.acceptPong(nonce),
      acceptPayload: (callId, data) => this.acceptPayload(callId, data),
      acceptWelcome: (welcome) => {
        this.handshake.accept(welcome, this.receiver, this.sender)
        this.incoming.configure(welcome.initialCallCreditBytes)
      },
      finishCall: (callId, status) => this.finishCall(callId, status),
      finishCancelled: (callId, status) => this.finishCancelled(callId, status),
      isReady: () => Boolean(this.handshake.accepted),
      pong: (nonce) => this.sender.pong(nonce),
      terminate: (error) => this.terminate(error),
      updateCredit: (callId, creditBytes) => {
        if (callId % 2n === 0n) {
          this.incoming.addCredit(callId, creditBytes)
        } else if (
          !this.duplexRequests.update(callId, creditBytes) &&
          !this.callIds.isRetired(callId)
        ) {
          throw new RuntimeProtocolError(
            StatusCode.INTERNAL,
            'Credit addressed an unknown duplex request'
          )
        }
      }
    })
  }

  async hello(info: RuntimePeerInfo, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Welcome> {
    if (this.isClosed) {
      throw new RuntimeProtocolError(StatusCode.UNAVAILABLE, 'Runtime connection closed')
    }
    return this.handshake.open(info, this.sender, (error) => this.terminate(error), timeoutMs)
  }

  receive(bytes: Uint8Array): boolean {
    return this.receiver.dispatch(bytes, this.handleFrame, this.isClosed, (error) =>
      this.terminate(error)
    )
  }

  close(
    error: unknown = new RuntimeProtocolError(StatusCode.UNAVAILABLE, 'Runtime connection closed')
  ): void {
    this.terminate(error, false)
  }

  async unary(call: RuntimeCall): Promise<Uint8Array> {
    ensureCallDestination(call, this.handshake.accepted)
    ensureCallAdmission(this.isClosed, Boolean(this.handshake.accepted), this.pending.size)
    const callId = this.callIds.allocate()
    const lifecycle = this.lifecycle(callId, call, DEFAULT_TIMEOUT_MS)
    try {
      this.pending.reserveRequestBytes(call.payload.byteLength)
    } catch (error) {
      lifecycle.cleanup()
      lifecycle.abort.abort(error)
      throw error
    }
    return new Promise((resolve, reject) => {
      this.pending.add(callId, {
        abort: lifecycle.abort,
        kind: 'unary',
        resolve,
        reject,
        payloads: [],
        cleanup: lifecycle.cleanup,
        bufferedResponseBytes: 0,
        incomingCreditBytes: INITIAL_CALL_CREDIT_BYTES,
        requestBytes: call.payload.byteLength
      })
      if (call.options?.signal?.aborted) {
        this.finishFailed(callId, call.options.signal.reason)
        return
      }
      void this.sender.start(callId, call, lifecycle).catch((error: unknown) => {
        this.finishFailed(callId, error)
      })
    })
  }

  subscribe(call: RuntimeCall): Promise<RuntimeStream> {
    return this.openStream(call, false)
  }

  async duplex(call: RuntimeCall): Promise<RuntimeDuplex> {
    return this.openStream(call, true)
  }

  private openStream(call: RuntimeCall, duplex: true): Promise<RuntimeDuplex>
  private openStream(call: RuntimeCall, duplex: false): Promise<RuntimeStream>
  private openStream(call: RuntimeCall, duplex: boolean): Promise<RuntimeStream | RuntimeDuplex> {
    ensureCallDestination(call, this.handshake.accepted)
    ensureCallAdmission(this.isClosed, Boolean(this.handshake.accepted), this.pending.size)
    const callId = this.callIds.allocate()
    const context = {
      welcome: this.handshake.accepted,
      callId,
      lifecycle: this.lifecycle(callId, call),
      pending: this.pending,
      duplexRequests: this.duplexRequests,
      sender: this.sender,
      cancel: (reason?: string) => this.cancel(callId, reason),
      restoreCredit: (bytes: number) => this.restoreCredit(callId, bytes),
      finishFailed: (error: unknown) => this.finishFailed(callId, error)
    }
    return duplex ? openRuntimeStream(call, true, context) : openRuntimeStream(call, false, context)
  }

  private acceptPayload(callId: bigint, data: Uint8Array): void {
    if (callId % 2n === 0n) {
      this.incoming.payload(callId, data)
      return
    }
    const rejection = acceptCallPayload(
      this.callIds,
      this.locallyCancelledCalls,
      this.pending,
      callId,
      data
    )
    if (rejection) {
      void this.cancel(callId, rejection.reason, rejection.code).catch(() => {})
    }
  }

  private finishCall(callId: bigint, status?: Pick<Status, 'code' | 'message'>): void {
    this.duplexRequests.close(callId)
    if (callId % 2n === 0n) {
      this.incoming.endRequest(callId, status)
      return
    }
    const pending = this.pending.get(callId)
    if (!pending) {
      if (this.locallyCancelledCalls.delete(callId)) {
        return
      }
      if (this.callIds.isRetired(callId)) {
        return
      }
      throw new RuntimeProtocolError(StatusCode.INTERNAL, 'CallEnd addressed an unknown call')
    }
    if (pending.kind === 'stream' && !statusError(status)) {
      if (!this.pending.markStreamEnded(pending)) {
        throw new RuntimeProtocolError(StatusCode.INTERNAL, 'Stream received duplicate CallEnd')
      }
      pending.stream.end()
      if (pending.bufferedResponseBytes === 0) {
        this.pending.take(callId)
      }
      return
    }
    this.pending.take(callId)
    completePendingCall(pending, status)
  }

  private finishCancelled(callId: bigint, status?: Pick<Status, 'code' | 'message'>): void {
    if (callId % 2n === 0n) {
      this.incoming.cancel(callId, status)
      return
    }
    const pending = this.pending.take(callId)
    if (!pending) {
      if (this.locallyCancelledCalls.delete(callId)) {
        return
      }
      if (this.callIds.isRetired(callId)) {
        return
      }
      throw new RuntimeProtocolError(StatusCode.INTERNAL, 'Cancel addressed an unknown call')
    }
    failPendingCall(
      pending,
      statusError(status) ??
        new RuntimeProtocolError(StatusCode.CANCELLED, 'Runtime call cancelled')
    )
  }

  private finishFailed(callId: bigint, error: unknown): void {
    const pending = this.pending.take(callId)
    if (pending) {
      failPendingCall(pending, error)
    }
  }

  private lifecycle(callId: bigint, call: RuntimeCall, fallbackMs?: number): CallLifecycle {
    return createCallLifecycle(call, fallbackMs, (code, message) => {
      void this.cancel(callId, message, code).catch(() => {})
    })
  }

  private async cancel(
    callId: bigint,
    reason?: string,
    code = StatusCode.CANCELLED
  ): Promise<void> {
    const error = new RuntimeProtocolError(code, reason ?? 'Runtime call cancelled')
    const pending = this.pending.take(callId)
    if (!pending) {
      return
    }
    this.locallyCancelledCalls.insert(callId)
    failPendingCall(pending, error)
    await this.sender.cancel(callId, reason ?? '', code)
  }

  private async restoreCredit(callId: bigint, byteLength: number): Promise<void> {
    const pending = this.pending.get(callId)
    if (!pending || byteLength === 0) {
      return
    }
    if (!this.pending.restoreResponseBytes(pending, byteLength)) {
      this.terminate(
        new RuntimeProtocolError(StatusCode.INTERNAL, 'Runtime response accounting is invalid')
      )
      return
    }
    if (pending.kind === 'stream' && pending.isRemoteEnded) {
      if (pending.bufferedResponseBytes === 0) {
        this.pending.take(callId)
      }
      return
    }
    pending.incomingCreditBytes = Math.min(
      INITIAL_CALL_CREDIT_BYTES,
      pending.incomingCreditBytes + byteLength
    )
    await this.sender.restoreCredit(callId, byteLength)
  }

  private terminate(error: unknown, shouldNotify = true): void {
    if (this.isClosed) {
      return
    }
    this.isClosed = true
    this.sender.close()
    this.handshake.fail(error)
    this.incoming.close(error)
    for (const callId of this.pending.keys()) {
      this.finishFailed(callId, error)
    }
    if (shouldNotify) {
      this.onTerminate?.(error)
    }
  }
}

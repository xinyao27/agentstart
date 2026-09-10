import { StatusCode } from '../generated/agent_start/protocol/v1/errors_pb.js'
import type { PendingCall } from './call-state.js'
import { RuntimeProtocolError } from './error.js'
import { MAX_PENDING_RESPONSE_BYTES, MAX_PENDING_REQUEST_BYTES } from './peer-values.js'

export class PendingCalls {
  private readonly calls = new Map<bigint, PendingCall>()
  private responseBytes = 0
  private requestBytes = 0

  get size(): number {
    return this.calls.size
  }

  add(callId: bigint, pending: PendingCall): void {
    this.calls.set(callId, pending)
  }

  get(callId: bigint): PendingCall | undefined {
    return this.calls.get(callId)
  }

  keys(): MapIterator<bigint> {
    return this.calls.keys()
  }

  reserveRequestBytes(byteLength: number): void {
    if (byteLength > MAX_PENDING_REQUEST_BYTES - this.requestBytes) {
      throw new RuntimeProtocolError(
        StatusCode.RESOURCE_EXHAUSTED,
        'Runtime connection request budget exceeded'
      )
    }
    this.requestBytes += byteLength
  }

  reserveResponseBytes(pending: PendingCall, byteLength: number): boolean {
    if (byteLength > MAX_PENDING_RESPONSE_BYTES - this.responseBytes) {
      return false
    }
    pending.bufferedResponseBytes += byteLength
    this.responseBytes += byteLength
    return true
  }

  restoreResponseBytes(pending: PendingCall, byteLength: number): boolean {
    if (byteLength > pending.bufferedResponseBytes || byteLength > this.responseBytes) {
      return false
    }
    pending.bufferedResponseBytes -= byteLength
    this.responseBytes -= byteLength
    return true
  }

  markStreamEnded(pending: PendingCall): boolean {
    if (pending.kind !== 'stream' || pending.isRemoteEnded) {
      return false
    }
    pending.isRemoteEnded = true
    this.requestBytes -= pending.requestBytes
    pending.requestBytes = 0
    pending.cleanup()
    pending.abort.abort()
    return true
  }

  take(callId: bigint): PendingCall | undefined {
    const pending = this.calls.get(callId)
    if (!pending) {
      return undefined
    }
    this.calls.delete(callId)
    this.responseBytes -= pending.bufferedResponseBytes
    if (pending.kind !== 'stream' || !pending.isRemoteEnded) {
      this.requestBytes -= pending.requestBytes
      pending.cleanup()
      pending.abort.abort()
    }
    return pending
  }
}

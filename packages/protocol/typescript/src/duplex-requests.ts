import { StatusCode } from '../generated/yiru/protocol/v1/errors_pb.js'
import { RuntimeProtocolError } from './error.js'
import type { ProtocolSender } from './frame-sender.js'
import { MAX_PENDING_SEND_BATCHES, MAX_PENDING_SEND_BYTES } from './peer-values.js'

type Request = {
  credit: bigint
  limit: bigint
  closed: boolean
  ending: boolean
  signal: AbortSignal
  tail: Promise<void>
  wake?: () => void
}

export class DuplexRequests {
  private readonly requests = new Map<bigint, Request>()
  private pendingBytes = 0
  private pendingCount = 0

  open(callId: bigint, credit: bigint, initialBytes: number, signal: AbortSignal): void {
    this.requests.set(callId, {
      credit: credit - BigInt(initialBytes),
      limit: credit,
      closed: false,
      ending: false,
      signal,
      tail: Promise.resolve()
    })
  }

  update(callId: bigint, bytes: bigint): boolean {
    const request = this.requests.get(callId)
    if (!request) {
      return false
    }
    if (bytes <= 0n || request.credit + bytes > request.limit) {
      throw new RuntimeProtocolError(StatusCode.INTERNAL, 'Duplex request credit exceeds its limit')
    }
    request.credit += bytes
    request.wake?.()
    return true
  }

  close(callId: bigint): void {
    const request = this.requests.get(callId)
    if (!request) {
      return
    }
    request.closed = true
    request.wake?.()
    this.requests.delete(callId)
  }

  async send(callId: bigint, payload: Uint8Array, sender: ProtocolSender): Promise<void> {
    const request = this.requests.get(callId)
    if (!request || request.closed || request.ending) {
      throw closed()
    }
    if (
      this.pendingCount >= MAX_PENDING_SEND_BATCHES ||
      BigInt(payload.byteLength) > request.limit ||
      this.pendingBytes + payload.byteLength > MAX_PENDING_SEND_BYTES
    ) {
      throw new RuntimeProtocolError(
        StatusCode.RESOURCE_EXHAUSTED,
        'Duplex request buffer limit exceeded'
      )
    }
    const bytes = payload.slice()
    this.pendingBytes += bytes.byteLength
    this.pendingCount += 1
    const work = request.tail.then(async () => {
      while (
        !request.closed &&
        !request.signal.aborted &&
        request.credit < BigInt(bytes.byteLength)
      ) {
        await new Promise<void>((resolve) => {
          request.wake = resolve
        })
        request.wake = undefined
      }
      if (request.closed || request.signal.aborted) {
        throw closed()
      }
      request.credit -= BigInt(bytes.byteLength)
      await sender.payload(callId, bytes, request.signal)
    })
    request.tail = work.catch(() => {})
    try {
      await work
    } finally {
      this.pendingBytes -= bytes.byteLength
      this.pendingCount -= 1
    }
  }

  async end(callId: bigint, sender: ProtocolSender): Promise<void> {
    const request = this.requests.get(callId)
    if (!request || request.closed || request.ending) {
      throw closed()
    }
    request.ending = true
    await request.tail
    if (request.closed || request.signal.aborted) {
      throw closed()
    }
    await sender.end(callId)
  }
}

function closed(): RuntimeProtocolError {
  return new RuntimeProtocolError(StatusCode.CANCELLED, 'Duplex request is closed')
}

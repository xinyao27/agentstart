import { StatusCode } from '../generated/agent_start/protocol/v1/errors_pb.js'
import type { ClientCallIdSequence } from './call-id-sequence.js'
import { RuntimeProtocolError } from './error.js'
import type { LocallyCancelledCalls } from './locally-cancelled-calls.js'
import type { PendingCalls } from './pending-calls.js'

export type PayloadRejection = Readonly<{
  code: StatusCode
  reason: string
}>

export function acceptCallPayload(
  callIds: ClientCallIdSequence,
  locallyCancelledCalls: LocallyCancelledCalls,
  pendingCalls: PendingCalls,
  callId: bigint,
  data: Uint8Array
): PayloadRejection | null {
  const pending = pendingCalls.get(callId)
  if (!pending) {
    if (locallyCancelledCalls.contains(callId)) {
      return null
    }
    if (callIds.isRetired(callId)) {
      throw new RuntimeProtocolError(StatusCode.INTERNAL, 'Payload followed a completed call')
    }
    throw new RuntimeProtocolError(StatusCode.INTERNAL, 'Payload addressed an unknown call')
  }
  if (pending.kind === 'stream' && pending.isRemoteEnded) {
    throw new RuntimeProtocolError(StatusCode.INTERNAL, 'Payload followed a successful CallEnd')
  }
  if (data.byteLength > pending.incomingCreditBytes) {
    throw new RuntimeProtocolError(StatusCode.RESOURCE_EXHAUSTED, 'Daemon exceeded call credit')
  }
  if (!pendingCalls.reserveResponseBytes(pending, data.byteLength)) {
    return {
      code: StatusCode.RESOURCE_EXHAUSTED,
      reason: 'Runtime connection response budget exceeded'
    }
  }
  pending.incomingCreditBytes -= data.byteLength
  if (pending.kind === 'unary') {
    if (pending.payloads.length !== 0) {
      throw new RuntimeProtocolError(StatusCode.INTERNAL, 'Unary call returned multiple payloads')
    }
    pending.payloads.push(data)
    return null
  }
  if (pending.stream.push(data)) {
    return null
  }
  return {
    code: StatusCode.RESOURCE_EXHAUSTED,
    reason: 'Runtime stream buffer limit exceeded'
  }
}

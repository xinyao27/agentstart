import { StatusCode } from '../generated/agent_start/protocol/v1/errors_pb.js'
import { RuntimeProtocolError } from './error.js'

const MAX_CALL_ID = 0xffff_ffff_ffff_ffffn

export class ClientCallIdSequence {
  private next = 1n

  allocate(): bigint {
    if (this.next === 0n) {
      throw new RuntimeProtocolError(
        StatusCode.RESOURCE_EXHAUSTED,
        'Runtime protocol exhausted client call IDs'
      )
    }
    const callId = this.next
    this.next = callId === MAX_CALL_ID ? 0n : callId + 2n
    return callId
  }

  isRetired(callId: bigint): boolean {
    return callId > 0n && callId % 2n === 1n && (this.next === 0n || callId < this.next)
  }
}

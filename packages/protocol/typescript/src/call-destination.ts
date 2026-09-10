import { StatusCode } from '../generated/agent_start/protocol/v1/errors_pb.js'
import { TransportFeature, type Welcome } from '../generated/agent_start/protocol/v1/frame_pb.js'
import { RuntimeProtocolError } from './error.js'
import type { RuntimeCall } from './transport.js'

export function ensureCallDestination(call: RuntimeCall, welcome: Welcome | null): void {
  const environmentId = call.options?.destination?.environmentId.trim()
  if (!call.options?.destination) {
    return
  }
  if (!environmentId) {
    throw new RuntimeProtocolError(
      StatusCode.INVALID_ARGUMENT,
      'Runtime environment destination is invalid'
    )
  }
  if (!welcome?.enabledTransportFeatures.includes(TransportFeature.ROUTED_CALLS)) {
    throw new RuntimeProtocolError(
      StatusCode.FAILED_PRECONDITION,
      'Runtime connection did not negotiate routed calls'
    )
  }
}

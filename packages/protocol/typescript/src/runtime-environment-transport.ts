import { RuntimeRoutePolicy } from '../generated/agent_start/protocol/v1/annotations_pb.js'
import { StatusCode } from '../generated/agent_start/protocol/v1/errors_pb.js'
import { METHOD_TRANSPORT_METADATA_BY_PROCEDURE } from '../generated/method-metadata.generated.js'
import { RuntimeProtocolError } from './error.js'
import type { RuntimeCall, RuntimeTransport, RuntimeDuplexTransport } from './transport.js'

export function runtimeEnvironmentTransport(
  transport: RuntimeDuplexTransport,
  environmentId: string
): RuntimeDuplexTransport
export function runtimeEnvironmentTransport(
  transport: RuntimeTransport,
  environmentId: string
): RuntimeTransport
export function runtimeEnvironmentTransport(
  transport: RuntimeTransport,
  environmentId: string
): RuntimeTransport {
  const destination = environmentId.trim()
  if (!/^[0-9a-f]{32}$/u.test(destination)) {
    throw new RuntimeProtocolError(
      StatusCode.INVALID_ARGUMENT,
      'Runtime environment destination is invalid'
    )
  }
  return {
    ...(hasDuplex(transport)
      ? { duplex: (call: RuntimeCall) => transport.duplex(routedCall(call, destination)) }
      : {}),
    unary: (call) => transport.unary(routedCall(call, destination)),
    subscribe: (call) => transport.subscribe(routedCall(call, destination))
  }
}

function routedCall(call: RuntimeCall, environmentId: string): RuntimeCall {
  const metadata = METHOD_TRANSPORT_METADATA_BY_PROCEDURE[call.method]
  if (!metadata || metadata.route !== RuntimeRoutePolicy.ENVIRONMENT_ALLOWED) {
    throw new RuntimeProtocolError(
      StatusCode.FAILED_PRECONDITION,
      'Runtime method does not allow environment routing'
    )
  }
  if (call.options?.destination) {
    throw new RuntimeProtocolError(
      StatusCode.INVALID_ARGUMENT,
      'Runtime call already has a destination'
    )
  }
  return {
    ...call,
    options: { ...call.options, destination: { environmentId } }
  }
}

function hasDuplex(transport: RuntimeTransport): transport is RuntimeDuplexTransport {
  return 'duplex' in transport && typeof transport.duplex === 'function'
}

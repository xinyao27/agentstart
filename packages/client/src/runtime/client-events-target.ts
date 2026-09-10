import { CLIENT_EVENTS_PROTOCOL_CAPABILITY, ClientEventsClient } from '@agentstart/protocol'

import { openRuntimeProtocolTarget } from './protocol-target'
import type { RuntimeClientTarget } from './runtime-target'
import { readRuntimeStatus } from './status-client'

async function openClientEventsTarget(
  target: RuntimeClientTarget
): Promise<ClientEventsClient | null> {
  const status = await readRuntimeStatus(target)
  if (!status.capabilities?.includes(CLIENT_EVENTS_PROTOCOL_CAPABILITY)) {
    return null
  }
  return new ClientEventsClient(await openRuntimeProtocolTarget(target))
}

// Why: the client-events namespace is protobuf-only, so a missing capability
// means the connected daemon predates the cutover — an error, not a legacy
// retry. Stream fan-outs treat it as a reconnect trigger.
export async function requireClientEventsClient(
  target: RuntimeClientTarget
): Promise<ClientEventsClient> {
  const client = await openClientEventsTarget(target)
  if (!client) {
    throw new Error('runtime.clientEvents.protobuf.v1 capability is not available')
  }
  return client
}

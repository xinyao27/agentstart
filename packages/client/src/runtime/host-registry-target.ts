import { HOST_REGISTRY_PROTOCOL_CAPABILITY, HostRegistryClient } from '@agentstart/protocol'

import { openRuntimeProtocolTarget } from './protocol-target'
import type { RuntimeClientTarget } from './runtime-target'
import { readRuntimeStatus } from './status-client'

export async function openHostRegistryTarget(
  target: RuntimeClientTarget
): Promise<HostRegistryClient | null> {
  const status = await readRuntimeStatus(target)
  if (!status.capabilities?.includes(HOST_REGISTRY_PROTOCOL_CAPABILITY)) {
    return null
  }
  return new HostRegistryClient(await openRuntimeProtocolTarget(target))
}

export async function requireHostRegistryTarget(
  target: RuntimeClientTarget
): Promise<HostRegistryClient> {
  const client = await openHostRegistryTarget(target)
  if (!client) {
    throw new Error('hostRegistry.protobuf.v1 capability is not available on this runtime host')
  }
  return client
}

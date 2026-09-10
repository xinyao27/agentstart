import type { HostAgentTrustInput } from '@agentstart/protocol'
import { useAppStore } from '~renderer/store/state'

import { requireHostRegistryTarget } from './host-registry-target'
import { getActiveRuntimeTarget } from './rpc-client'
import type { RuntimeClientTarget } from './runtime-target'

export function markAgentWorkspaceTrusted(
  input: HostAgentTrustInput,
  target: RuntimeClientTarget = getActiveRuntimeTarget(useAppStore.getState().settings)
): Promise<void> {
  return requireHostRegistryTarget(target).then((client) =>
    client.markAgentTrusted(input, { timeoutMs: 15_000 })
  )
}

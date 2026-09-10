import type { RuntimeEnvironment, RuntimeEnvironmentEndpoint } from '@agentstart/protocol'

type PublicRuntimeAccessEndpoint = Pick<RuntimeEnvironmentEndpoint, 'id' | 'label' | 'endpoint'> & {
  kind: 'websocket'
}

export type PublicKnownRuntimeEnvironment = Pick<
  RuntimeEnvironment,
  'id' | 'name' | 'preferredEndpointId'
> & {
  createdAt: number
  updatedAt: number
  lastUsedAt: number | null
  runtimeId: string | null
  endpoints: PublicRuntimeAccessEndpoint[]
  pairingRequired?: boolean
}

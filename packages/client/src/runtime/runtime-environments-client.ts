import {
  RuntimeEnvironmentClient,
  RuntimeEnvironmentEndpointKind,
  type RuntimeEnvironment
} from '@agentstart/protocol'
import { translate } from '~renderer/i18n/i18n'

import { openConfiguredBrowserHostProtocol } from './browser-host-runtime'
import type { RuntimeEnvironmentApi } from './runtime-environment-api'
import { mapProtocolStatus } from './status-mapping'

type PublicRuntimeEnvironment = Awaited<ReturnType<RuntimeEnvironmentApi['list']>>[number]

export const runtimeEnvironmentsClient: RuntimeEnvironmentApi = {
  list: async () => {
    const client = await protocolClient()
    return (await client.list()).map(mapRuntimeEnvironment)
  },
  remove: async (input) => {
    const client = await protocolClient()
    return { removed: mapRuntimeEnvironment(await client.remove(input.selector)) }
  },
  disconnect: async (input) => {
    const client = await protocolClient()
    return { disconnected: mapRuntimeEnvironment(await client.disconnect(input.selector)) }
  },
  getStatus: async (input) => {
    const client = await protocolClient()
    const response = await client.getStatus(input.selector, input.timeoutMs ?? 15_000, {
      timeoutMs: input.timeoutMs ?? 15_000
    })
    if (!response.environment || !response.status) {
      throw new Error(
        translate(
          'runtimeEnvironment.statusIncomplete',
          'Runtime environment status response is incomplete'
        )
      )
    }
    const environment = mapRuntimeEnvironment(response.environment)
    const status = mapProtocolStatus(response.status)
    if (environment.runtimeId !== requiredText(status.runtimeId, 'status.runtime_id')) {
      throw new Error(
        translate(
          'runtimeEnvironment.statusIdentityMismatch',
          'Runtime environment status identity does not match its environment'
        )
      )
    }
    return status
  }
}

export const RUNTIME_ENVIRONMENTS_QUERY_KEY = ['runtime-environments'] as const

async function protocolClient(): Promise<RuntimeEnvironmentClient> {
  return new RuntimeEnvironmentClient(await openConfiguredBrowserHostProtocol())
}

function mapRuntimeEnvironment(environment: RuntimeEnvironment): PublicRuntimeEnvironment {
  const id = requiredText(environment.id, 'id')
  const name = requiredText(environment.name, 'name')
  const preferredEndpointId = requiredText(environment.preferredEndpointId, 'preferred_endpoint_id')
  const endpointIds = new Set<string>()
  const endpoints = environment.endpoints.map<PublicRuntimeEnvironment['endpoints'][number]>(
    (endpoint) => {
      if (endpoint.kind !== RuntimeEnvironmentEndpointKind.WEBSOCKET) {
        throw new Error(
          translate(
            'runtimeEnvironment.unsupportedEndpointKind',
            'Runtime environment returned an unsupported endpoint kind'
          )
        )
      }
      const endpointId = requiredText(endpoint.id, 'endpoint.id')
      if (endpointIds.has(endpointId)) {
        throw new Error(
          translate(
            'runtimeEnvironment.duplicateEndpointIdentity',
            'Runtime environment returned duplicate endpoint identities'
          )
        )
      }
      endpointIds.add(endpointId)
      return {
        id: endpointId,
        kind: 'websocket',
        label: requiredText(endpoint.label, 'endpoint.label'),
        endpoint: requiredText(endpoint.endpoint, 'endpoint.endpoint')
      }
    }
  )
  if (!endpointIds.has(preferredEndpointId)) {
    throw new Error(
      translate(
        'runtimeEnvironment.preferredEndpointMissing',
        'Runtime environment preferred endpoint is missing'
      )
    )
  }
  return {
    id,
    name,
    createdAt: safeNonNegativeInteger(environment.createdAtUnixMs, 'created_at_unix_ms'),
    updatedAt: safeNonNegativeInteger(environment.updatedAtUnixMs, 'updated_at_unix_ms'),
    lastUsedAt:
      environment.lastUsedAtUnixMs === undefined
        ? null
        : safeNonNegativeInteger(environment.lastUsedAtUnixMs, 'last_used_at_unix_ms'),
    runtimeId:
      environment.runtimeId === undefined
        ? null
        : requiredText(environment.runtimeId, 'runtime_id'),
    endpoints,
    preferredEndpointId,
    pairingRequired: environment.pairingRequired
  }
}

function safeNonNegativeInteger(value: bigint, field: string): number {
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error(
      translate(
        'runtimeEnvironment.invalidIntegerField',
        'Runtime environment {{field}} is outside the valid integer range',
        { field }
      )
    )
  }
  return number
}

function requiredText(value: string, field: string): string {
  const normalized = value.trim()
  if (!normalized) {
    throw new Error(
      translate('runtimeEnvironment.missingField', 'Runtime environment {{field}} is missing', {
        field
      })
    )
  }
  return normalized
}

import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import {
  AgentTrustPreset,
  HostRegistryService,
  HostRegistryServiceIsGitBashAvailableRequestSchema,
  HostRegistryServiceIsGitBashAvailableResponseSchema,
  HostRegistryServiceIsPwshAvailableRequestSchema,
  HostRegistryServiceIsPwshAvailableResponseSchema,
  HostRegistryServiceIsWslAvailableRequestSchema,
  HostRegistryServiceIsWslAvailableResponseSchema,
  HostRegistryServiceListWslDistrosRequestSchema,
  HostRegistryServiceListWslDistrosResponseSchema,
  HostRegistryServiceMarkAgentTrustedRequestSchema,
  HostRegistryServiceMarkAgentTrustedResponseSchema
} from '../generated/yiru/runtime/v1/host_registry_pb.js'
import type { RuntimeCallOptions, RuntimeTransport } from './transport.js'

export const HOST_REGISTRY_PROTOCOL_CAPABILITY = 'hostRegistry.protobuf.v1' as const

export type HostAgentTrustPreset = 'codex' | 'copilot' | 'cursor'

export type HostAgentTrustInput = Readonly<{
  preset: HostAgentTrustPreset
  workspacePath: string
}>

// Windows shell availability decides which launcher the terminal offers, so the
// probes stay separate unary calls a caller can run concurrently and fail
// individually.
export class HostRegistryClient {
  private readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  async isWslAvailable(options?: RuntimeCallOptions): Promise<boolean> {
    const response = await this.transport.unary({
      method: procedure('isWslAvailable'),
      payload: toBinary(
        HostRegistryServiceIsWslAvailableRequestSchema,
        create(HostRegistryServiceIsWslAvailableRequestSchema, {})
      ),
      ...(options ? { options } : {})
    })
    return fromBinary(HostRegistryServiceIsWslAvailableResponseSchema, response).available
  }

  async listWslDistros(options?: RuntimeCallOptions): Promise<string[]> {
    const response = await this.transport.unary({
      method: procedure('listWslDistros'),
      payload: toBinary(
        HostRegistryServiceListWslDistrosRequestSchema,
        create(HostRegistryServiceListWslDistrosRequestSchema, {})
      ),
      ...(options ? { options } : {})
    })
    return [...fromBinary(HostRegistryServiceListWslDistrosResponseSchema, response).distros]
  }

  async isGitBashAvailable(options?: RuntimeCallOptions): Promise<boolean> {
    const response = await this.transport.unary({
      method: procedure('isGitBashAvailable'),
      payload: toBinary(
        HostRegistryServiceIsGitBashAvailableRequestSchema,
        create(HostRegistryServiceIsGitBashAvailableRequestSchema, {})
      ),
      ...(options ? { options } : {})
    })
    return fromBinary(HostRegistryServiceIsGitBashAvailableResponseSchema, response).available
  }

  async isPwshAvailable(options?: RuntimeCallOptions): Promise<boolean> {
    const response = await this.transport.unary({
      method: procedure('isPwshAvailable'),
      payload: toBinary(
        HostRegistryServiceIsPwshAvailableRequestSchema,
        create(HostRegistryServiceIsPwshAvailableRequestSchema, {})
      ),
      ...(options ? { options } : {})
    })
    return fromBinary(HostRegistryServiceIsPwshAvailableResponseSchema, response).available
  }

  async markAgentTrusted(input: HostAgentTrustInput, options?: RuntimeCallOptions): Promise<void> {
    const response = await this.transport.unary({
      method: procedure('markAgentTrusted'),
      payload: toBinary(
        HostRegistryServiceMarkAgentTrustedRequestSchema,
        create(HostRegistryServiceMarkAgentTrustedRequestSchema, {
          preset: agentTrustPreset(input.preset),
          workspacePath: input.workspacePath
        })
      ),
      ...(options ? { options } : {})
    })
    fromBinary(HostRegistryServiceMarkAgentTrustedResponseSchema, response)
  }
}

function procedure(method: keyof typeof HostRegistryService.method): string {
  return `/${HostRegistryService.typeName}/${HostRegistryService.method[method].name}`
}

function agentTrustPreset(preset: HostAgentTrustPreset): AgentTrustPreset {
  switch (preset) {
    case 'codex':
      return AgentTrustPreset.CODEX
    case 'copilot':
      return AgentTrustPreset.COPILOT
    case 'cursor':
      return AgentTrustPreset.CURSOR
  }
}

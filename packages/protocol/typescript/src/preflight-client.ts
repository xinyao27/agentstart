import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import {
  PreflightContextSchema,
  PreflightLocalHostRuntimeSchema,
  PreflightProjectRuntimeSchema,
  PreflightRepairReason,
  PreflightRepairRequiredSchema,
  PreflightResolvedRuntimeSchema,
  PreflightService,
  PreflightServiceCheckRequestSchema,
  PreflightServiceCheckResponseSchema,
  PreflightServiceDetectAgentsRequestSchema,
  PreflightServiceDetectAgentsResponseSchema,
  PreflightServiceDetectRemoteAgentsRequestSchema,
  PreflightServiceRefreshAgentsRequestSchema,
  PreflightServiceRefreshAgentsResponseSchema,
  PreflightWindowsHostRuntimeSchema,
  PreflightWslRuntimeSchema,
  type PreflightContext,
  type PreflightProjectRuntime
} from '../generated/yiru/runtime/v1/preflight_pb.js'
import {
  decodePreflightRefresh,
  decodePreflightStatus,
  type PreflightAgentContextInput,
  type PreflightCheckInput,
  type PreflightDetectRemoteAgentsInput,
  type PreflightProjectRuntimeValue,
  type PreflightRefreshAgentsValue,
  type PreflightStatusValue
} from './preflight-values.js'
import type { RuntimeCallOptions, RuntimeTransport } from './transport.js'

const CHECK_PROCEDURE = `/${PreflightService.typeName}/${PreflightService.method.check.name}`
const DETECT_AGENTS_PROCEDURE = `/${PreflightService.typeName}/${PreflightService.method.detectAgents.name}`
const DETECT_REMOTE_AGENTS_PROCEDURE = `/${PreflightService.typeName}/${PreflightService.method.detectRemoteAgents.name}`
const REFRESH_AGENTS_PROCEDURE = `/${PreflightService.typeName}/${PreflightService.method.refreshAgents.name}`

export class PreflightClient {
  private readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  async check(
    input: PreflightCheckInput = {},
    options?: RuntimeCallOptions
  ): Promise<PreflightStatusValue> {
    const response = await this.transport.unary({
      method: CHECK_PROCEDURE,
      payload: toBinary(
        PreflightServiceCheckRequestSchema,
        create(PreflightServiceCheckRequestSchema, {
          force: input.force === true,
          ...(hasContext(input) ? { context: contextValue(input) } : {})
        })
      ),
      ...(options ? { options } : {})
    })
    return decodePreflightStatus(fromBinary(PreflightServiceCheckResponseSchema, response))
  }

  async detectAgents(
    input: PreflightAgentContextInput = {},
    options?: RuntimeCallOptions
  ): Promise<string[]> {
    const response = await this.transport.unary({
      method: DETECT_AGENTS_PROCEDURE,
      payload: toBinary(
        PreflightServiceDetectAgentsRequestSchema,
        create(
          PreflightServiceDetectAgentsRequestSchema,
          hasContext(input) ? { context: contextValue(input) } : {}
        )
      ),
      ...(options ? { options } : {})
    })
    return [...fromBinary(PreflightServiceDetectAgentsResponseSchema, response).agents]
  }

  async detectRemoteAgents(
    input: PreflightDetectRemoteAgentsInput,
    options?: RuntimeCallOptions
  ): Promise<string[]> {
    const response = await this.transport.unary({
      method: DETECT_REMOTE_AGENTS_PROCEDURE,
      payload: toBinary(
        PreflightServiceDetectRemoteAgentsRequestSchema,
        create(PreflightServiceDetectRemoteAgentsRequestSchema, {
          connectionId: input.connectionId
        })
      ),
      ...(options ? { options } : {})
    })
    return [...fromBinary(PreflightServiceDetectAgentsResponseSchema, response).agents]
  }

  async refreshAgents(
    input: PreflightAgentContextInput = {},
    options?: RuntimeCallOptions
  ): Promise<PreflightRefreshAgentsValue> {
    const response = await this.transport.unary({
      method: REFRESH_AGENTS_PROCEDURE,
      payload: toBinary(
        PreflightServiceRefreshAgentsRequestSchema,
        create(
          PreflightServiceRefreshAgentsRequestSchema,
          hasContext(input) ? { context: contextValue(input) } : {}
        )
      ),
      ...(options ? { options } : {})
    })
    return decodePreflightRefresh(fromBinary(PreflightServiceRefreshAgentsResponseSchema, response))
  }
}

function hasContext(input: PreflightAgentContextInput): boolean {
  return input.wslDistro != null || input.wslDefault === true || input.projectRuntime !== undefined
}

function contextValue(input: PreflightAgentContextInput): PreflightContext {
  return create(PreflightContextSchema, {
    ...(input.wslDistro ? { wslDistro: input.wslDistro } : {}),
    wslDefault: input.wslDefault === true,
    ...(input.projectRuntime ? { projectRuntime: projectRuntime(input.projectRuntime) } : {})
  })
}

function projectRuntime(value: PreflightProjectRuntimeValue): PreflightProjectRuntime {
  if (value.status === 'resolved') {
    return create(PreflightProjectRuntimeSchema, {
      runtime: { case: 'resolved', value: resolvedRuntime(value.runtime) }
    })
  }
  return create(PreflightProjectRuntimeSchema, {
    runtime: {
      case: 'repairRequired',
      value: create(PreflightRepairRequiredSchema, { reason: repairReason(value.repair.reason) })
    }
  })
}

function resolvedRuntime(
  runtime: Extract<PreflightProjectRuntimeValue, { status: 'resolved' }>['runtime']
) {
  switch (runtime.kind) {
    case 'wsl':
      return create(PreflightResolvedRuntimeSchema, {
        kind: { case: 'wsl', value: create(PreflightWslRuntimeSchema, { distro: runtime.distro }) }
      })
    case 'windows-host':
      return create(PreflightResolvedRuntimeSchema, {
        kind: { case: 'windowsHost', value: create(PreflightWindowsHostRuntimeSchema) }
      })
    case 'local-host':
      return create(PreflightResolvedRuntimeSchema, {
        kind: { case: 'localHost', value: create(PreflightLocalHostRuntimeSchema) }
      })
  }
}

function repairReason(
  reason: Extract<PreflightProjectRuntimeValue, { status: 'repair-required' }>['repair']['reason']
): PreflightRepairReason {
  switch (reason) {
    case 'wsl-distro-required':
      return PreflightRepairReason.WSL_DISTRO_REQUIRED
    case 'wsl-distro-missing':
      return PreflightRepairReason.WSL_DISTRO_MISSING
    case 'wsl-unavailable':
      return PreflightRepairReason.WSL_UNAVAILABLE
  }
}

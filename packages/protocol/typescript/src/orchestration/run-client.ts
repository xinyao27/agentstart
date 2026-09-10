import {
  create,
  fromBinary,
  toBinary,
  type DescMessage,
  type MessageInitShape,
  type MessageShape
} from '@bufbuild/protobuf'

import {
  OrchestrationService,
  OrchestrationServiceResetRequestSchema,
  OrchestrationServiceResetResponseSchema,
  OrchestrationServiceRunBindingResponseSchema,
  OrchestrationServiceRunCreateRequestSchema,
  OrchestrationServiceRunCurrentRequestSchema,
  OrchestrationServiceRunCurrentResponseSchema,
  OrchestrationServiceRunListRequestSchema,
  OrchestrationServiceRunListResponseSchema,
  OrchestrationServiceRunShowRequestSchema,
  OrchestrationServiceRunShowResponseSchema,
  OrchestrationServiceRunUseRequestSchema
} from '../../generated/agent_start/runtime/v1/orchestration_pb.js'
import type { RuntimeCallOptions, RuntimeTransport } from '../transport.js'
import { resetScopeValue } from './enum-values.js'
import {
  orchestrationRun,
  orchestrationRunBinding,
  orchestrationMutation
} from './response-values.js'
import type {
  OrchestrationMutation,
  OrchestrationResetScopeName,
  OrchestrationRun,
  OrchestrationRunBinding
} from './values.js'

function procedure(method: keyof (typeof OrchestrationService)['method']): string {
  return `/${OrchestrationService.typeName}/${OrchestrationService.method[method].name}`
}

export class OrchestrationRunClient {
  protected readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  protected async call<ReqDesc extends DescMessage, ResDesc extends DescMessage>(
    method: keyof (typeof OrchestrationService)['method'],
    requestSchema: ReqDesc,
    input: MessageInitShape<ReqDesc>,
    responseSchema: ResDesc,
    options?: RuntimeCallOptions
  ): Promise<MessageShape<ResDesc>> {
    const payload = toBinary(requestSchema, create(requestSchema, input))
    const raw = await this.transport.unary({
      method: procedure(method),
      payload,
      ...(options ? { options } : {})
    })
    return fromBinary(responseSchema, raw)
  }

  async runCreate(
    input: { objective: string; from: string },
    options?: RuntimeCallOptions
  ): Promise<{
    run: OrchestrationRun
    binding: OrchestrationRunBinding
    mutation?: OrchestrationMutation
  }> {
    const response = await this.call(
      'runCreate',
      OrchestrationServiceRunCreateRequestSchema,
      input,
      OrchestrationServiceRunBindingResponseSchema,
      options
    )
    return {
      run: orchestrationRun(response.run),
      binding: orchestrationRunBinding(response.binding),
      mutation: orchestrationMutation(response.mutation)
    }
  }

  async runUse(
    input: { id: string; from: string },
    options?: RuntimeCallOptions
  ): Promise<{
    run: OrchestrationRun
    binding: OrchestrationRunBinding
    mutation?: OrchestrationMutation
  }> {
    const response = await this.call(
      'runUse',
      OrchestrationServiceRunUseRequestSchema,
      input,
      OrchestrationServiceRunBindingResponseSchema,
      options
    )
    return {
      run: orchestrationRun(response.run),
      binding: orchestrationRunBinding(response.binding),
      mutation: orchestrationMutation(response.mutation)
    }
  }

  async runCurrent(
    input: { from: string },
    options?: RuntimeCallOptions
  ): Promise<OrchestrationRun | null> {
    const response = await this.call(
      'runCurrent',
      OrchestrationServiceRunCurrentRequestSchema,
      input,
      OrchestrationServiceRunCurrentResponseSchema,
      options
    )
    return response.run ? orchestrationRun(response.run) : null
  }

  async runList(options?: RuntimeCallOptions): Promise<OrchestrationRun[]> {
    const payload = toBinary(
      OrchestrationServiceRunListRequestSchema,
      create(OrchestrationServiceRunListRequestSchema)
    )
    const raw = await this.transport.unary({
      method: procedure('runList'),
      payload,
      ...(options ? { options } : {})
    })
    return fromBinary(OrchestrationServiceRunListResponseSchema, raw).runs.map(orchestrationRun)
  }

  async runShow(
    input: { id: string; from?: string },
    options?: RuntimeCallOptions
  ): Promise<OrchestrationRun> {
    const response = await this.call(
      'runShow',
      OrchestrationServiceRunShowRequestSchema,
      input,
      OrchestrationServiceRunShowResponseSchema,
      options
    )
    return orchestrationRun(response.run)
  }

  /** `--all` truncates every run/task/message/gate on the host, not just the caller's run. */
  async reset(
    scope: OrchestrationResetScopeName,
    options?: RuntimeCallOptions
  ): Promise<{ reset: OrchestrationResetScopeName; mutation?: OrchestrationMutation }> {
    const response = await this.call(
      'reset',
      OrchestrationServiceResetRequestSchema,
      { scope: resetScopeValue(scope) },
      OrchestrationServiceResetResponseSchema,
      options
    )
    return {
      reset: scope,
      mutation: orchestrationMutation(response.mutation)
    }
  }
}

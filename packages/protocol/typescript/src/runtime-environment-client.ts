import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import {
  RuntimeEnvironmentService,
  RuntimeEnvironmentServiceDisconnectRequestSchema,
  RuntimeEnvironmentServiceDisconnectResponseSchema,
  RuntimeEnvironmentServiceGetStatusRequestSchema,
  RuntimeEnvironmentServiceGetStatusResponseSchema,
  RuntimeEnvironmentServiceListRequestSchema,
  RuntimeEnvironmentServiceListResponseSchema,
  RuntimeEnvironmentServiceRemoveRequestSchema,
  RuntimeEnvironmentServiceRemoveResponseSchema,
  type RuntimeEnvironment,
  type RuntimeEnvironmentServiceGetStatusResponse
} from '../generated/agent_start/runtime/v1/runtime_environment_pb.js'
import type { RuntimeCallOptions, RuntimeTransport } from './transport.js'

const DISCONNECT_PROCEDURE = `/${RuntimeEnvironmentService.typeName}/${RuntimeEnvironmentService.method.disconnect.name}`
const GET_STATUS_PROCEDURE = `/${RuntimeEnvironmentService.typeName}/${RuntimeEnvironmentService.method.getStatus.name}`
const LIST_PROCEDURE = `/${RuntimeEnvironmentService.typeName}/${RuntimeEnvironmentService.method.list.name}`
const REMOVE_PROCEDURE = `/${RuntimeEnvironmentService.typeName}/${RuntimeEnvironmentService.method.remove.name}`

export class RuntimeEnvironmentClient {
  private readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  async list(options?: RuntimeCallOptions): Promise<RuntimeEnvironment[]> {
    const response = await this.transport.unary({
      method: LIST_PROCEDURE,
      payload: toBinary(
        RuntimeEnvironmentServiceListRequestSchema,
        create(RuntimeEnvironmentServiceListRequestSchema)
      ),
      ...(options ? { options } : {})
    })
    return fromBinary(RuntimeEnvironmentServiceListResponseSchema, response).environments
  }

  async getStatus(
    selector: string,
    timeoutMs: number,
    options?: RuntimeCallOptions
  ): Promise<RuntimeEnvironmentServiceGetStatusResponse> {
    const response = await this.transport.unary({
      method: GET_STATUS_PROCEDURE,
      payload: toBinary(
        RuntimeEnvironmentServiceGetStatusRequestSchema,
        create(RuntimeEnvironmentServiceGetStatusRequestSchema, { selector, timeoutMs })
      ),
      ...(options ? { options } : {})
    })
    return fromBinary(RuntimeEnvironmentServiceGetStatusResponseSchema, response)
  }

  async remove(selector: string, options?: RuntimeCallOptions): Promise<RuntimeEnvironment> {
    const response = await this.transport.unary({
      method: REMOVE_PROCEDURE,
      payload: toBinary(
        RuntimeEnvironmentServiceRemoveRequestSchema,
        create(RuntimeEnvironmentServiceRemoveRequestSchema, { selector })
      ),
      ...(options ? { options } : {})
    })
    const removed = fromBinary(RuntimeEnvironmentServiceRemoveResponseSchema, response).removed
    if (!removed) {
      throw new Error('Runtime environment removal returned no environment')
    }
    return removed
  }

  async disconnect(selector: string, options?: RuntimeCallOptions): Promise<RuntimeEnvironment> {
    const response = await this.transport.unary({
      method: DISCONNECT_PROCEDURE,
      payload: toBinary(
        RuntimeEnvironmentServiceDisconnectRequestSchema,
        create(RuntimeEnvironmentServiceDisconnectRequestSchema, { selector })
      ),
      ...(options ? { options } : {})
    })
    const disconnected = fromBinary(
      RuntimeEnvironmentServiceDisconnectResponseSchema,
      response
    ).disconnected
    if (!disconnected) {
      throw new Error('Runtime environment disconnect returned no environment')
    }
    return disconnected
  }
}

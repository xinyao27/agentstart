import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import {
  GetStatusRequestSchema,
  GetStatusResponseSchema,
  StatusService,
  type GetStatusResponse
} from '../generated/yiru/runtime/v1/status_pb.js'
import type { RuntimeCallOptions, RuntimeTransport } from './transport.js'

const GET_STATUS_PROCEDURE = `/${StatusService.typeName}/${StatusService.method.getStatus.name}`

export class StatusClient {
  private readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  async get(options?: RuntimeCallOptions): Promise<GetStatusResponse> {
    const payload = toBinary(GetStatusRequestSchema, create(GetStatusRequestSchema))
    const response = await this.transport.unary({
      method: GET_STATUS_PROCEDURE,
      payload,
      ...(options ? { options } : {})
    })
    return fromBinary(GetStatusResponseSchema, response)
  }
}

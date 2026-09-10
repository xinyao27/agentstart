import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import {
  ComputerService,
  ComputerServicePermissionsRequestSchema,
  ComputerServicePermissionsResetRequestSchema,
  ComputerServicePermissionsResetResponseSchema,
  ComputerServicePermissionsResponseSchema,
  ComputerServicePermissionsStatusRequestSchema,
  ComputerServicePermissionsStatusResponseSchema
} from '../generated/agent_start/runtime/v1/computer_pb.js'
import {
  computerPermissionResetResult,
  computerPermissionSetupResult,
  computerPermissionStatusResult,
  protocolComputerPermissionId,
  type ComputerPermissionId,
  type ComputerPermissionResetResult,
  type ComputerPermissionSetupResult,
  type ComputerPermissionStatusResult
} from './computer-values.js'
import type { RuntimeCallOptions, RuntimeTransport } from './transport.js'

const PERMISSIONS_PROCEDURE = `/${ComputerService.typeName}/${ComputerService.method.permissions.name}`
const PERMISSIONS_STATUS_PROCEDURE = `/${ComputerService.typeName}/${ComputerService.method.permissionsStatus.name}`
const PERMISSIONS_RESET_PROCEDURE = `/${ComputerService.typeName}/${ComputerService.method.permissionsReset.name}`

// Why: only these three of the sixteen ComputerService rpcs have a browser
// caller — the rest are CLI/skill-only and driven from `agentstart computer`.
export class ComputerClient {
  private readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  async permissionsStatus(options?: RuntimeCallOptions): Promise<ComputerPermissionStatusResult> {
    const response = await this.transport.unary({
      method: PERMISSIONS_STATUS_PROCEDURE,
      payload: toBinary(
        ComputerServicePermissionsStatusRequestSchema,
        create(ComputerServicePermissionsStatusRequestSchema)
      ),
      ...(options ? { options } : {})
    })
    return computerPermissionStatusResult(
      fromBinary(ComputerServicePermissionsStatusResponseSchema, response)
    )
  }

  async permissions(
    input: { id?: ComputerPermissionId } = {},
    options?: RuntimeCallOptions
  ): Promise<ComputerPermissionSetupResult> {
    const response = await this.transport.unary({
      method: PERMISSIONS_PROCEDURE,
      payload: toBinary(
        ComputerServicePermissionsRequestSchema,
        create(
          ComputerServicePermissionsRequestSchema,
          input.id ? { id: protocolComputerPermissionId(input.id) } : {}
        )
      ),
      ...(options ? { options } : {})
    })
    return computerPermissionSetupResult(
      fromBinary(ComputerServicePermissionsResponseSchema, response)
    )
  }

  async permissionsReset(options?: RuntimeCallOptions): Promise<ComputerPermissionResetResult> {
    const response = await this.transport.unary({
      method: PERMISSIONS_RESET_PROCEDURE,
      payload: toBinary(
        ComputerServicePermissionsResetRequestSchema,
        create(ComputerServicePermissionsResetRequestSchema)
      ),
      ...(options ? { options } : {})
    })
    return computerPermissionResetResult(
      fromBinary(ComputerServicePermissionsResetResponseSchema, response)
    )
  }
}

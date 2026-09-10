import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import {
  DeveloperPermissionsService,
  DeveloperPermissionsServiceGetStatusRequestSchema,
  DeveloperPermissionsServiceGetStatusResponseSchema,
  DeveloperPermissionsServiceRequestRequestSchema,
  DeveloperPermissionsServiceRequestResponseSchema
} from '../generated/agent_start/runtime/v1/developer_permissions_pb.js'
import {
  developerPermissionState,
  protocolPermissionId,
  type DeveloperPermissionId,
  type DeveloperPermissionRequestResult,
  type DeveloperPermissionState
} from './developer-permissions-values.js'
import type { RuntimeCallOptions, RuntimeTransport } from './transport.js'

const GET_STATUS_PROCEDURE = `/${DeveloperPermissionsService.typeName}/${DeveloperPermissionsService.method.getStatus.name}`
const REQUEST_PROCEDURE = `/${DeveloperPermissionsService.typeName}/${DeveloperPermissionsService.method.request.name}`

export class DeveloperPermissionsClient {
  private readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  async getStatus(options?: RuntimeCallOptions): Promise<DeveloperPermissionState[]> {
    const response = fromBinary(
      DeveloperPermissionsServiceGetStatusResponseSchema,
      await this.transport.unary({
        method: GET_STATUS_PROCEDURE,
        payload: toBinary(
          DeveloperPermissionsServiceGetStatusRequestSchema,
          create(DeveloperPermissionsServiceGetStatusRequestSchema)
        ),
        ...(options ? { options } : {})
      })
    )
    return response.permissions.map((permission) => developerPermissionState(permission))
  }

  /**
   * Open the system surface that grants one permission and report where the
   * permission stands once it is open. Granting happens outside AgentStart, so the
   * status returned here is the status at that moment, not a final answer.
   */
  async request(
    id: DeveloperPermissionId,
    options?: RuntimeCallOptions
  ): Promise<DeveloperPermissionRequestResult> {
    const response = fromBinary(
      DeveloperPermissionsServiceRequestResponseSchema,
      await this.transport.unary({
        method: REQUEST_PROCEDURE,
        payload: toBinary(
          DeveloperPermissionsServiceRequestRequestSchema,
          create(DeveloperPermissionsServiceRequestRequestSchema, {
            id: protocolPermissionId(id)
          })
        ),
        ...(options ? { options } : {})
      })
    )
    const permission = developerPermissionState(response.permission)
    return {
      id: permission.id,
      openedSystemSettings: response.openedSystemSettings,
      status: permission.status
    }
  }
}

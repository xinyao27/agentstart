import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import {
  DangerousApprovalService,
  DangerousApprovalServiceBeginApprovalRequestSchema,
  DangerousApprovalServiceBeginApprovalResponseSchema,
  DangerousApprovalServiceBeginRegistrationRequestSchema,
  DangerousApprovalServiceBeginRegistrationResponseSchema,
  DangerousApprovalServiceFinishApprovalRequestSchema,
  DangerousApprovalServiceFinishApprovalResponseSchema,
  DangerousApprovalServiceFinishRegistrationRequestSchema,
  DangerousApprovalServiceRemoveRequestSchema,
  DangerousApprovalServiceStatusRequestSchema,
  DangerousApprovalServiceStatusResponseSchema
} from '../generated/agent_start/runtime/v1/dangerous_approval_pb.js'
import {
  dangerousApprovalBeginApproval,
  dangerousApprovalBeginRegistration,
  dangerousApprovalCeremony,
  dangerousApprovalFinishApproval,
  dangerousApprovalStatus,
  type DangerousApprovalBeginApprovalValue,
  type DangerousApprovalBeginRegistrationValue,
  type DangerousApprovalCeremonyInput,
  type DangerousApprovalFinishApprovalValue,
  type DangerousApprovalStatusValue
} from './dangerous-approval-values.js'
import type { RuntimeCallOptions, RuntimeTransport } from './transport.js'

const STATUS_PROCEDURE = `/${DangerousApprovalService.typeName}/${DangerousApprovalService.method.status.name}`
const BEGIN_REGISTRATION_PROCEDURE = `/${DangerousApprovalService.typeName}/${DangerousApprovalService.method.beginRegistration.name}`
const FINISH_REGISTRATION_PROCEDURE = `/${DangerousApprovalService.typeName}/${DangerousApprovalService.method.finishRegistration.name}`
const BEGIN_APPROVAL_PROCEDURE = `/${DangerousApprovalService.typeName}/${DangerousApprovalService.method.beginApproval.name}`
const FINISH_APPROVAL_PROCEDURE = `/${DangerousApprovalService.typeName}/${DangerousApprovalService.method.finishApproval.name}`
const REMOVE_PROCEDURE = `/${DangerousApprovalService.typeName}/${DangerousApprovalService.method.remove.name}`

export type DangerousApprovalFinishRegistrationInput = DangerousApprovalCeremonyInput & {
  requestId: string
}
export type DangerousApprovalFinishApprovalInput = DangerousApprovalCeremonyInput & {
  operation: string
  requestId: string
}

export class DangerousApprovalClient {
  private readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  async status(options?: RuntimeCallOptions): Promise<DangerousApprovalStatusValue> {
    const response = await this.transport.unary({
      method: STATUS_PROCEDURE,
      payload: toBinary(
        DangerousApprovalServiceStatusRequestSchema,
        create(DangerousApprovalServiceStatusRequestSchema)
      ),
      ...(options ? { options } : {})
    })
    return dangerousApprovalStatus(
      fromBinary(DangerousApprovalServiceStatusResponseSchema, response)
    )
  }

  async beginRegistration(
    options?: RuntimeCallOptions
  ): Promise<DangerousApprovalBeginRegistrationValue> {
    const response = await this.transport.unary({
      method: BEGIN_REGISTRATION_PROCEDURE,
      payload: toBinary(
        DangerousApprovalServiceBeginRegistrationRequestSchema,
        create(DangerousApprovalServiceBeginRegistrationRequestSchema)
      ),
      ...(options ? { options } : {})
    })
    return dangerousApprovalBeginRegistration(
      fromBinary(DangerousApprovalServiceBeginRegistrationResponseSchema, response)
    )
  }

  async finishRegistration(
    input: DangerousApprovalFinishRegistrationInput,
    options?: RuntimeCallOptions
  ): Promise<DangerousApprovalStatusValue> {
    const response = await this.transport.unary({
      method: FINISH_REGISTRATION_PROCEDURE,
      payload: toBinary(
        DangerousApprovalServiceFinishRegistrationRequestSchema,
        create(DangerousApprovalServiceFinishRegistrationRequestSchema, {
          requestId: input.requestId,
          response: dangerousApprovalCeremony(input)
        })
      ),
      ...(options ? { options } : {})
    })
    return dangerousApprovalStatus(
      fromBinary(DangerousApprovalServiceStatusResponseSchema, response)
    )
  }

  async beginApproval(
    operation: string,
    options?: RuntimeCallOptions
  ): Promise<DangerousApprovalBeginApprovalValue> {
    const response = await this.transport.unary({
      method: BEGIN_APPROVAL_PROCEDURE,
      payload: toBinary(
        DangerousApprovalServiceBeginApprovalRequestSchema,
        create(DangerousApprovalServiceBeginApprovalRequestSchema, { operation })
      ),
      ...(options ? { options } : {})
    })
    return dangerousApprovalBeginApproval(
      fromBinary(DangerousApprovalServiceBeginApprovalResponseSchema, response)
    )
  }

  async finishApproval(
    input: DangerousApprovalFinishApprovalInput,
    options?: RuntimeCallOptions
  ): Promise<DangerousApprovalFinishApprovalValue> {
    const response = await this.transport.unary({
      method: FINISH_APPROVAL_PROCEDURE,
      payload: toBinary(
        DangerousApprovalServiceFinishApprovalRequestSchema,
        create(DangerousApprovalServiceFinishApprovalRequestSchema, {
          requestId: input.requestId,
          operation: input.operation,
          response: dangerousApprovalCeremony(input)
        })
      ),
      ...(options ? { options } : {})
    })
    return dangerousApprovalFinishApproval(
      fromBinary(DangerousApprovalServiceFinishApprovalResponseSchema, response)
    )
  }

  async remove(options?: RuntimeCallOptions): Promise<DangerousApprovalStatusValue> {
    const response = await this.transport.unary({
      method: REMOVE_PROCEDURE,
      payload: toBinary(
        DangerousApprovalServiceRemoveRequestSchema,
        create(DangerousApprovalServiceRemoveRequestSchema)
      ),
      ...(options ? { options } : {})
    })
    return dangerousApprovalStatus(
      fromBinary(DangerousApprovalServiceStatusResponseSchema, response)
    )
  }
}

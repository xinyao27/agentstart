import { create } from '@bufbuild/protobuf'

import { StatusCode } from '../generated/agent_start/protocol/v1/errors_pb.js'
import {
  DangerousApprovalCeremonyResponseSchema,
  type DangerousApprovalCeremonyResponse,
  type DangerousApprovalServiceBeginApprovalResponse,
  type DangerousApprovalServiceBeginRegistrationResponse,
  type DangerousApprovalServiceFinishApprovalResponse,
  type DangerousApprovalServiceStatusResponse
} from '../generated/agent_start/runtime/v1/dangerous_approval_pb.js'
import { RuntimeProtocolError } from './error.js'

export const DANGEROUS_APPROVAL_PROTOCOL_CAPABILITY = 'dangerousApproval.protobuf.v1' as const

export type DangerousApprovalStatusValue = {
  configured: boolean
  credentialId: string | null
}
export type DangerousApprovalBeginRegistrationValue = {
  challenge: string
  requestId: string
  userId: string
}
export type DangerousApprovalBeginApprovalValue = {
  challenge: string
  requestId: string
}
export type DangerousApprovalFinishApprovalValue = { approvedUntil: number }
// The WebAuthn authenticator fills the optional fields differently between
// registration and assertion, so every optional field stays optional here.
export type DangerousApprovalCeremonyInput = {
  authenticatorData?: string
  clientDataJson: string
  credentialId: string
  publicKeySpki?: string
  signature?: string
}

export function dangerousApprovalStatus(
  value: DangerousApprovalServiceStatusResponse
): DangerousApprovalStatusValue {
  return { configured: value.configured, credentialId: value.credentialId ?? null }
}

export function dangerousApprovalBeginRegistration(
  value: DangerousApprovalServiceBeginRegistrationResponse
): DangerousApprovalBeginRegistrationValue {
  return { challenge: value.challenge, requestId: value.requestId, userId: value.userId }
}

export function dangerousApprovalBeginApproval(
  value: DangerousApprovalServiceBeginApprovalResponse
): DangerousApprovalBeginApprovalValue {
  return { challenge: value.challenge, requestId: value.requestId }
}

export function dangerousApprovalFinishApproval(
  value: DangerousApprovalServiceFinishApprovalResponse
): DangerousApprovalFinishApprovalValue {
  return { approvedUntil: integer(value.approvedUntil, 'Approval expiry') }
}

export function dangerousApprovalCeremony(
  input: DangerousApprovalCeremonyInput
): DangerousApprovalCeremonyResponse {
  return create(DangerousApprovalCeremonyResponseSchema, {
    ...(input.authenticatorData === undefined
      ? {}
      : { authenticatorData: input.authenticatorData }),
    clientDataJson: input.clientDataJson,
    credentialId: input.credentialId,
    ...(input.publicKeySpki === undefined ? {} : { publicKeySpki: input.publicKeySpki }),
    ...(input.signature === undefined ? {} : { signature: input.signature })
  })
}

function integer(value: bigint, label: string): number {
  const decoded = Number(value)
  if (!Number.isSafeInteger(decoded)) {
    throw invalidResponse(`${label} is outside the safe integer range`)
  }
  return decoded
}

function invalidResponse(message: string): RuntimeProtocolError {
  return new RuntimeProtocolError(StatusCode.DATA_LOSS, message)
}

import { StatusCode } from '../generated/agent_start/protocol/v1/errors_pb.js'
import {
  ArtifactStatus,
  type Artifact,
  type ArtifactDownloadTicket,
  type ArtifactRead,
  type ArtifactServiceAbortedResponse
} from '../generated/agent_start/runtime/v1/artifact_pb.js'
import { RuntimeProtocolError } from './error.js'

export const ARTIFACT_PROTOCOL_CAPABILITY = 'artifact.protobuf.v1' as const

export type ArtifactValue = {
  id: string
  projectId: string
  fileName: string
  mimeType: string
  byteLength: number
  createdAt: number
  status: 'ready' | 'writing'
}
export type ArtifactTicketValue = { ticket: string; expiresAt: number }
export type ArtifactReadValue = {
  dataBase64: string
  eof: boolean
  mimeType: string
  nextOffset: number
}

export function artifact(value: Artifact): ArtifactValue {
  return {
    id: value.id,
    projectId: value.projectId,
    fileName: value.fileName,
    mimeType: value.mimeType,
    byteLength: integer(value.byteLength, 'Artifact byte length'),
    createdAt: integer(value.createdAt, 'Artifact creation timestamp'),
    status: artifactStatus(value.status)
  }
}

export function artifactTicket(value: ArtifactDownloadTicket): ArtifactTicketValue {
  return {
    ticket: value.ticket,
    expiresAt: integer(value.expiresAt, 'Artifact ticket expiry')
  }
}

export function artifactRead(value: ArtifactRead): ArtifactReadValue {
  return {
    dataBase64: value.dataBase64,
    eof: value.eof,
    mimeType: value.mimeType,
    nextOffset: integer(value.nextOffset, 'Artifact read offset')
  }
}

export function artifactRemoved(value: ArtifactServiceAbortedResponse): { removed: boolean } {
  return { removed: value.removed }
}

function artifactStatus(value: ArtifactStatus): ArtifactValue['status'] {
  switch (value) {
    case ArtifactStatus.READY:
      return 'ready'
    case ArtifactStatus.WRITING:
      return 'writing'
    case ArtifactStatus.UNSPECIFIED:
      break
  }
  throw invalidResponse('Artifact status is missing')
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

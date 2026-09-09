import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import { StatusCode } from '../generated/yiru/protocol/v1/errors_pb.js'
import {
  ArtifactDownloadTicketSchema,
  ArtifactReadSchema,
  ArtifactService,
  ArtifactServiceAbortRequestSchema,
  ArtifactServiceAbortedResponseSchema,
  ArtifactServiceAppendRequestSchema,
  ArtifactServiceArtifactResponseSchema,
  ArtifactServiceBeginRequestSchema,
  ArtifactServiceCompleteRequestSchema,
  ArtifactServiceReadRequestSchema,
  ArtifactServiceTicketRequestSchema,
  type Artifact
} from '../generated/yiru/runtime/v1/artifact_pb.js'
import {
  artifact,
  artifactRead,
  artifactRemoved,
  artifactTicket,
  type ArtifactReadValue,
  type ArtifactTicketValue,
  type ArtifactValue
} from './artifact-values.js'
import { RuntimeProtocolError } from './error.js'
import type { RuntimeCallOptions, RuntimeTransport } from './transport.js'

const BEGIN_PROCEDURE = `/${ArtifactService.typeName}/${ArtifactService.method.begin.name}`
const APPEND_PROCEDURE = `/${ArtifactService.typeName}/${ArtifactService.method.append.name}`
const COMPLETE_PROCEDURE = `/${ArtifactService.typeName}/${ArtifactService.method.complete.name}`
const ABORT_PROCEDURE = `/${ArtifactService.typeName}/${ArtifactService.method.abort.name}`
const DOWNLOAD_TICKET_PROCEDURE = `/${ArtifactService.typeName}/${ArtifactService.method.downloadTicket.name}`
const READ_PROCEDURE = `/${ArtifactService.typeName}/${ArtifactService.method.read.name}`

export type ArtifactBeginInput = {
  fileName: string
  mimeType: string
  projectId: string
}
export type ArtifactAppendInput = {
  id: string
  offset: number
  dataBase64: string
}
export type ArtifactReadInput = {
  id: string
  offset: number
  limit: number
}

export class ArtifactClient {
  private readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  async begin(input: ArtifactBeginInput, options?: RuntimeCallOptions): Promise<ArtifactValue> {
    const response = await this.transport.unary({
      method: BEGIN_PROCEDURE,
      payload: toBinary(
        ArtifactServiceBeginRequestSchema,
        create(ArtifactServiceBeginRequestSchema, input)
      ),
      ...(options ? { options } : {})
    })
    return requiredArtifact(fromBinary(ArtifactServiceArtifactResponseSchema, response))
  }

  async append(input: ArtifactAppendInput, options?: RuntimeCallOptions): Promise<ArtifactValue> {
    const response = await this.transport.unary({
      method: APPEND_PROCEDURE,
      payload: toBinary(
        ArtifactServiceAppendRequestSchema,
        create(ArtifactServiceAppendRequestSchema, {
          id: input.id,
          offset: offset(input.offset),
          dataBase64: input.dataBase64
        })
      ),
      ...(options ? { options } : {})
    })
    return requiredArtifact(fromBinary(ArtifactServiceArtifactResponseSchema, response))
  }

  async complete(id: string, options?: RuntimeCallOptions): Promise<ArtifactValue> {
    const response = await this.transport.unary({
      method: COMPLETE_PROCEDURE,
      payload: toBinary(
        ArtifactServiceCompleteRequestSchema,
        create(ArtifactServiceCompleteRequestSchema, { id })
      ),
      ...(options ? { options } : {})
    })
    return requiredArtifact(fromBinary(ArtifactServiceArtifactResponseSchema, response))
  }

  async abort(id: string, options?: RuntimeCallOptions): Promise<{ removed: boolean }> {
    const response = await this.transport.unary({
      method: ABORT_PROCEDURE,
      payload: toBinary(
        ArtifactServiceAbortRequestSchema,
        create(ArtifactServiceAbortRequestSchema, { id })
      ),
      ...(options ? { options } : {})
    })
    return artifactRemoved(fromBinary(ArtifactServiceAbortedResponseSchema, response))
  }

  // Why: the ticket is one-use and short-lived — the daemon's `/artifacts/:id`
  // HTTP side channel consumes it, so this stays a plain opaque string here.
  async downloadTicket(id: string, options?: RuntimeCallOptions): Promise<ArtifactTicketValue> {
    const response = await this.transport.unary({
      method: DOWNLOAD_TICKET_PROCEDURE,
      payload: toBinary(
        ArtifactServiceTicketRequestSchema,
        create(ArtifactServiceTicketRequestSchema, { id })
      ),
      ...(options ? { options } : {})
    })
    return artifactTicket(fromBinary(ArtifactDownloadTicketSchema, response))
  }

  async read(input: ArtifactReadInput, options?: RuntimeCallOptions): Promise<ArtifactReadValue> {
    const response = await this.transport.unary({
      method: READ_PROCEDURE,
      payload: toBinary(
        ArtifactServiceReadRequestSchema,
        create(ArtifactServiceReadRequestSchema, {
          id: input.id,
          offset: offset(input.offset),
          limit: BigInt(input.limit)
        })
      ),
      ...(options ? { options } : {})
    })
    return artifactRead(fromBinary(ArtifactReadSchema, response))
  }
}

function requiredArtifact(response: { artifact?: Artifact | undefined }): ArtifactValue {
  if (!response.artifact) {
    throw invalidResponse('Artifact response is missing')
  }
  return artifact(response.artifact)
}

function offset(value: number): bigint {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw invalidRequest('Artifact offset must be a non-negative safe integer')
  }
  return BigInt(value)
}

function invalidResponse(message: string): RuntimeProtocolError {
  return new RuntimeProtocolError(StatusCode.DATA_LOSS, message)
}

// Why: the daemon rejects negative offsets like the legacy zod contract did,
// so the caller-side check mirrors it before the wire round-trip.
function invalidRequest(message: string): RuntimeProtocolError {
  return new RuntimeProtocolError(StatusCode.INVALID_ARGUMENT, message)
}

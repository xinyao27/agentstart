import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import { StatusCode } from '../generated/yiru/protocol/v1/errors_pb.js'
import {
  LocalDownloadService,
  LocalDownloadServiceAppendFileChunkRequestSchema,
  LocalDownloadServiceAppendFileChunkResponseSchema,
  LocalDownloadServiceAppendFolderFileChunkRequestSchema,
  LocalDownloadServiceAppendFolderFileChunkResponseSchema,
  LocalDownloadServiceCancelFileRequestSchema,
  LocalDownloadServiceCancelFileResponseSchema,
  LocalDownloadServiceCancelFolderRequestSchema,
  LocalDownloadServiceCancelFolderResponseSchema,
  LocalDownloadServiceCreateFolderDirectoryRequestSchema,
  LocalDownloadServiceCreateFolderDirectoryResponseSchema,
  LocalDownloadServiceFinishFileRequestSchema,
  LocalDownloadServiceFinishFileResponseSchema,
  LocalDownloadServiceFinishFolderRequestSchema,
  LocalDownloadServiceFinishFolderResponseSchema,
  LocalDownloadServiceStartFileRequestSchema,
  LocalDownloadServiceStartFileResponseSchema,
  LocalDownloadServiceStartFolderRequestSchema,
  LocalDownloadServiceStartFolderResponseSchema,
  type LocalDownloadSession
} from '../generated/yiru/runtime/v1/local_download_pb.js'
import { RuntimeProtocolError } from './error.js'
import type { RuntimeCallOptions, RuntimeTransport } from './transport.js'

const APPEND_FILE_CHUNK_PROCEDURE = `/${LocalDownloadService.typeName}/${LocalDownloadService.method.appendFileChunk.name}`
const APPEND_FOLDER_FILE_CHUNK_PROCEDURE = `/${LocalDownloadService.typeName}/${LocalDownloadService.method.appendFolderFileChunk.name}`
const CANCEL_FILE_PROCEDURE = `/${LocalDownloadService.typeName}/${LocalDownloadService.method.cancelFile.name}`
const CANCEL_FOLDER_PROCEDURE = `/${LocalDownloadService.typeName}/${LocalDownloadService.method.cancelFolder.name}`
const CREATE_FOLDER_DIRECTORY_PROCEDURE = `/${LocalDownloadService.typeName}/${LocalDownloadService.method.createFolderDirectory.name}`
const FINISH_FILE_PROCEDURE = `/${LocalDownloadService.typeName}/${LocalDownloadService.method.finishFile.name}`
const FINISH_FOLDER_PROCEDURE = `/${LocalDownloadService.typeName}/${LocalDownloadService.method.finishFolder.name}`
const START_FILE_PROCEDURE = `/${LocalDownloadService.typeName}/${LocalDownloadService.method.startFile.name}`
const START_FOLDER_PROCEDURE = `/${LocalDownloadService.typeName}/${LocalDownloadService.method.startFolder.name}`
const MAX_FILE_CHUNK_BYTES = 512 * 1024
const MAX_FOLDER_CHUNK_BYTES = 512 * 1024
const MAX_FOLDER_PATH_SEGMENTS = 1_024
const MAX_FOLDER_PATH_UTF8_BYTES = 256 * 1024
const MAX_SUGGESTED_NAME_UTF8_BYTES = 1_024
const MAX_TRANSFER_ID_UTF8_BYTES = 128

export type LocalDownloadFileStart = Readonly<{
  suggestedName: string
}>

export type LocalDownloadFileChunk = Readonly<{
  transferId: string
  content: Uint8Array
}>

export type LocalDownloadFolderStart = Readonly<{
  suggestedName: string
}>

export type LocalDownloadFolderDirectory = Readonly<{
  transferId: string
  pathSegments: readonly string[]
}>

export type LocalDownloadFolderFileChunk = Readonly<{
  transferId: string
  pathSegments: readonly string[]
  content: Uint8Array
  first: boolean
  last: boolean
}>

export class LocalDownloadClient {
  private readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  async startFile(
    input: LocalDownloadFileStart,
    options?: RuntimeCallOptions
  ): Promise<LocalDownloadSession> {
    validateSuggestedName(input.suggestedName)
    const payload = toBinary(
      LocalDownloadServiceStartFileRequestSchema,
      create(LocalDownloadServiceStartFileRequestSchema, input)
    )
    const response = await this.transport.unary({
      method: START_FILE_PROCEDURE,
      payload,
      ...(options ? { options } : {})
    })
    return requiredSession(
      fromBinary(LocalDownloadServiceStartFileResponseSchema, response).session
    )
  }

  async appendFileChunk(
    input: LocalDownloadFileChunk,
    options?: RuntimeCallOptions
  ): Promise<void> {
    validateTransferId(input.transferId)
    validateContent(input.content, MAX_FILE_CHUNK_BYTES)
    const payload = toBinary(
      LocalDownloadServiceAppendFileChunkRequestSchema,
      create(LocalDownloadServiceAppendFileChunkRequestSchema, input)
    )
    const response = await this.transport.unary({
      method: APPEND_FILE_CHUNK_PROCEDURE,
      payload,
      ...(options ? { options } : {})
    })
    fromBinary(LocalDownloadServiceAppendFileChunkResponseSchema, response)
  }

  async finishFile(transferId: string, options?: RuntimeCallOptions): Promise<string> {
    validateTransferId(transferId)
    const payload = toBinary(
      LocalDownloadServiceFinishFileRequestSchema,
      create(LocalDownloadServiceFinishFileRequestSchema, { transferId })
    )
    const response = await this.transport.unary({
      method: FINISH_FILE_PROCEDURE,
      payload,
      ...(options ? { options } : {})
    })
    return fromBinary(LocalDownloadServiceFinishFileResponseSchema, response).destinationPath
  }

  async cancelFile(transferId: string, options?: RuntimeCallOptions): Promise<void> {
    validateTransferId(transferId)
    const payload = toBinary(
      LocalDownloadServiceCancelFileRequestSchema,
      create(LocalDownloadServiceCancelFileRequestSchema, { transferId })
    )
    const response = await this.transport.unary({
      method: CANCEL_FILE_PROCEDURE,
      payload,
      ...(options ? { options } : {})
    })
    fromBinary(LocalDownloadServiceCancelFileResponseSchema, response)
  }

  async startFolder(
    input: LocalDownloadFolderStart,
    options?: RuntimeCallOptions
  ): Promise<LocalDownloadSession> {
    validateSuggestedName(input.suggestedName)
    const payload = toBinary(
      LocalDownloadServiceStartFolderRequestSchema,
      create(LocalDownloadServiceStartFolderRequestSchema, input)
    )
    const response = await this.transport.unary({
      method: START_FOLDER_PROCEDURE,
      payload,
      ...(options ? { options } : {})
    })
    return requiredSession(
      fromBinary(LocalDownloadServiceStartFolderResponseSchema, response).session
    )
  }

  async createFolderDirectory(
    input: LocalDownloadFolderDirectory,
    options?: RuntimeCallOptions
  ): Promise<void> {
    validateTransferId(input.transferId)
    validateFolderPath(input.pathSegments)
    const payload = toBinary(
      LocalDownloadServiceCreateFolderDirectoryRequestSchema,
      create(LocalDownloadServiceCreateFolderDirectoryRequestSchema, {
        transferId: input.transferId,
        pathSegments: [...input.pathSegments]
      })
    )
    const response = await this.transport.unary({
      method: CREATE_FOLDER_DIRECTORY_PROCEDURE,
      payload,
      ...(options ? { options } : {})
    })
    fromBinary(LocalDownloadServiceCreateFolderDirectoryResponseSchema, response)
  }

  async appendFolderFileChunk(
    input: LocalDownloadFolderFileChunk,
    options?: RuntimeCallOptions
  ): Promise<void> {
    validateTransferId(input.transferId)
    validateFolderPath(input.pathSegments)
    validateContent(input.content, MAX_FOLDER_CHUNK_BYTES)
    const payload = toBinary(
      LocalDownloadServiceAppendFolderFileChunkRequestSchema,
      create(LocalDownloadServiceAppendFolderFileChunkRequestSchema, {
        transferId: input.transferId,
        pathSegments: [...input.pathSegments],
        content: input.content,
        first: input.first,
        last: input.last
      })
    )
    const response = await this.transport.unary({
      method: APPEND_FOLDER_FILE_CHUNK_PROCEDURE,
      payload,
      ...(options ? { options } : {})
    })
    fromBinary(LocalDownloadServiceAppendFolderFileChunkResponseSchema, response)
  }

  async finishFolder(transferId: string, options?: RuntimeCallOptions): Promise<string> {
    validateTransferId(transferId)
    const payload = toBinary(
      LocalDownloadServiceFinishFolderRequestSchema,
      create(LocalDownloadServiceFinishFolderRequestSchema, { transferId })
    )
    const response = await this.transport.unary({
      method: FINISH_FOLDER_PROCEDURE,
      payload,
      ...(options ? { options } : {})
    })
    return fromBinary(LocalDownloadServiceFinishFolderResponseSchema, response).destinationPath
  }

  async cancelFolder(transferId: string, options?: RuntimeCallOptions): Promise<void> {
    validateTransferId(transferId)
    const payload = toBinary(
      LocalDownloadServiceCancelFolderRequestSchema,
      create(LocalDownloadServiceCancelFolderRequestSchema, { transferId })
    )
    const response = await this.transport.unary({
      method: CANCEL_FOLDER_PROCEDURE,
      payload,
      ...(options ? { options } : {})
    })
    fromBinary(LocalDownloadServiceCancelFolderResponseSchema, response)
  }
}

function validateSuggestedName(value: string): void {
  if (!value.trim() || utf8Length(value) > MAX_SUGGESTED_NAME_UTF8_BYTES) {
    throw invalidInput('Local download suggested name is invalid')
  }
}

function validateTransferId(value: string): void {
  if (!value || utf8Length(value) > MAX_TRANSFER_ID_UTF8_BYTES) {
    throw invalidInput('Local download transfer ID is invalid')
  }
}

function validateContent(content: Uint8Array, maximumBytes: number): void {
  if (content.byteLength > maximumBytes) {
    throw invalidInput('Local download chunk is too large')
  }
}

function validateFolderPath(pathSegments: readonly string[]): void {
  if (
    pathSegments.length === 0 ||
    pathSegments.length > MAX_FOLDER_PATH_SEGMENTS ||
    pathSegments.reduce((length, segment) => length + utf8Length(segment), 0) >
      MAX_FOLDER_PATH_UTF8_BYTES
  ) {
    throw invalidInput('Local download folder path is too large')
  }
}

function utf8Length(value: string): number {
  let length = 0
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0
    length += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4
  }
  return length
}

function invalidInput(message: string): RuntimeProtocolError {
  return new RuntimeProtocolError(StatusCode.INVALID_ARGUMENT, message)
}

function requiredSession(session: LocalDownloadSession | undefined): LocalDownloadSession {
  if (session) {
    return session
  }
  throw new RuntimeProtocolError(
    StatusCode.INTERNAL,
    'Local download service did not return a session'
  )
}

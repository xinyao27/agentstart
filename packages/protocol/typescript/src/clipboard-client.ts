import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import {
  ClipboardService,
  ClipboardServiceAbortImageUploadRequestSchema,
  ClipboardServiceAppendImageUploadChunkRequestSchema,
  ClipboardServiceChunkReceivedResponseSchema,
  ClipboardServiceCommitImageUploadRequestSchema,
  ClipboardServiceSaveImageAsTempFileRequestSchema,
  ClipboardServiceSavedImagePathResponseSchema,
  ClipboardServiceStartImageUploadRequestSchema,
  ClipboardServiceUploadAbortedResponseSchema,
  ClipboardServiceUploadStartedResponseSchema
} from '../generated/agent_start/runtime/v1/clipboard_pb.js'
import {
  clipboardChunkReceivedLength,
  clipboardSavedImagePath,
  clipboardUploadId
} from './clipboard-values.js'
import type { RuntimeCallOptions, RuntimeTransport } from './transport.js'

const START_IMAGE_UPLOAD_PROCEDURE = `/${ClipboardService.typeName}/${ClipboardService.method.startImageUpload.name}`
const APPEND_IMAGE_UPLOAD_CHUNK_PROCEDURE = `/${ClipboardService.typeName}/${ClipboardService.method.appendImageUploadChunk.name}`
const COMMIT_IMAGE_UPLOAD_PROCEDURE = `/${ClipboardService.typeName}/${ClipboardService.method.commitImageUpload.name}`
const ABORT_IMAGE_UPLOAD_PROCEDURE = `/${ClipboardService.typeName}/${ClipboardService.method.abortImageUpload.name}`
const SAVE_IMAGE_AS_TEMP_FILE_PROCEDURE = `/${ClipboardService.typeName}/${ClipboardService.method.saveImageAsTempFile.name}`

export class ClipboardClient {
  private readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  async startImageUpload(
    expectedBase64Length: number,
    options?: RuntimeCallOptions
  ): Promise<string> {
    const response = fromBinary(
      ClipboardServiceUploadStartedResponseSchema,
      await this.transport.unary({
        method: START_IMAGE_UPLOAD_PROCEDURE,
        payload: toBinary(
          ClipboardServiceStartImageUploadRequestSchema,
          create(ClipboardServiceStartImageUploadRequestSchema, {
            expectedBase64Length: BigInt(expectedBase64Length)
          })
        ),
        ...(options ? { options } : {})
      })
    )
    return clipboardUploadId(response)
  }

  async appendImageUploadChunk(
    input: { uploadId: string; offset: number; contentBase64: string },
    options?: RuntimeCallOptions
  ): Promise<number> {
    const response = fromBinary(
      ClipboardServiceChunkReceivedResponseSchema,
      await this.transport.unary({
        method: APPEND_IMAGE_UPLOAD_CHUNK_PROCEDURE,
        payload: toBinary(
          ClipboardServiceAppendImageUploadChunkRequestSchema,
          create(ClipboardServiceAppendImageUploadChunkRequestSchema, {
            uploadId: input.uploadId,
            offset: BigInt(input.offset),
            contentBase64: input.contentBase64
          })
        ),
        ...(options ? { options } : {})
      })
    )
    return clipboardChunkReceivedLength(response)
  }

  async commitImageUpload(uploadId: string, options?: RuntimeCallOptions): Promise<string> {
    const response = fromBinary(
      ClipboardServiceSavedImagePathResponseSchema,
      await this.transport.unary({
        method: COMMIT_IMAGE_UPLOAD_PROCEDURE,
        payload: toBinary(
          ClipboardServiceCommitImageUploadRequestSchema,
          create(ClipboardServiceCommitImageUploadRequestSchema, { uploadId })
        ),
        ...(options ? { options } : {})
      })
    )
    return clipboardSavedImagePath(response)
  }

  async abortImageUpload(uploadId: string, options?: RuntimeCallOptions): Promise<boolean> {
    const response = fromBinary(
      ClipboardServiceUploadAbortedResponseSchema,
      await this.transport.unary({
        method: ABORT_IMAGE_UPLOAD_PROCEDURE,
        payload: toBinary(
          ClipboardServiceAbortImageUploadRequestSchema,
          create(ClipboardServiceAbortImageUploadRequestSchema, { uploadId })
        ),
        ...(options ? { options } : {})
      })
    )
    return response.aborted
  }

  async saveImageAsTempFile(contentBase64: string, options?: RuntimeCallOptions): Promise<string> {
    const response = fromBinary(
      ClipboardServiceSavedImagePathResponseSchema,
      await this.transport.unary({
        method: SAVE_IMAGE_AS_TEMP_FILE_PROCEDURE,
        payload: toBinary(
          ClipboardServiceSaveImageAsTempFileRequestSchema,
          create(ClipboardServiceSaveImageAsTempFileRequestSchema, { contentBase64 })
        ),
        ...(options ? { options } : {})
      })
    )
    return clipboardSavedImagePath(response)
  }
}

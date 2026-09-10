import { fromBinary, toBinary, create } from '@bufbuild/protobuf'

import {
  FilesService,
  FilesServiceCommitUploadRequestSchema,
  FilesServiceCommitUploadResponseSchema,
  FilesServiceCopyRequestSchema,
  FilesServiceCopyResponseSchema,
  FilesServiceCreateDirectoryNoClobberRequestSchema,
  FilesServiceCreateDirectoryNoClobberResponseSchema,
  FilesServiceCreateDirectoryRequestSchema,
  FilesServiceCreateDirectoryResponseSchema,
  FilesServiceCreateFileRequestSchema,
  FilesServiceCreateFileResponseSchema,
  FilesServiceDeleteRequestSchema,
  FilesServiceDeleteResponseSchema,
  FilesServiceRenameRequestSchema,
  FilesServiceRenameResponseSchema,
  FilesServiceWriteBase64ChunkRequestSchema,
  FilesServiceWriteBase64ChunkResponseSchema,
  FilesServiceWriteBase64RequestSchema,
  FilesServiceWriteBase64ResponseSchema,
  FilesServiceWriteRequestSchema,
  FilesServiceWriteResponseSchema
} from '../../generated/agent_start/runtime/v1/files_pb.js'
import { assertMutationOk } from '../files-mutation-result.js'
import type { RuntimeCallOptions } from '../transport.js'
import { base64ToBytes } from './base64.js'
import { FilesReadClient } from './read-client.js'

const WRITE_PROCEDURE = `/${FilesService.typeName}/${FilesService.method.write.name}`
const WRITE_BASE64_PROCEDURE = `/${FilesService.typeName}/${FilesService.method.writeBase64.name}`
const WRITE_BASE64_CHUNK_PROCEDURE = `/${FilesService.typeName}/${FilesService.method.writeBase64Chunk.name}`
const CREATE_FILE_PROCEDURE = `/${FilesService.typeName}/${FilesService.method.createFile.name}`
const CREATE_DIRECTORY_PROCEDURE = `/${FilesService.typeName}/${FilesService.method.createDirectory.name}`
const CREATE_DIRECTORY_NO_CLOBBER_PROCEDURE = `/${FilesService.typeName}/${FilesService.method.createDirectoryNoClobber.name}`
const COMMIT_UPLOAD_PROCEDURE = `/${FilesService.typeName}/${FilesService.method.commitUpload.name}`
const RENAME_PROCEDURE = `/${FilesService.typeName}/${FilesService.method.rename.name}`
const COPY_PROCEDURE = `/${FilesService.typeName}/${FilesService.method.copy.name}`
const DELETE_PROCEDURE = `/${FilesService.typeName}/${FilesService.method.delete.name}`

export class FilesWriteClient extends FilesReadClient {
  async write(
    input: Readonly<{ worktree: string; relativePath: string; content: string }>,
    options?: RuntimeCallOptions
  ): Promise<void> {
    const response = await this.transport.unary({
      method: WRITE_PROCEDURE,
      payload: toBinary(
        FilesServiceWriteRequestSchema,
        create(FilesServiceWriteRequestSchema, input)
      ),
      ...(options ? { options } : {})
    })
    assertMutationOk(fromBinary(FilesServiceWriteResponseSchema, response).result, 'files.write')
  }

  async writeBase64(
    input: Readonly<{ worktree: string; relativePath: string; contentBase64: string }>,
    options?: RuntimeCallOptions
  ): Promise<void> {
    const response = await this.transport.unary({
      method: WRITE_BASE64_PROCEDURE,
      payload: toBinary(
        FilesServiceWriteBase64RequestSchema,
        create(FilesServiceWriteBase64RequestSchema, {
          worktree: input.worktree,
          relativePath: input.relativePath,
          content: base64ToBytes(input.contentBase64)
        })
      ),
      ...(options ? { options } : {})
    })
    assertMutationOk(
      fromBinary(FilesServiceWriteBase64ResponseSchema, response).result,
      'files.writeBase64'
    )
  }

  async writeBase64Chunk(
    input: Readonly<{
      worktree: string
      relativePath: string
      contentBase64: string
      append: boolean
    }>,
    options?: RuntimeCallOptions
  ): Promise<void> {
    const response = await this.transport.unary({
      method: WRITE_BASE64_CHUNK_PROCEDURE,
      payload: toBinary(
        FilesServiceWriteBase64ChunkRequestSchema,
        create(FilesServiceWriteBase64ChunkRequestSchema, {
          worktree: input.worktree,
          relativePath: input.relativePath,
          content: base64ToBytes(input.contentBase64),
          append: input.append
        })
      ),
      ...(options ? { options } : {})
    })
    assertMutationOk(
      fromBinary(FilesServiceWriteBase64ChunkResponseSchema, response).result,
      'files.writeBase64Chunk'
    )
  }

  async createFile(
    worktree: string,
    relativePath: string,
    options?: RuntimeCallOptions
  ): Promise<void> {
    const response = await this.transport.unary({
      method: CREATE_FILE_PROCEDURE,
      payload: toBinary(
        FilesServiceCreateFileRequestSchema,
        create(FilesServiceCreateFileRequestSchema, { worktree, relativePath })
      ),
      ...(options ? { options } : {})
    })
    assertMutationOk(
      fromBinary(FilesServiceCreateFileResponseSchema, response).result,
      'files.createFile'
    )
  }

  async createDirectory(
    worktree: string,
    relativePath: string,
    options?: RuntimeCallOptions
  ): Promise<void> {
    const response = await this.transport.unary({
      method: CREATE_DIRECTORY_PROCEDURE,
      payload: toBinary(
        FilesServiceCreateDirectoryRequestSchema,
        create(FilesServiceCreateDirectoryRequestSchema, { worktree, relativePath })
      ),
      ...(options ? { options } : {})
    })
    assertMutationOk(
      fromBinary(FilesServiceCreateDirectoryResponseSchema, response).result,
      'files.createDirectory'
    )
  }

  async createDirectoryNoClobber(
    worktree: string,
    relativePath: string,
    options?: RuntimeCallOptions
  ): Promise<void> {
    const response = await this.transport.unary({
      method: CREATE_DIRECTORY_NO_CLOBBER_PROCEDURE,
      payload: toBinary(
        FilesServiceCreateDirectoryNoClobberRequestSchema,
        create(FilesServiceCreateDirectoryNoClobberRequestSchema, { worktree, relativePath })
      ),
      ...(options ? { options } : {})
    })
    assertMutationOk(
      fromBinary(FilesServiceCreateDirectoryNoClobberResponseSchema, response).result,
      'files.createDirectoryNoClobber'
    )
  }

  async commitUpload(
    input: Readonly<{ worktree: string; tempRelativePath: string; finalRelativePath: string }>,
    options?: RuntimeCallOptions
  ): Promise<void> {
    const response = await this.transport.unary({
      method: COMMIT_UPLOAD_PROCEDURE,
      payload: toBinary(
        FilesServiceCommitUploadRequestSchema,
        create(FilesServiceCommitUploadRequestSchema, input)
      ),
      ...(options ? { options } : {})
    })
    assertMutationOk(
      fromBinary(FilesServiceCommitUploadResponseSchema, response).result,
      'files.commitUpload'
    )
  }

  async rename(
    input: Readonly<{ worktree: string; oldRelativePath: string; newRelativePath: string }>,
    options?: RuntimeCallOptions
  ): Promise<void> {
    const response = await this.transport.unary({
      method: RENAME_PROCEDURE,
      payload: toBinary(
        FilesServiceRenameRequestSchema,
        create(FilesServiceRenameRequestSchema, input)
      ),
      ...(options ? { options } : {})
    })
    assertMutationOk(fromBinary(FilesServiceRenameResponseSchema, response).result, 'files.rename')
  }

  async copy(
    input: Readonly<{
      worktree: string
      sourceRelativePath: string
      destinationRelativePath: string
    }>,
    options?: RuntimeCallOptions
  ): Promise<void> {
    const response = await this.transport.unary({
      method: COPY_PROCEDURE,
      payload: toBinary(
        FilesServiceCopyRequestSchema,
        create(FilesServiceCopyRequestSchema, input)
      ),
      ...(options ? { options } : {})
    })
    assertMutationOk(fromBinary(FilesServiceCopyResponseSchema, response).result, 'files.copy')
  }

  async delete(
    input: Readonly<{ worktree: string; relativePath: string; recursive?: boolean }>,
    options?: RuntimeCallOptions
  ): Promise<void> {
    const response = await this.transport.unary({
      method: DELETE_PROCEDURE,
      payload: toBinary(
        FilesServiceDeleteRequestSchema,
        create(FilesServiceDeleteRequestSchema, {
          worktree: input.worktree,
          relativePath: input.relativePath,
          recursive: input.recursive ?? false
        })
      ),
      ...(options ? { options } : {})
    })
    assertMutationOk(fromBinary(FilesServiceDeleteResponseSchema, response).result, 'files.delete')
  }
}

import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import { StatusCode } from '../generated/yiru/protocol/v1/errors_pb.js'
import {
  ShellFilesService,
  ShellFilesServiceAuthorizeExternalPathRequestSchema,
  ShellFilesServiceAuthorizeExternalPathResponseSchema,
  ShellFilesServiceCopyRequestSchema,
  ShellFilesServiceCopyResponseSchema,
  ShellFilesServiceCreateDirectoryRequestSchema,
  ShellFilesServiceCreateDirectoryResponseSchema,
  ShellFilesServiceCreateFileRequestSchema,
  ShellFilesServiceCreateFileResponseSchema,
  ShellFilesServiceDeleteRequestSchema,
  ShellFilesServiceDeleteResponseSchema,
  ShellFilesServicePathExistsRequestSchema,
  ShellFilesServicePathExistsResponseSchema,
  ShellFilesServiceReadChunkRequestSchema,
  ShellFilesServiceReadChunkResponseSchema,
  ShellFilesServiceReadRequestSchema,
  ShellFilesServiceReadResponseSchema,
  ShellFilesServiceRenameRequestSchema,
  ShellFilesServiceRenameResponseSchema,
  ShellFilesServiceResolveDroppedPathsForAgentRequestSchema,
  ShellFilesServiceResolveDroppedPathsForAgentResponseSchema,
  ShellFilesServiceStageExternalPathsForRuntimeUploadRequestSchema,
  ShellFilesServiceStageExternalPathsForRuntimeUploadResponseSchema,
  ShellFilesServiceStatRequestSchema,
  ShellFilesServiceStatResponseSchema,
  ShellFilesServiceWriteRequestSchema,
  ShellFilesServiceWriteResponseSchema
} from '../generated/yiru/runtime/v1/shell_files_pb.js'
import { RuntimeProtocolError } from './error.js'
import {
  shellFileReadChunkResult,
  shellFileReadResult,
  shellFileStatResult,
  shellResolveDroppedPathsResult,
  shellStageExternalPathsResult,
  type ShellFileReadChunkResult,
  type ShellFileReadResult,
  type ShellFileStatResult,
  type ShellResolveDroppedPathsResult,
  type ShellStageExternalPathsResult
} from './shell-files-values.js'
import type { RuntimeCallOptions, RuntimeTransport } from './transport.js'

const AUTHORIZE_EXTERNAL_PATH_PROCEDURE = `/${ShellFilesService.typeName}/${ShellFilesService.method.authorizeExternalPath.name}`
const COPY_PROCEDURE = `/${ShellFilesService.typeName}/${ShellFilesService.method.copy.name}`
const CREATE_DIRECTORY_PROCEDURE = `/${ShellFilesService.typeName}/${ShellFilesService.method.createDirectory.name}`
const CREATE_FILE_PROCEDURE = `/${ShellFilesService.typeName}/${ShellFilesService.method.createFile.name}`
const DELETE_PROCEDURE = `/${ShellFilesService.typeName}/${ShellFilesService.method.delete.name}`
const PATH_EXISTS_PROCEDURE = `/${ShellFilesService.typeName}/${ShellFilesService.method.pathExists.name}`
const READ_PROCEDURE = `/${ShellFilesService.typeName}/${ShellFilesService.method.read.name}`
const READ_CHUNK_PROCEDURE = `/${ShellFilesService.typeName}/${ShellFilesService.method.readChunk.name}`
const RENAME_PROCEDURE = `/${ShellFilesService.typeName}/${ShellFilesService.method.rename.name}`
const RESOLVE_DROPPED_PATHS_FOR_AGENT_PROCEDURE = `/${ShellFilesService.typeName}/${ShellFilesService.method.resolveDroppedPathsForAgent.name}`
const STAGE_EXTERNAL_PATHS_FOR_RUNTIME_UPLOAD_PROCEDURE = `/${ShellFilesService.typeName}/${ShellFilesService.method.stageExternalPathsForRuntimeUpload.name}`
const STAT_PROCEDURE = `/${ShellFilesService.typeName}/${ShellFilesService.method.stat.name}`
const WRITE_PROCEDURE = `/${ShellFilesService.typeName}/${ShellFilesService.method.write.name}`

export type {
  ShellFileImportSkipReason,
  ShellFileReadChunkResult,
  ShellFileReadResult,
  ShellFileStatResult,
  ShellResolveDroppedPathsResult,
  ShellStagedExternalImportEntry,
  ShellStagedExternalImportSource,
  ShellStageExternalPathsResult
} from './shell-files-values.js'
export { SHELL_FILES_PROTOCOL_CAPABILITY } from './shell-files-values.js'

// Why: OS file dialogs address the Chrome host, regardless of the selected runtime environment.
export class ShellFilesClient {
  private readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  async authorizeExternalPath(targetPath: string, options?: RuntimeCallOptions): Promise<void> {
    const response = await this.transport.unary({
      method: AUTHORIZE_EXTERNAL_PATH_PROCEDURE,
      payload: toBinary(
        ShellFilesServiceAuthorizeExternalPathRequestSchema,
        create(ShellFilesServiceAuthorizeExternalPathRequestSchema, { targetPath })
      ),
      ...(options ? { options } : {})
    })
    assertOk(
      fromBinary(ShellFilesServiceAuthorizeExternalPathResponseSchema, response).result,
      'shell.files.authorizeExternalPath'
    )
  }

  async copy(
    sourcePath: string,
    destinationPath: string,
    options?: RuntimeCallOptions
  ): Promise<void> {
    const response = await this.transport.unary({
      method: COPY_PROCEDURE,
      payload: toBinary(
        ShellFilesServiceCopyRequestSchema,
        create(ShellFilesServiceCopyRequestSchema, { sourcePath, destinationPath })
      ),
      ...(options ? { options } : {})
    })
    assertOk(fromBinary(ShellFilesServiceCopyResponseSchema, response).result, 'shell.files.copy')
  }

  async createDirectory(directoryPath: string, options?: RuntimeCallOptions): Promise<void> {
    const response = await this.transport.unary({
      method: CREATE_DIRECTORY_PROCEDURE,
      payload: toBinary(
        ShellFilesServiceCreateDirectoryRequestSchema,
        create(ShellFilesServiceCreateDirectoryRequestSchema, { directoryPath })
      ),
      ...(options ? { options } : {})
    })
    assertOk(
      fromBinary(ShellFilesServiceCreateDirectoryResponseSchema, response).result,
      'shell.files.createDirectory'
    )
  }

  async createFile(filePath: string, options?: RuntimeCallOptions): Promise<void> {
    const response = await this.transport.unary({
      method: CREATE_FILE_PROCEDURE,
      payload: toBinary(
        ShellFilesServiceCreateFileRequestSchema,
        create(ShellFilesServiceCreateFileRequestSchema, { filePath })
      ),
      ...(options ? { options } : {})
    })
    assertOk(
      fromBinary(ShellFilesServiceCreateFileResponseSchema, response).result,
      'shell.files.createFile'
    )
  }

  async delete(
    targetPath: string,
    recursive: boolean,
    options?: RuntimeCallOptions
  ): Promise<void> {
    const response = await this.transport.unary({
      method: DELETE_PROCEDURE,
      payload: toBinary(
        ShellFilesServiceDeleteRequestSchema,
        create(ShellFilesServiceDeleteRequestSchema, { targetPath, recursive })
      ),
      ...(options ? { options } : {})
    })
    assertOk(
      fromBinary(ShellFilesServiceDeleteResponseSchema, response).result,
      'shell.files.delete'
    )
  }

  async pathExists(filePath: string, options?: RuntimeCallOptions): Promise<boolean> {
    const response = await this.transport.unary({
      method: PATH_EXISTS_PROCEDURE,
      payload: toBinary(
        ShellFilesServicePathExistsRequestSchema,
        create(ShellFilesServicePathExistsRequestSchema, { filePath })
      ),
      ...(options ? { options } : {})
    })
    return fromBinary(ShellFilesServicePathExistsResponseSchema, response).exists
  }

  async read(
    filePath: string,
    includeLocalLogMetadata: boolean,
    options?: RuntimeCallOptions
  ): Promise<ShellFileReadResult> {
    const response = await this.transport.unary({
      method: READ_PROCEDURE,
      payload: toBinary(
        ShellFilesServiceReadRequestSchema,
        create(ShellFilesServiceReadRequestSchema, { filePath, includeLocalLogMetadata })
      ),
      ...(options ? { options } : {})
    })
    return shellFileReadResult(fromBinary(ShellFilesServiceReadResponseSchema, response))
  }

  async readChunk(
    input: Readonly<{ filePath: string; offset: number; length: number }>,
    options?: RuntimeCallOptions
  ): Promise<ShellFileReadChunkResult> {
    const response = await this.transport.unary({
      method: READ_CHUNK_PROCEDURE,
      payload: toBinary(
        ShellFilesServiceReadChunkRequestSchema,
        create(ShellFilesServiceReadChunkRequestSchema, {
          filePath: input.filePath,
          offset: BigInt(input.offset),
          length: input.length
        })
      ),
      ...(options ? { options } : {})
    })
    return shellFileReadChunkResult(fromBinary(ShellFilesServiceReadChunkResponseSchema, response))
  }

  async rename(oldPath: string, newPath: string, options?: RuntimeCallOptions): Promise<void> {
    const response = await this.transport.unary({
      method: RENAME_PROCEDURE,
      payload: toBinary(
        ShellFilesServiceRenameRequestSchema,
        create(ShellFilesServiceRenameRequestSchema, { oldPath, newPath })
      ),
      ...(options ? { options } : {})
    })
    assertOk(
      fromBinary(ShellFilesServiceRenameResponseSchema, response).result,
      'shell.files.rename'
    )
  }

  async resolveDroppedPathsForAgent(
    paths: string[],
    worktreePath: string,
    options?: RuntimeCallOptions
  ): Promise<ShellResolveDroppedPathsResult> {
    const response = await this.transport.unary({
      method: RESOLVE_DROPPED_PATHS_FOR_AGENT_PROCEDURE,
      payload: toBinary(
        ShellFilesServiceResolveDroppedPathsForAgentRequestSchema,
        create(ShellFilesServiceResolveDroppedPathsForAgentRequestSchema, { paths, worktreePath })
      ),
      ...(options ? { options } : {})
    })
    return shellResolveDroppedPathsResult(
      fromBinary(ShellFilesServiceResolveDroppedPathsForAgentResponseSchema, response)
    )
  }

  async stageExternalPathsForRuntimeUpload(
    sourcePaths: string[],
    options?: RuntimeCallOptions
  ): Promise<ShellStageExternalPathsResult> {
    const response = await this.transport.unary({
      method: STAGE_EXTERNAL_PATHS_FOR_RUNTIME_UPLOAD_PROCEDURE,
      payload: toBinary(
        ShellFilesServiceStageExternalPathsForRuntimeUploadRequestSchema,
        create(ShellFilesServiceStageExternalPathsForRuntimeUploadRequestSchema, { sourcePaths })
      ),
      ...(options ? { options } : {})
    })
    return shellStageExternalPathsResult(
      fromBinary(ShellFilesServiceStageExternalPathsForRuntimeUploadResponseSchema, response)
    )
  }

  async stat(filePath: string, options?: RuntimeCallOptions): Promise<ShellFileStatResult> {
    const response = await this.transport.unary({
      method: STAT_PROCEDURE,
      payload: toBinary(
        ShellFilesServiceStatRequestSchema,
        create(ShellFilesServiceStatRequestSchema, { filePath })
      ),
      ...(options ? { options } : {})
    })
    return shellFileStatResult(fromBinary(ShellFilesServiceStatResponseSchema, response))
  }

  async write(filePath: string, content: string, options?: RuntimeCallOptions): Promise<void> {
    const response = await this.transport.unary({
      method: WRITE_PROCEDURE,
      payload: toBinary(
        ShellFilesServiceWriteRequestSchema,
        create(ShellFilesServiceWriteRequestSchema, { filePath, content })
      ),
      ...(options ? { options } : {})
    })
    assertOk(fromBinary(ShellFilesServiceWriteResponseSchema, response).result, 'shell.files.write')
  }
}

// Why: `ShellFilesMutationResult.ok` is the only success signal these RPCs
// return; a void-returning client method must surface it instead of
// discarding it, or a rejected mutation looks like it succeeded.
function assertOk(result: { ok: boolean } | undefined, action: string): void {
  if (!result?.ok) {
    throw new RuntimeProtocolError(StatusCode.UNKNOWN, `${action} did not report success`)
  }
}

import { fromBinary, toBinary, create } from '@bufbuild/protobuf'

import {
  FilesService,
  FilesServiceReadTerminalArtifactPreviewRequestSchema,
  FilesServiceReadTerminalArtifactPreviewResponseSchema,
  FilesServiceReadTerminalArtifactRequestSchema,
  FilesServiceReadTerminalArtifactResponseSchema,
  FilesServiceResolveTerminalPathRequestSchema,
  FilesServiceResolveTerminalPathResponseSchema,
  FilesServiceWriteTerminalArtifactRequestSchema,
  FilesServiceWriteTerminalArtifactResponseSchema
} from '../../generated/agent_start/runtime/v1/files_pb.js'
import { assertMutationOk } from '../files-mutation-result.js'
import type { RuntimeCallOptions } from '../transport.js'
import { terminalPathResolution } from './terminal-path-values.js'
import type { TerminalPathResolution } from './terminal-path-values.js'
import { filePreviewResult, fileReadResult } from './values.js'
import type { FilePreviewResult, FileReadResult } from './values.js'
import { FilesWriteClient } from './write-client.js'

const RESOLVE_TERMINAL_PATH_PROCEDURE = `/${FilesService.typeName}/${FilesService.method.resolveTerminalPath.name}`
const READ_TERMINAL_ARTIFACT_PROCEDURE = `/${FilesService.typeName}/${FilesService.method.readTerminalArtifact.name}`
const READ_TERMINAL_ARTIFACT_PREVIEW_PROCEDURE = `/${FilesService.typeName}/${FilesService.method.readTerminalArtifactPreview.name}`
const WRITE_TERMINAL_ARTIFACT_PROCEDURE = `/${FilesService.typeName}/${FilesService.method.writeTerminalArtifact.name}`

export class FilesArtifactClient extends FilesWriteClient {
  async resolveTerminalPath(
    input: Readonly<{ worktree: string; pathText: string; cwd?: string; terminal?: string }>,
    options?: RuntimeCallOptions
  ): Promise<TerminalPathResolution> {
    const response = await this.transport.unary({
      method: RESOLVE_TERMINAL_PATH_PROCEDURE,
      payload: toBinary(
        FilesServiceResolveTerminalPathRequestSchema,
        create(FilesServiceResolveTerminalPathRequestSchema, input)
      ),
      ...(options ? { options } : {})
    })
    return terminalPathResolution(
      fromBinary(FilesServiceResolveTerminalPathResponseSchema, response).result
    )
  }

  async readTerminalArtifact(
    input: Readonly<{ worktree: string; grantId: string; absolutePath: string }>,
    options?: RuntimeCallOptions
  ): Promise<FileReadResult> {
    const response = await this.transport.unary({
      method: READ_TERMINAL_ARTIFACT_PROCEDURE,
      payload: toBinary(
        FilesServiceReadTerminalArtifactRequestSchema,
        create(FilesServiceReadTerminalArtifactRequestSchema, input)
      ),
      ...(options ? { options } : {})
    })
    return fileReadResult(
      fromBinary(FilesServiceReadTerminalArtifactResponseSchema, response).result
    )
  }

  async readTerminalArtifactPreview(
    input: Readonly<{ worktree: string; grantId: string; absolutePath: string }>,
    options?: RuntimeCallOptions
  ): Promise<FilePreviewResult> {
    const response = await this.transport.unary({
      method: READ_TERMINAL_ARTIFACT_PREVIEW_PROCEDURE,
      payload: toBinary(
        FilesServiceReadTerminalArtifactPreviewRequestSchema,
        create(FilesServiceReadTerminalArtifactPreviewRequestSchema, input)
      ),
      ...(options ? { options } : {})
    })
    return filePreviewResult(
      fromBinary(FilesServiceReadTerminalArtifactPreviewResponseSchema, response).result
    )
  }

  async writeTerminalArtifact(
    input: Readonly<{ worktree: string; grantId: string; absolutePath: string; content: string }>,
    options?: RuntimeCallOptions
  ): Promise<void> {
    const response = await this.transport.unary({
      method: WRITE_TERMINAL_ARTIFACT_PROCEDURE,
      payload: toBinary(
        FilesServiceWriteTerminalArtifactRequestSchema,
        create(FilesServiceWriteTerminalArtifactRequestSchema, input)
      ),
      ...(options ? { options } : {})
    })
    assertMutationOk(
      fromBinary(FilesServiceWriteTerminalArtifactResponseSchema, response).result,
      'files.writeTerminalArtifact'
    )
  }
}

import type { FileReadChunkResult } from '@agentstart/protocol'
import { translate } from '~renderer/i18n/i18n'

import { requireFilesTarget } from '../files-target'
import {
  getRuntimeFileArgs,
  hasRemoteRuntimeOwner,
  type RuntimeFileArgs,
  type RuntimeFileDownloadResult,
  type RuntimeFileOperationArgs
} from './context'
import { readRuntimeFilePreview } from './read'
import { shellFilesClient } from './shell-files'

const REMOTE_DOWNLOAD_CHUNK_BYTES = 384 * 1024

export async function downloadRuntimeFile(
  context: RuntimeFileOperationArgs,
  filePath: string,
  suggestedName: string
): Promise<RuntimeFileDownloadResult> {
  const runtimeArgs = getRuntimeFileArgs(context, filePath)
  if (!runtimeArgs) {
    if (hasRemoteRuntimeOwner(context)) {
      throw new Error(
        translate('runtime.file.outsideOwner', 'Remote file is outside the owning runtime worktree')
      )
    }
    const result = await readRuntimeFilePreview(context, filePath)
    return shellFilesClient.saveDownloadedFile({
      suggestedName,
      content: result.content,
      encoding: result.isBinary ? 'base64' : 'utf8'
    })
  }

  const download = await shellFilesClient.startDownloadedFile({ suggestedName })
  let finished = false
  try {
    let offset = 0
    for (;;) {
      const chunk = await readRemoteDownloadChunk(runtimeArgs, offset)
      if (chunk.bytesRead > 0) {
        await shellFilesClient.appendDownloadedFileChunk({
          transferId: download.transferId,
          contentBase64: chunk.contentBase64
        })
      }
      offset += chunk.bytesRead
      if (chunk.eof) {
        break
      }
      if (chunk.bytesRead <= 0) {
        throw new Error(
          translate('runtime.file.downloadStalled', 'Remote download stalled before reaching EOF')
        )
      }
    }
    const result = await shellFilesClient.finishDownloadedFile({
      transferId: download.transferId
    })
    finished = true
    return result
  } finally {
    if (!finished) {
      await shellFilesClient
        .cancelDownloadedFile({ transferId: download.transferId })
        .catch(() => {})
    }
  }
}

export async function streamRuntimeFileDownloadChunks(
  context: RuntimeFileOperationArgs,
  filePath: string,
  consume: (chunk: { contentBase64: string; first: boolean; last: boolean }) => Promise<void>
): Promise<void> {
  const runtimeArgs = getRuntimeFileArgs(context, filePath)
  if (!runtimeArgs) {
    throw new Error(
      translate('runtime.file.outsideOwner', 'Remote file is outside the owning runtime worktree')
    )
  }
  let offset = 0
  let first = true
  for (;;) {
    const chunk = await readRemoteDownloadChunk(runtimeArgs, offset)
    if (chunk.bytesRead <= 0 && !chunk.eof) {
      throw new Error(
        translate('runtime.file.downloadStalled', 'Remote download stalled before reaching EOF')
      )
    }
    await consume({ contentBase64: chunk.contentBase64, first, last: chunk.eof })
    first = false
    offset += chunk.bytesRead
    if (chunk.eof) {
      return
    }
  }
}

async function readRemoteDownloadChunk(
  runtimeArgs: RuntimeFileArgs,
  offset: number
): Promise<FileReadChunkResult> {
  const client = await requireFilesTarget(runtimeArgs.target)
  return client.readChunk(
    {
      worktree: runtimeArgs.worktreeSelector,
      relativePath: runtimeArgs.relativePath,
      offset,
      length: REMOTE_DOWNLOAD_CHUNK_BYTES
    },
    { timeoutMs: 60_000 }
  )
}

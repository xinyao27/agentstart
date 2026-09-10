import type { FileReadChunkResult } from '@agentstart/protocol'

import { requireFilesTarget } from '../files-target'
import { getActiveRuntimeTarget } from '../rpc-client'
import { toRuntimeWorktreeSelector } from '../worktree-selector'
import { canReadRelativeRuntimeFile, type RuntimeFileReadArgs } from './context'
import { shellFilesClient } from './shell-files'

const FILE_PREVIEW_CHUNK_BYTES = 384 * 1024
const FILE_PREVIEW_MAX_BYTES = 512 * 1024 * 1024

export type RuntimeFileBlob = {
  blob: Blob
  byteLength: number
}

export async function readRuntimeFileBlob(
  args: RuntimeFileReadArgs,
  mimeType: string
): Promise<RuntimeFileBlob> {
  const target = getActiveRuntimeTarget(args.settings)
  const runtimeFile =
    args.worktreeId && canReadRelativeRuntimeFile(args.relativePath)
      ? { worktreeId: args.worktreeId, relativePath: args.relativePath }
      : null
  if (!runtimeFile && args.worktreeId && target.kind === 'environment') {
    throw new Error('remote_file_outside_owner')
  }

  const chunks: Uint8Array<ArrayBuffer>[] = []
  let offset = 0
  for (;;) {
    const chunk = runtimeFile
      ? await readRuntimeBlobChunk(
          target,
          toRuntimeWorktreeSelector(runtimeFile.worktreeId),
          runtimeFile.relativePath,
          offset
        )
      : await shellFilesClient.readFileChunk({
          filePath: args.filePath,
          offset,
          length: FILE_PREVIEW_CHUNK_BYTES
        })
    if (chunk.bytesRead <= 0 && !chunk.eof) {
      throw new Error('file_preview_stalled')
    }
    if (offset + chunk.bytesRead > FILE_PREVIEW_MAX_BYTES) {
      throw new Error('file_preview_too_large')
    }
    if (chunk.bytesRead > 0) {
      chunks.push(decodeBase64Chunk(chunk.contentBase64))
    }
    offset += chunk.bytesRead
    if (chunk.eof) {
      return { blob: new Blob(chunks, { type: mimeType }), byteLength: offset }
    }
  }
}

async function readRuntimeBlobChunk(
  target: ReturnType<typeof getActiveRuntimeTarget>,
  worktree: string,
  relativePath: string,
  offset: number
): Promise<FileReadChunkResult> {
  const client = await requireFilesTarget(target)
  return client.readChunk(
    { worktree, relativePath, offset, length: FILE_PREVIEW_CHUNK_BYTES },
    { timeoutMs: 60_000 }
  )
}

function decodeBase64Chunk(contentBase64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(contentBase64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

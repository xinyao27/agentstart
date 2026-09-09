import { RuntimeProtocolError, StatusCode } from '@yiru/protocol'
import type { FilePreviewResult, FileReadResult } from '@yiru/protocol'
import type { DirectoryEntry as DirEntry } from '@yiru/protocol/files/values'
import { translate } from '~renderer/i18n/i18n'

import { requireFilesTarget } from '../files-target'
import { getActiveRuntimeTarget } from '../rpc-client'
import { toRuntimeWorktreeSelector } from '../worktree-selector'
import {
  assertNativeFileFallbackAllowed,
  canReadRelativeRuntimeFile,
  getRuntimeFileArgs,
  hasRemoteRuntimeOwner,
  type RuntimeFileOperationArgs,
  type RuntimeFileReadArgs,
  type RuntimeReadableFileContent
} from './context'
import { shellFilesClient } from './shell-files'

export async function readRuntimeFileContent({
  settings,
  filePath,
  relativePath,
  worktreeId,
  connectionId,
  includeLocalLogMetadata
}: RuntimeFileReadArgs): Promise<RuntimeReadableFileContent> {
  const target = getActiveRuntimeTarget(settings)
  if (!worktreeId || !canReadRelativeRuntimeFile(relativePath)) {
    if (worktreeId && target.kind === 'environment') {
      throw new Error(
        translate('runtime.file.outsideOwner', 'Remote file is outside the owning runtime worktree')
      )
    }
    return shellFilesClient.readFile({ filePath, connectionId, includeLocalLogMetadata })
  }

  const worktree = toRuntimeWorktreeSelector(worktreeId)
  const client = await requireFilesTarget(target)
  let result: FileReadResult
  try {
    result = await client.read(worktree, relativePath, { timeoutMs: 15_000 })
  } catch (error) {
    // Why: files.read rejects binary paths with a typed error; the preview
    // leaf carries the base64 payload needed by image and PDF renderers.
    if (isBinaryFileError(error)) {
      return client.readPreview(worktree, relativePath, { timeoutMs: 15_000 })
    }
    throw error
  }
  if (result.truncated) {
    // Why: saving preview-sized content would overwrite the unread tail.
    throw new Error(
      translate(
        'runtime.file.editorTooLarge',
        'Remote file is too large to open in the editor ({{bytes}} bytes)',
        { bytes: result.byteLength }
      )
    )
  }
  return { content: result.content, isBinary: false }
}

export async function readRuntimeFilePreview(
  context: RuntimeFileOperationArgs,
  filePath: string
): Promise<FilePreviewResult> {
  const runtimeArgs = getRuntimeFileArgs(context, filePath)
  if (!runtimeArgs) {
    if (hasRemoteRuntimeOwner(context)) {
      throw new Error(
        translate('runtime.file.outsideOwner', 'Remote file is outside the owning runtime worktree')
      )
    }
    return shellFilesClient.readFile({ filePath, connectionId: context.connectionId })
  }
  const client = await requireFilesTarget(runtimeArgs.target)
  return client.readPreview(runtimeArgs.worktreeSelector, runtimeArgs.relativePath, {
    timeoutMs: 15_000
  })
}

export async function readRuntimeDirectory(
  context: RuntimeFileOperationArgs,
  dirPath: string
): Promise<DirEntry[]> {
  const runtimeArgs = getRuntimeFileArgs(context, dirPath)
  if (!runtimeArgs) {
    assertNativeFileFallbackAllowed(context)
    throw new Error(
      translate(
        'runtime.file.directoryOutsideOwner',
        'Directory is outside an owning runtime worktree'
      )
    )
  }
  const client = await requireFilesTarget(runtimeArgs.target)
  return client.readDirectory(runtimeArgs.worktreeSelector, runtimeArgs.relativePath, {
    timeoutMs: 15_000
  })
}

export async function statRuntimePath(
  context: RuntimeFileOperationArgs,
  absolutePath: string
): Promise<{ size: number; isDirectory: boolean; mtime: number }> {
  const runtimeArgs = getRuntimeFileArgs(context, absolutePath)
  if (!runtimeArgs) {
    assertNativeFileFallbackAllowed(context)
    return shellFilesClient.stat({ filePath: absolutePath, connectionId: context.connectionId })
  }
  const client = await requireFilesTarget(runtimeArgs.target)
  return client.stat(runtimeArgs.worktreeSelector, runtimeArgs.relativePath, { timeoutMs: 15_000 })
}

export async function runtimePathExists(
  context: RuntimeFileOperationArgs,
  absolutePath: string
): Promise<boolean> {
  const runtimeArgs = getRuntimeFileArgs(context, absolutePath)
  if (!runtimeArgs) {
    assertNativeFileFallbackAllowed(context)
    return shellFilesClient.pathExists({
      filePath: absolutePath,
      connectionId: context.connectionId
    })
  }
  const client = await requireFilesTarget(runtimeArgs.target)
  try {
    await client.stat(runtimeArgs.worktreeSelector, runtimeArgs.relativePath, { timeoutMs: 15_000 })
    return true
  } catch (error) {
    if (error instanceof RuntimeProtocolError && error.code === StatusCode.NOT_FOUND) {
      return false
    }
    throw error
  }
}

function isBinaryFileError(error: unknown): boolean {
  return (
    error instanceof RuntimeProtocolError &&
    error.code === StatusCode.FAILED_PRECONDITION &&
    error.message === 'binary_file'
  )
}

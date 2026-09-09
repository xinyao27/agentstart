import { normalizeRelativePath } from '~renderer/path'

import { requireFilesTarget } from '../files-target'
import { getActiveRuntimeTarget } from '../rpc-client'
import {
  assertNativeFileFallbackAllowed,
  canReadRelativeRuntimeFile,
  getRelativePathInsideWorktree,
  getRuntimeFileArgs,
  getRuntimeFileWorktreeSelector,
  type RuntimeFileOperationArgs
} from './context'
import { shellFilesClient } from './shell-files'

export async function writeRuntimeFile(
  context: RuntimeFileOperationArgs,
  filePath: string,
  content: string
): Promise<void> {
  const runtimeArgs = getRuntimeFileArgs(context, filePath)
  if (!runtimeArgs) {
    assertNativeFileFallbackAllowed(context)
    await shellFilesClient.writeFile({ filePath, content, connectionId: context.connectionId })
    return
  }
  const client = await requireFilesTarget(runtimeArgs.target)
  await client.write(
    { worktree: runtimeArgs.worktreeSelector, relativePath: runtimeArgs.relativePath, content },
    { timeoutMs: 15_000 }
  )
}

export async function createRuntimePath(
  context: RuntimeFileOperationArgs,
  path: string,
  kind: 'file' | 'directory'
): Promise<void> {
  const runtimeArgs = getRuntimeFileArgs(context, path)
  if (!runtimeArgs) {
    assertNativeFileFallbackAllowed(context)
    await (kind === 'directory'
      ? shellFilesClient.createDir({ dirPath: path, connectionId: context.connectionId })
      : shellFilesClient.createFile({ filePath: path, connectionId: context.connectionId }))
    return
  }
  const client = await requireFilesTarget(runtimeArgs.target)
  await (kind === 'directory'
    ? client.createDirectory(runtimeArgs.worktreeSelector, runtimeArgs.relativePath, {
        timeoutMs: 15_000
      })
    : client.createFile(runtimeArgs.worktreeSelector, runtimeArgs.relativePath, {
        timeoutMs: 15_000
      }))
}

export async function renameRuntimePath(
  context: RuntimeFileOperationArgs,
  oldPath: string,
  newPath: string
): Promise<void> {
  const runtimeArgs = getRuntimeFileArgs(context, oldPath)
  const newRelativePath = getRelativePathInsideWorktree(context.worktreePath, newPath)
  if (!runtimeArgs || newRelativePath === null) {
    assertNativeFileFallbackAllowed(context)
    await shellFilesClient.rename({ oldPath, newPath, connectionId: context.connectionId })
    return
  }
  const client = await requireFilesTarget(runtimeArgs.target)
  await client.rename(
    {
      worktree: runtimeArgs.worktreeSelector,
      oldRelativePath: runtimeArgs.relativePath,
      newRelativePath
    },
    { timeoutMs: 15_000 }
  )
}

export async function copyRuntimePath(
  context: RuntimeFileOperationArgs,
  sourcePath: string,
  destinationPath: string
): Promise<void> {
  const sourceArgs = getRuntimeFileArgs(context, sourcePath)
  const destinationArgs = getRuntimeFileArgs(context, destinationPath)
  if (!sourceArgs || !destinationArgs) {
    assertNativeFileFallbackAllowed(context)
    await shellFilesClient.copy({
      sourcePath,
      destinationPath,
      connectionId: context.connectionId
    })
    return
  }
  const client = await requireFilesTarget(sourceArgs.target)
  await client.copy(
    {
      worktree: sourceArgs.worktreeSelector,
      sourceRelativePath: sourceArgs.relativePath,
      destinationRelativePath: destinationArgs.relativePath
    },
    { timeoutMs: 15_000 }
  )
}

export async function deleteRuntimePath(
  context: RuntimeFileOperationArgs,
  targetPath: string,
  recursive?: boolean
): Promise<void> {
  const runtimeArgs = getRuntimeFileArgs(context, targetPath)
  if (!runtimeArgs) {
    assertNativeFileFallbackAllowed(context)
    await shellFilesClient.deletePath({
      targetPath,
      connectionId: context.connectionId,
      recursive
    })
    return
  }
  const client = await requireFilesTarget(runtimeArgs.target)
  await client.delete(
    { worktree: runtimeArgs.worktreeSelector, relativePath: runtimeArgs.relativePath, recursive },
    { timeoutMs: 15_000 }
  )
}

export async function deleteRuntimeRelativePath(
  context: RuntimeFileOperationArgs,
  relativePath: string,
  recursive?: boolean
): Promise<boolean> {
  const worktree = getRuntimeFileWorktreeSelector(context)
  if (!worktree || !canReadRelativeRuntimeFile(relativePath)) {
    return false
  }
  const client = await requireFilesTarget(getActiveRuntimeTarget(context.settings))
  await client.delete(
    { worktree, relativePath: normalizeRelativePath(relativePath), recursive },
    { timeoutMs: 15_000 }
  )
  return true
}

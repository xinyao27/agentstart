import { isWindowsAbsolutePathLike, relativePathInsideRoot } from '@yiru/protocol/host/path'
import type { GlobalSettings } from '@yiru/protocol/settings/global/model'

import { getActiveRuntimeTarget } from '../rpc-client'
import type { RuntimeClientTarget } from '../runtime-target'
import { toRuntimeWorktreePathSelector, toRuntimeWorktreeSelector } from '../worktree-selector'

export type RuntimeReadableFileContent = {
  content: string
  isBinary: boolean
  isImage?: boolean
  mimeType?: string
  fileIdentity?: string
}

export type RuntimeFileReadArgs = {
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined
  filePath: string
  relativePath?: string
  worktreeId?: string
  connectionId?: string
  includeLocalLogMetadata?: boolean
}

export type RuntimeFileOperationArgs = {
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined
  worktreeId: string | null | undefined
  worktreePath: string | null | undefined
  connectionId?: string
}

export type RuntimeFileDownloadResult = { destinationPath: string }

export type RuntimeFileArgs = {
  target: RuntimeClientTarget
  worktreeSelector: string
  relativePath: string
}

export function getRuntimeFileReadScope(
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined,
  connectionId: string | undefined
): string | undefined {
  const target = getActiveRuntimeTarget(settings)
  return target.kind === 'environment' ? `runtime:${target.environmentId}` : connectionId
}

export function canReadRelativeRuntimeFile(
  relativePath: string | undefined
): relativePath is string {
  return Boolean(relativePath && relativePath.trim() && !isAbsolutePathLike(relativePath))
}

export function getRuntimeFileArgs(
  context: RuntimeFileOperationArgs,
  absolutePath: string
): RuntimeFileArgs | null {
  const worktreeSelector = getRuntimeFileWorktreeSelector(context)
  if (!worktreeSelector) {
    return null
  }
  const relativePath = getRelativePathInsideWorktree(context.worktreePath, absolutePath)
  if (relativePath === null) {
    return null
  }
  return {
    target: getActiveRuntimeTarget(context.settings),
    worktreeSelector,
    relativePath
  }
}

export function getRuntimeFileWorktreeSelector(context: RuntimeFileOperationArgs): string | null {
  if (context.worktreeId) {
    return toRuntimeWorktreeSelector(context.worktreeId)
  }
  return context.worktreePath ? toRuntimeWorktreePathSelector(context.worktreePath) : null
}

export function hasRemoteRuntimeOwner(context: RuntimeFileOperationArgs): boolean {
  return (
    getActiveRuntimeTarget(context.settings).kind === 'environment' &&
    Boolean(getRuntimeFileWorktreeSelector(context))
  )
}

export function assertNativeFileFallbackAllowed(context: RuntimeFileOperationArgs): void {
  if (hasRemoteRuntimeOwner(context)) {
    throw new Error('Remote file is outside the owning runtime worktree')
  }
}

export function getRelativePathInsideWorktree(
  worktreePath: string | null | undefined,
  absolutePath: string
): string | null {
  if (!worktreePath) {
    return null
  }
  return relativePathInsideRoot(worktreePath, absolutePath)
}

export function isRemoteRuntimeFileOperation(
  context: RuntimeFileOperationArgs,
  path: string
): boolean {
  return getRuntimeFileArgs(context, path) !== null
}

function isAbsolutePathLike(value: string): boolean {
  return value.startsWith('/') || isWindowsAbsolutePathLike(value)
}

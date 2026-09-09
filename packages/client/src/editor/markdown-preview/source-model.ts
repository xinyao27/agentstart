import { relativePathInsideRoot } from '@yiru/protocol/host/path'
import type { Worktree } from '@yiru/protocol/worktree/model'
import type { HttpLinkSourceOwner } from '~renderer/editor/http-link-routing'
import { dirname } from '~renderer/path'
import { getConnectionIdForFile } from '~renderer/runtime/connection-context'
import { findWorktreeById } from '~renderer/worktree/state/types'

export type MarkdownPreviewSourceOpenFile = {
  id: string
  filePath: string
  relativePath: string
  worktreeId: string
  runtimeEnvironmentId?: string | null
  mode: string
  markdownPreviewSourceFileId?: string
}

export function findMarkdownPreviewSourceOpenFile(
  openFiles: MarkdownPreviewSourceOpenFile[],
  params: {
    sourceFileId: string | null
    filePath: string
    sourceWorktreeId: string | null
    sourceRuntimeEnvironmentId: string | null | undefined
  }
): MarkdownPreviewSourceOpenFile | undefined {
  const ownerMatches = (file: MarkdownPreviewSourceOpenFile): boolean =>
    (!params.sourceWorktreeId || file.worktreeId === params.sourceWorktreeId) &&
    (params.sourceRuntimeEnvironmentId === undefined ||
      (file.runtimeEnvironmentId ?? null) === (params.sourceRuntimeEnvironmentId ?? null))

  if (params.sourceFileId) {
    const idMatch = openFiles.find((file) => file.id === params.sourceFileId && ownerMatches(file))
    return (
      idMatch ??
      openFiles.find(
        (file) =>
          file.mode === 'markdown-preview' &&
          file.filePath === params.filePath &&
          file.markdownPreviewSourceFileId === params.sourceFileId &&
          ownerMatches(file)
      ) ??
      openFiles.find((file) => file.id === params.sourceFileId)
    )
  }
  return openFiles.find((file) => file.filePath === params.filePath && ownerMatches(file))
}

export function findMarkdownPreviewOpenedEditFileId(
  openFiles: MarkdownPreviewSourceOpenFile[],
  activeFileIdByWorktree: Record<string, string | null>,
  params: { filePath: string; worktreeId: string }
): string {
  const activeFileId = activeFileIdByWorktree[params.worktreeId]
  const activeFile = openFiles.find(
    (file) =>
      file.id === activeFileId &&
      file.filePath === params.filePath &&
      file.worktreeId === params.worktreeId &&
      file.mode === 'edit'
  )
  if (activeFile) {
    return activeFile.id
  }
  return (
    openFiles.find(
      (file) =>
        file.filePath === params.filePath &&
        file.worktreeId === params.worktreeId &&
        file.mode === 'edit'
    )?.id ?? params.filePath
  )
}

export function deriveMarkdownPreviewSourceRoot(
  filePath: string,
  relativePath: string | null | undefined
): string {
  const normalizedFilePath = normalizeAbsolutePath(filePath)
  const normalizedRelativePath =
    relativePath && !isAbsolutePathLike(relativePath) ? normalizeRelativePath(relativePath) : ''
  if (normalizedRelativePath) {
    const suffix = `/${normalizedRelativePath}`
    if (normalizedFilePath.endsWith(suffix)) {
      return formatRootPath(normalizedFilePath.slice(0, -suffix.length))
    }
  }
  return formatRootPath(normalizeAbsolutePath(dirname(filePath)))
}

export function findMarkdownPreviewTargetWorktree(
  worktreesByRepo: Record<string, Worktree[]>,
  absolutePath: string,
  sourceWorktree: Worktree | null,
  sourceOwner: HttpLinkSourceOwner
): Worktree | null {
  if (sourceWorktree && relativePathInsideRoot(sourceWorktree.path, absolutePath) !== null) {
    return sourceWorktree
  }
  return findWorktreeForPath(worktreesByRepo, absolutePath, (worktree) => {
    const connectionId = getConnectionIdForFile(worktree.id, absolutePath)
    if (sourceOwner.kind === 'local') {
      return connectionId === null
    }
    if (sourceOwner.kind === 'ssh') {
      return connectionId === sourceOwner.connectionId
    }
    return false
  })
}

export function resolveMarkdownPreviewSourceWorktree(
  worktreesByRepo: Record<string, Worktree[]>,
  sourceWorktreeId: string | null | undefined,
  filePath: string
): Worktree | null {
  const sourceWorktree = sourceWorktreeId
    ? (findWorktreeById(worktreesByRepo, sourceWorktreeId) ?? null)
    : null
  return sourceWorktree ?? findWorktreeForPath(worktreesByRepo, filePath)
}

export function getMarkdownPreviewSourceRelativePath(
  filePath: string,
  sourceWorktreePath: string
): string | null {
  return relativePathInsideRoot(sourceWorktreePath, filePath)
}

function findWorktreeForPath(
  worktreesByRepo: Record<string, Worktree[]>,
  absolutePath: string,
  acceptsWorktree: (worktree: Worktree) => boolean = () => true
): Worktree | null {
  let bestMatch: Worktree | null = null
  let bestMatchLength = -1
  for (const worktrees of Object.values(worktreesByRepo)) {
    for (const worktree of worktrees) {
      if (
        acceptsWorktree(worktree) &&
        relativePathInsideRoot(worktree.path, absolutePath) !== null
      ) {
        const pathLength = normalizeAbsolutePath(worktree.path).length
        if (pathLength > bestMatchLength) {
          bestMatch = worktree
          bestMatchLength = pathLength
        }
      }
    }
  }
  return bestMatch
}

function normalizeAbsolutePath(path: string): string {
  return path.replaceAll('\\', '/')
}

function normalizeRelativePath(path: string): string {
  return path.replaceAll('\\', '/').replace(/^\/+/, '')
}

function isAbsolutePathLike(path: string): boolean {
  return path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path) || path.startsWith('\\\\')
}

function formatRootPath(rootPath: string): string {
  if (rootPath === '') {
    return '/'
  }
  return /^[A-Za-z]:$/.test(rootPath) ? `${rootPath}/` : rootPath
}

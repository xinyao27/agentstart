import type { GitStatus, GitStatusEntry } from '@pierre/trees'
import type { GitFileStatus } from '@yiru/protocol/git/status-types'
import { normalizeRelativePath } from '~renderer/path'

import type { FileExplorerRowProjection } from './row-projection'
import type { TreeNode } from './types'

export const NEW_FILE_NAME = '__yiru_new_file__'
export const NEW_FOLDER_NAME = '__yiru_new_folder__'

export type PierreFileTreeData = {
  canonicalPathByAbsolutePath: Map<string, string>
  nodeByCanonicalPath: Map<string, TreeNode>
  paths: string[]
}

function getCanonicalNodePath(node: TreeNode): string {
  const relativePath = normalizeRelativePath(node.relativePath)
  return node.isDirectory ? `${relativePath}/` : relativePath
}

export function getCanonicalParentPath(worktreePath: string, parentPath: string): string {
  if (parentPath === worktreePath) {
    return ''
  }
  const relative = normalizeRelativePath(parentPath.slice(worktreePath.length))
  return relative ? `${relative}/` : ''
}

export function buildPierreFileTreeData(
  rowProjection: FileExplorerRowProjection
): PierreFileTreeData {
  const paths: string[] = []
  const nodeByCanonicalPath = new Map<string, TreeNode>()
  const canonicalPathByAbsolutePath = new Map<string, string>()
  const rows = rowProjection.getVisibleSlice(0, rowProjection.getVisibleCount() - 1)

  for (const node of rows) {
    const canonicalPath = getCanonicalNodePath(node)
    paths.push(canonicalPath)
    nodeByCanonicalPath.set(canonicalPath, node)
    canonicalPathByAbsolutePath.set(node.path, canonicalPath)
  }

  return { canonicalPathByAbsolutePath, nodeByCanonicalPath, paths }
}

function mapGitStatus(status: GitFileStatus): GitStatus | null {
  return status === 'copied' ? null : status
}

export function buildPierreGitStatusEntries(
  statusByRelativePath: ReadonlyMap<string, GitFileStatus>,
  ignoredByRelativePath: ReadonlySet<string>
): GitStatusEntry[] {
  const entries: GitStatusEntry[] = []
  const pathsWithStatus = new Set<string>()
  for (const [path, status] of statusByRelativePath) {
    const normalizedPath = normalizeRelativePath(path)
    pathsWithStatus.add(normalizedPath)
    const mapped = mapGitStatus(status)
    if (mapped) {
      entries.push({ path: normalizedPath, status: mapped })
    }
  }
  for (const path of ignoredByRelativePath) {
    const normalizedPath = normalizeRelativePath(path)
    if (!pathsWithStatus.has(normalizedPath)) {
      entries.push({ path: normalizedPath, status: 'ignored' })
    }
  }
  return entries
}

import type { GitStatusEntry as PierreGitStatusEntry } from '@pierre/trees'
import type { GitBranchChangeEntry } from '@yiru/protocol/git/branch-compare-types'
import type { GitFileStatus, GitStatusEntry } from '@yiru/protocol/git/status-types'
import { normalizeRelativePath } from '~renderer/path'

import type { SourceControlTreeDirectoryNode } from './directory-action-paths'
import {
  SUBMODULE_EMPTY_LABEL,
  SUBMODULE_ERROR_LABEL,
  SUBMODULE_LOADING_LABEL
} from './panel-constants'
import {
  buildSubmoduleChildEntry,
  getSubmoduleExpansionKey,
  isExpandableSubmoduleEntry,
  type SubmoduleStatusState
} from './submodule-expansion'
import type { SourceControlTreeNode } from './tree'

export type SourceControlPierreDirectoryTarget = {
  kind: 'directory'
  relativePath: string
  collapseKey: string
  node?: SourceControlTreeDirectoryNode
}

export type SourceControlPierreUncommittedTarget = {
  kind: 'uncommitted'
  entry: GitStatusEntry
  isSubmodule: boolean
}

export type SourceControlPierreBranchTarget = {
  kind: 'branch'
  entry: GitBranchChangeEntry
}

export type SourceControlPierrePlaceholderTarget = {
  kind: 'placeholder'
  message: string
}

export type SourceControlPierreTarget =
  | SourceControlPierreDirectoryTarget
  | SourceControlPierreUncommittedTarget
  | SourceControlPierreBranchTarget
  | SourceControlPierrePlaceholderTarget

// Why: disclosure state is deliberately absent — see
// `resolveSourceControlPierreExpandedPaths`. Keeping it out is what lets `paths`
// stay referentially stable while the user collapses directories.
export type SourceControlPierreTreeData = {
  canonicalPathByRowKey: Map<string, string>
  gitStatus: PierreGitStatusEntry[]
  paths: string[]
  targetByCanonicalPath: Map<string, SourceControlPierreTarget>
}

function toCanonicalFilePath(path: string): string {
  return normalizeRelativePath(path)
}

function toCanonicalDirectoryPath(path: string): string {
  const normalizedPath = normalizeRelativePath(path)
  return normalizedPath ? `${normalizedPath}/` : ''
}

function mapGitStatus(status: GitFileStatus): PierreGitStatusEntry['status'] | null {
  return status === 'copied' ? null : status
}

function addGitStatus(
  gitStatus: PierreGitStatusEntry[],
  canonicalPath: string,
  status: GitFileStatus
): void {
  const mappedStatus = mapGitStatus(status)
  if (mappedStatus) {
    gitStatus.push({ path: canonicalPath, status: mappedStatus })
  }
}

function createTreeData(): SourceControlPierreTreeData {
  return {
    canonicalPathByRowKey: new Map(),
    gitStatus: [],
    paths: [],
    targetByCanonicalPath: new Map()
  }
}

function finalizeTreeData(data: SourceControlPierreTreeData): SourceControlPierreTreeData {
  data.paths = [...new Set(data.paths)]
  return data
}

function addPlaceholder(
  data: SourceControlPierreTreeData,
  parentPath: string,
  label: string,
  message: string
): void {
  const canonicalPath = `${parentPath}${label}`
  data.paths.push(canonicalPath)
  data.targetByCanonicalPath.set(canonicalPath, { kind: 'placeholder', message })
}

function addImplicitDirectoryTargets(
  data: SourceControlPierreTreeData,
  entry: GitStatusEntry,
  rootPath: string
): void {
  const normalizedPath = toCanonicalFilePath(entry.path)
  let separatorIndex = rootPath.length
  while ((separatorIndex = normalizedPath.indexOf('/', separatorIndex + 1)) >= 0) {
    const relativePath = normalizedPath.slice(0, separatorIndex)
    const canonicalPath = `${relativePath}/`
    if (data.targetByCanonicalPath.has(canonicalPath)) {
      continue
    }
    data.targetByCanonicalPath.set(canonicalPath, {
      kind: 'directory',
      relativePath,
      collapseKey: `dir::${entry.area}::${relativePath}`
    })
  }
}

function addUncommittedEntry(
  data: SourceControlPierreTreeData,
  entry: GitStatusEntry,
  submoduleStatusByKey: Readonly<Record<string, SubmoduleStatusState>>
): void {
  const isSubmodule = isExpandableSubmoduleEntry(entry)
  const canonicalPath = isSubmodule
    ? toCanonicalDirectoryPath(entry.path)
    : toCanonicalFilePath(entry.path)
  data.paths.push(canonicalPath)
  data.targetByCanonicalPath.set(canonicalPath, { kind: 'uncommitted', entry, isSubmodule })
  data.canonicalPathByRowKey.set(`${entry.area}::${entry.path}`, canonicalPath)
  addGitStatus(data.gitStatus, canonicalPath, entry.status)

  if (!isSubmodule) {
    return
  }

  const state = submoduleStatusByKey[getSubmoduleExpansionKey(entry)]
  if (!state || state.status === 'loading') {
    addPlaceholder(data, canonicalPath, SUBMODULE_LOADING_LABEL, SUBMODULE_LOADING_LABEL)
    return
  }
  if (state.status === 'error') {
    addPlaceholder(data, canonicalPath, SUBMODULE_ERROR_LABEL, state.error)
    return
  }
  if (state.entries.length === 0) {
    addPlaceholder(data, canonicalPath, SUBMODULE_EMPTY_LABEL, SUBMODULE_EMPTY_LABEL)
    return
  }

  const rootPath = normalizeRelativePath(entry.path)
  for (const innerEntry of state.entries) {
    const childEntry = buildSubmoduleChildEntry(entry.path, innerEntry, entry.area)
    addImplicitDirectoryTargets(data, childEntry, rootPath)
    addUncommittedEntry(data, childEntry, submoduleStatusByKey)
  }
}

function addUncommittedNode(
  data: SourceControlPierreTreeData,
  node: SourceControlTreeNode<GitStatusEntry>,
  submoduleStatusByKey: Readonly<Record<string, SubmoduleStatusState>>
): void {
  if (node.type === 'file') {
    addUncommittedEntry(data, node.entry, submoduleStatusByKey)
    return
  }

  const canonicalPath = toCanonicalDirectoryPath(node.path)
  data.paths.push(canonicalPath)
  data.targetByCanonicalPath.set(canonicalPath, {
    kind: 'directory',
    relativePath: node.path,
    collapseKey: node.key,
    node
  })
  for (const child of node.children) {
    addUncommittedNode(data, child, submoduleStatusByKey)
  }
}

export function buildUncommittedPierreTreeData(args: {
  roots: SourceControlTreeNode<GitStatusEntry>[]
  submoduleStatusByKey: Readonly<Record<string, SubmoduleStatusState>>
}): SourceControlPierreTreeData {
  const data = createTreeData()
  for (const root of args.roots) {
    addUncommittedNode(data, root, args.submoduleStatusByKey)
  }
  return finalizeTreeData(data)
}

function addBranchNode(
  data: SourceControlPierreTreeData,
  node: SourceControlTreeNode<GitBranchChangeEntry, 'branch'>
): void {
  if (node.type === 'file') {
    const canonicalPath = toCanonicalFilePath(node.entry.path)
    data.paths.push(canonicalPath)
    data.targetByCanonicalPath.set(canonicalPath, { kind: 'branch', entry: node.entry })
    addGitStatus(data.gitStatus, canonicalPath, node.entry.status)
    return
  }

  const canonicalPath = toCanonicalDirectoryPath(node.path)
  data.paths.push(canonicalPath)
  data.targetByCanonicalPath.set(canonicalPath, {
    kind: 'directory',
    relativePath: node.path,
    collapseKey: node.key
  })
  for (const child of node.children) {
    addBranchNode(data, child)
  }
}

export function buildBranchPierreTreeData(
  roots: SourceControlTreeNode<GitBranchChangeEntry, 'branch'>[]
): SourceControlPierreTreeData {
  const data = createTreeData()
  for (const root of roots) {
    addBranchNode(data, root)
  }
  return finalizeTreeData(data)
}

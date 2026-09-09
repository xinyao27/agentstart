import { StatusCode } from '../../generated/yiru/protocol/v1/errors_pb.js'
import {
  FileKind as ProtocolFileKind,
  type DirectoryEntry as ProtocolDirectoryEntry,
  type FileListResult as ProtocolFileListResult,
  type FileOpenResult as ProtocolFileOpenResult,
  type FilePreviewResult as ProtocolFilePreviewResult,
  type FileReadResult as ProtocolFileReadResult,
  type MarkdownDocument as ProtocolMarkdownDocument,
  type SearchFileResult as ProtocolSearchFileResult
} from '../../generated/yiru/runtime/v1/files_pb.js'
import { RuntimeProtocolError } from '../error.js'
import { bytesToBase64 } from './base64.js'

export type FileListEntry = Readonly<{
  basename: string
  kind: 'text' | 'binary'
  relativePath: string
}>

export type FileListResult = Readonly<{
  files: readonly FileListEntry[]
  rootPath: string
  totalCount: number
  truncated: boolean
  worktree: string
}>

export type FileOpenResult = Readonly<{
  kind: 'markdown' | 'text' | 'binary' | 'image'
  opened: boolean
  relativePath: string
  worktree: string
}>

export type FileReadResult = Readonly<{
  content: string
  byteLength: number
  truncated: boolean
  relativePath: string
  worktree: string
}>

export type FilePreviewResult = Readonly<{
  content: string
  isBinary: boolean
  isImage?: boolean
  mimeType?: string
}>

export type FileReadChunkResult = Readonly<{
  contentBase64: string
  bytesRead: number
  eof: boolean
}>

export type DirectoryEntry = Readonly<{
  name: string
  isDirectory: boolean
  isSymlink: boolean
}>

export type SearchMatch = Readonly<{
  line: number
  column: number
  matchLength: number
  lineContent: string
  displayColumn?: number
  displayMatchLength?: number
}>

export type SearchFileResult = Readonly<{
  filePath: string
  relativePath: string
  matches: readonly SearchMatch[]
  matchCount: number
}>

export type FileSearchResult = Readonly<{
  files: readonly SearchFileResult[]
  totalMatches: number
  truncated: boolean
}>

export type MarkdownDocument = Readonly<{
  basename: string
  filePath: string
  name: string
  relativePath: string
}>

export type FileSearchInput = Readonly<{
  worktree: string
  query: string
  caseSensitive?: boolean
  wholeWord?: boolean
  useRegex?: boolean
  includePattern?: string
  excludePattern?: string
  maxResults?: number
}>

export function fileListResult(result: ProtocolFileListResult | undefined): FileListResult {
  if (!result) {
    throw invalidResponse('File list result is missing')
  }
  return {
    files: result.files.map((entry) => ({
      basename: entry.basename,
      kind: fileEntryKind(entry.kind),
      relativePath: entry.relativePath
    })),
    rootPath: result.rootPath,
    totalCount: fileCount(result.totalCount),
    truncated: result.truncated,
    worktree: result.worktree
  }
}

export function fileOpenResult(result: ProtocolFileOpenResult | undefined): FileOpenResult {
  if (!result) {
    throw invalidResponse('File open result is missing')
  }
  return {
    kind: fileOpenKind(result.kind),
    opened: result.opened,
    relativePath: result.relativePath,
    worktree: result.worktree
  }
}

export function fileReadResult(result: ProtocolFileReadResult | undefined): FileReadResult {
  if (!result) {
    throw invalidResponse('File read result is missing')
  }
  return {
    content: result.content,
    byteLength: fileCount(result.byteLength),
    truncated: result.truncated,
    relativePath: result.relativePath,
    worktree: result.worktree
  }
}

// Why: the wire carries raw preview bytes; the workbench renderer still expects the base64
// string shape the legacy JSON transport produced, so this is the one place that base64
// layer is re-applied for a binary/image preview.
export function filePreviewResult(
  result: ProtocolFilePreviewResult | undefined
): FilePreviewResult {
  if (!result) {
    throw invalidResponse('File preview result is missing')
  }
  const content = result.isBinary ? bytesToBase64(result.content) : utf8Decode(result.content)
  return {
    content,
    isBinary: result.isBinary,
    ...(result.isImage === undefined ? {} : { isImage: result.isImage }),
    ...(result.mimeType === undefined ? {} : { mimeType: result.mimeType })
  }
}

export function directoryEntry(entry: ProtocolDirectoryEntry): DirectoryEntry {
  return {
    name: entry.name,
    isDirectory: entry.isDirectory,
    isSymlink: entry.isSymlink
  }
}

export function markdownDocument(document: ProtocolMarkdownDocument): MarkdownDocument {
  return {
    basename: document.basename,
    filePath: document.filePath,
    name: document.name,
    relativePath: document.relativePath
  }
}

export function searchFileResult(result: ProtocolSearchFileResult): SearchFileResult {
  return {
    filePath: result.filePath,
    relativePath: result.relativePath,
    matchCount: fileCount(result.matchCount),
    matches: result.matches.map((match) => ({
      line: fileCount(match.line),
      column: fileCount(match.column),
      matchLength: fileCount(match.matchLength),
      lineContent: match.lineContent,
      ...(match.displayColumn === undefined
        ? {}
        : { displayColumn: fileCount(match.displayColumn) }),
      ...(match.displayMatchLength === undefined
        ? {}
        : { displayMatchLength: fileCount(match.displayMatchLength) })
    }))
  }
}

function fileEntryKind(kind: ProtocolFileKind): 'text' | 'binary' {
  switch (kind) {
    case ProtocolFileKind.TEXT:
      return 'text'
    case ProtocolFileKind.BINARY:
      return 'binary'
    case ProtocolFileKind.IMAGE:
    case ProtocolFileKind.MARKDOWN:
    case ProtocolFileKind.UNSPECIFIED:
      throw invalidResponse('File list entry kind is invalid')
  }
  throw invalidResponse('File list entry kind is unknown')
}

function fileOpenKind(kind: ProtocolFileKind): FileOpenResult['kind'] {
  switch (kind) {
    case ProtocolFileKind.TEXT:
      return 'text'
    case ProtocolFileKind.BINARY:
      return 'binary'
    case ProtocolFileKind.IMAGE:
      return 'image'
    case ProtocolFileKind.MARKDOWN:
      return 'markdown'
    case ProtocolFileKind.UNSPECIFIED:
      throw invalidResponse('File open kind is unspecified')
  }
  throw invalidResponse('File open kind is unknown')
}

function fileCount(value: number | bigint): number {
  const numeric = typeof value === 'bigint' ? Number(value) : value
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw invalidResponse('File count is invalid')
  }
  return numeric
}

function utf8Decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}

function invalidResponse(message: string): RuntimeProtocolError {
  return new RuntimeProtocolError(StatusCode.DATA_LOSS, message)
}

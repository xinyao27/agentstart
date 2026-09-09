import { StatusCode } from '../generated/yiru/protocol/v1/errors_pb.js'
import {
  ShellFilesImportSkipReason as ProtocolImportSkipReason,
  ShellFilesStagedSourceKind as ProtocolStagedSourceKind,
  type ShellFilesDroppedPathFailure as ProtocolDroppedPathFailure,
  type ShellFilesDroppedPathSkip as ProtocolDroppedPathSkip,
  type ShellFilesServiceReadChunkResponse,
  type ShellFilesServiceReadResponse,
  type ShellFilesServiceResolveDroppedPathsForAgentResponse,
  type ShellFilesServiceStageExternalPathsForRuntimeUploadResponse,
  type ShellFilesServiceStatResponse,
  type ShellFilesStagedImportEntry as ProtocolStagedImportEntry,
  type ShellFilesStagedSource as ProtocolStagedSource
} from '../generated/yiru/runtime/v1/shell_files_pb.js'
import { RuntimeProtocolError } from './error.js'
import { bytesToBase64 } from './files/base64.js'

export const SHELL_FILES_PROTOCOL_CAPABILITY = 'shellFiles.protobuf.v1' as const

export type ShellFileReadResult = {
  content: string
  isBinary: boolean
  isImage?: boolean
  mimeType?: string
  fileIdentity?: string
}

export type ShellFileReadChunkResult = {
  contentBase64: string
  bytesRead: number
  eof: boolean
}

export type ShellFileStatResult = {
  size: number
  isDirectory: boolean
  mtime: number
}

export type ShellFileImportSkipReason = 'missing' | 'symlink' | 'permission-denied' | 'unsupported'

export type ShellStagedExternalImportEntry =
  | { relativePath: string; kind: 'directory' }
  | { relativePath: string; kind: 'file'; contentBase64: string }

export type ShellStagedExternalImportSource =
  | {
      sourcePath: string
      status: 'staged'
      name: string
      kind: 'file' | 'directory'
      entries: ShellStagedExternalImportEntry[]
    }
  | {
      sourcePath: string
      status: 'skipped'
      reason: ShellFileImportSkipReason
    }
  | {
      sourcePath: string
      status: 'failed'
      reason: string
    }

export type ShellStageExternalPathsResult = {
  sources: ShellStagedExternalImportSource[]
}

// Why: `reason` here is a free-form diagnostic string from the authority
// (currently never populated — `resolveDroppedPathsForAgent` always resolves
// every path), unlike the fixed `ShellFileImportSkipReason` enum used by the
// external-import staging path below.
export type ShellResolveDroppedPathsResult = {
  resolvedPaths: string[]
  skipped: { sourcePath: string; reason: string }[]
  failed: { sourcePath: string; reason: string }[]
}

export function shellFileReadResult(response: ShellFilesServiceReadResponse): ShellFileReadResult {
  const content = response.isBinary
    ? response.isImage
      ? bytesToBase64(response.content)
      : ''
    : new TextDecoder().decode(response.content)
  return {
    content,
    isBinary: response.isBinary,
    ...(response.isImage === undefined ? {} : { isImage: response.isImage }),
    ...(response.mimeType === undefined ? {} : { mimeType: response.mimeType }),
    ...(response.fileIdentity === undefined ? {} : { fileIdentity: response.fileIdentity })
  }
}

export function shellFileReadChunkResult(
  response: ShellFilesServiceReadChunkResponse
): ShellFileReadChunkResult {
  return {
    contentBase64: bytesToBase64(response.content),
    bytesRead: response.bytesRead,
    eof: response.eof
  }
}

export function shellFileStatResult(response: ShellFilesServiceStatResponse): ShellFileStatResult {
  return {
    size: Number(response.size),
    isDirectory: response.isDirectory,
    mtime: response.mtime
  }
}

export function shellStageExternalPathsResult(
  response: ShellFilesServiceStageExternalPathsForRuntimeUploadResponse
): ShellStageExternalPathsResult {
  return { sources: response.sources.map(shellStagedSource) }
}

function shellStagedSource(source: ProtocolStagedSource): ShellStagedExternalImportSource {
  const sourcePath = source.sourcePath
  switch (source.outcome.case) {
    case 'staged':
      return {
        sourcePath,
        status: 'staged',
        name: source.outcome.value.name,
        kind:
          source.outcome.value.kind === ProtocolStagedSourceKind.DIRECTORY ? 'directory' : 'file',
        entries: source.outcome.value.entries.map(shellStagedEntry)
      }
    case 'skipped':
      return {
        sourcePath,
        status: 'skipped',
        reason: shellImportSkipReason(source.outcome.value.reason)
      }
    case 'failed':
      return { sourcePath, status: 'failed', reason: source.outcome.value.reason }
    case undefined:
      throw invalidResponse('Staged external import source outcome is empty')
  }
}

function shellStagedEntry(entry: ProtocolStagedImportEntry): ShellStagedExternalImportEntry {
  switch (entry.kind.case) {
    case 'directory':
      return { relativePath: entry.kind.value.relativePath, kind: 'directory' }
    case 'file':
      return {
        relativePath: entry.kind.value.relativePath,
        kind: 'file',
        contentBase64: bytesToBase64(entry.kind.value.content)
      }
    case undefined:
      throw invalidResponse('Staged external import entry is empty')
  }
}

function shellImportSkipReason(reason: ProtocolImportSkipReason): ShellFileImportSkipReason {
  switch (reason) {
    case ProtocolImportSkipReason.MISSING:
      return 'missing'
    case ProtocolImportSkipReason.PERMISSION_DENIED:
      return 'permission-denied'
    case ProtocolImportSkipReason.SYMLINK:
      return 'symlink'
    case ProtocolImportSkipReason.UNSPECIFIED:
    case ProtocolImportSkipReason.UNSUPPORTED:
      return 'unsupported'
  }
}

export function shellResolveDroppedPathsResult(
  response: ShellFilesServiceResolveDroppedPathsForAgentResponse
): ShellResolveDroppedPathsResult {
  return {
    resolvedPaths: response.resolvedPaths,
    skipped: response.skipped.map(shellDroppedPathSkip),
    failed: response.failed.map(shellDroppedPathFailure)
  }
}

function shellDroppedPathSkip(skip: ProtocolDroppedPathSkip): {
  sourcePath: string
  reason: string
} {
  return { sourcePath: skip.sourcePath, reason: skip.reason }
}

function shellDroppedPathFailure(failure: ProtocolDroppedPathFailure): {
  sourcePath: string
  reason: string
} {
  return { sourcePath: failure.sourcePath, reason: failure.reason }
}

function invalidResponse(message: string): RuntimeProtocolError {
  return new RuntimeProtocolError(StatusCode.DATA_LOSS, message)
}

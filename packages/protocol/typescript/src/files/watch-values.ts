import { StatusCode } from '../../generated/yiru/protocol/v1/errors_pb.js'
import {
  FileChangeKind as ProtocolFileChangeKind,
  LogTailChangeKind as ProtocolLogTailChangeKind,
  type FileChangeEvent as ProtocolFileChangeEvent
} from '../../generated/yiru/runtime/v1/files_pb.js'
import { RuntimeProtocolError } from '../error.js'

export type FileChangeEvent = Readonly<{
  kind: 'create' | 'delete' | 'update' | 'overflow'
  absolutePath: string
  oldAbsolutePath?: string
  isDirectory?: boolean
}>

export type FsChangedPayload = Readonly<{
  worktreePath: string
  events: readonly FileChangeEvent[]
}>

export type FileWatchMessage =
  | Readonly<{ type: 'starting'; subscriptionId: string }>
  | Readonly<{ type: 'ready'; subscriptionId: string }>
  | Readonly<{ type: 'changed'; worktree: string; events: readonly FileChangeEvent[] }>
  | Readonly<{ type: 'error'; message: string }>
  | Readonly<{ type: 'end' }>

export type LogTailReadResult = Readonly<{
  contentBase64: string
  fileIdentity: string
  fileSize: number
  hasMore: boolean
  nextByteOffset: number
  reset: boolean
}>

export type LogTailWatchMessage =
  | Readonly<{ type: 'ready'; subscriptionId: string }>
  | Readonly<{ type: 'changed'; eventType: 'rename' | 'change' }>
  | Readonly<{ type: 'end' }>

export type FileWatch = Readonly<{
  messages: AsyncIterable<FileWatchMessage>
  cancel: (reason?: string) => Promise<void>
}>

export type LogTailWatch = Readonly<{
  messages: AsyncIterable<LogTailWatchMessage>
  cancel: (reason?: string) => Promise<void>
}>

export function fileChangeEvent(event: ProtocolFileChangeEvent): FileChangeEvent {
  return {
    kind: fileChangeKind(event.kind),
    absolutePath: event.absolutePath,
    ...(event.oldAbsolutePath === undefined ? {} : { oldAbsolutePath: event.oldAbsolutePath }),
    ...(event.isDirectory === undefined ? {} : { isDirectory: event.isDirectory })
  }
}

export function logTailChangeEventType(kind: ProtocolLogTailChangeKind): 'rename' | 'change' {
  switch (kind) {
    case ProtocolLogTailChangeKind.RENAME:
      return 'rename'
    case ProtocolLogTailChangeKind.CHANGE:
      return 'change'
    case ProtocolLogTailChangeKind.UNSPECIFIED:
      throw invalidResponse('Log tail change kind is unspecified')
  }
  throw invalidResponse('Log tail change kind is unknown')
}

function fileChangeKind(kind: ProtocolFileChangeKind): FileChangeEvent['kind'] {
  switch (kind) {
    case ProtocolFileChangeKind.CREATE:
      return 'create'
    case ProtocolFileChangeKind.DELETE:
      return 'delete'
    case ProtocolFileChangeKind.UPDATE:
      return 'update'
    case ProtocolFileChangeKind.OVERFLOW:
      return 'overflow'
    case ProtocolFileChangeKind.UNSPECIFIED:
      throw invalidResponse('File change kind is unspecified')
  }
  throw invalidResponse('File change kind is unknown')
}

function invalidResponse(message: string): RuntimeProtocolError {
  return new RuntimeProtocolError(StatusCode.DATA_LOSS, message)
}

export const LOCAL_LOG_TAIL_CHUNK_BYTES = 256 * 1024

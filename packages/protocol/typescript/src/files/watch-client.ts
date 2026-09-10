import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import { StatusCode } from '../../generated/agent_start/protocol/v1/errors_pb.js'
import {
  FilesService,
  FilesServiceReadLogTailRequestSchema,
  FilesServiceReadLogTailResponseSchema,
  FilesServiceWatchLogTailRequestSchema,
  FilesServiceWatchLogTailResponseSchema,
  FilesServiceWatchRequestSchema,
  FilesServiceWatchResponseSchema
} from '../../generated/agent_start/runtime/v1/files_pb.js'
import { RuntimeProtocolError } from '../error.js'
import type { RuntimeCallOptions, RuntimeStream } from '../transport.js'
import { FilesArtifactClient } from './artifact-client.js'
import { bytesToBase64 } from './base64.js'
import { byteOffset } from './read-client.js'
import {
  fileChangeEvent,
  logTailChangeEventType,
  type FileWatch,
  type FileWatchMessage,
  type LogTailReadResult,
  type LogTailWatch,
  type LogTailWatchMessage
} from './watch-values.js'

const READ_LOG_TAIL_PROCEDURE = `/${FilesService.typeName}/${FilesService.method.readLogTail.name}`
const WATCH_PROCEDURE = `/${FilesService.typeName}/${FilesService.method.watch.name}`
const WATCH_LOG_TAIL_PROCEDURE = `/${FilesService.typeName}/${FilesService.method.watchLogTail.name}`

export class FilesWatchClient extends FilesArtifactClient {
  async readLogTail(
    input: Readonly<{ filePath: string; fromByteOffset: number; expectedIdentity?: string }>,
    options?: RuntimeCallOptions
  ): Promise<LogTailReadResult> {
    const response = await this.transport.unary({
      method: READ_LOG_TAIL_PROCEDURE,
      payload: toBinary(
        FilesServiceReadLogTailRequestSchema,
        create(FilesServiceReadLogTailRequestSchema, {
          filePath: input.filePath,
          fromByteOffset: byteOffset(input.fromByteOffset),
          ...(input.expectedIdentity === undefined
            ? {}
            : { expectedIdentity: input.expectedIdentity })
        })
      ),
      ...(options ? { options } : {})
    })
    const result = fromBinary(FilesServiceReadLogTailResponseSchema, response)
    return {
      contentBase64: bytesToBase64(result.content),
      fileIdentity: result.fileIdentity,
      fileSize: Number(result.fileSize),
      hasMore: result.hasMore,
      nextByteOffset: Number(result.nextByteOffset),
      reset: result.reset
    }
  }

  /** Streams file-change batches for one worktree; `cancel` replaces `files.unwatch`. */
  async watch(worktree: string, options?: RuntimeCallOptions): Promise<FileWatch> {
    const stream = await this.transport.subscribe({
      method: WATCH_PROCEDURE,
      payload: toBinary(
        FilesServiceWatchRequestSchema,
        create(FilesServiceWatchRequestSchema, { worktree })
      ),
      ...(options ? { options } : {})
    })
    return { messages: watchMessages(stream), cancel: stream.cancel }
  }

  /** Tails one local log file; `cancel` replaces `files.unwatch`. */
  async watchLogTail(filePath: string, options?: RuntimeCallOptions): Promise<LogTailWatch> {
    const stream = await this.transport.subscribe({
      method: WATCH_LOG_TAIL_PROCEDURE,
      payload: toBinary(
        FilesServiceWatchLogTailRequestSchema,
        create(FilesServiceWatchLogTailRequestSchema, { filePath })
      ),
      ...(options ? { options } : {})
    })
    return { messages: logTailWatchMessages(stream), cancel: stream.cancel }
  }
}

async function* watchMessages(stream: RuntimeStream): AsyncIterable<FileWatchMessage> {
  for await (const payload of stream.events) {
    const message = fromBinary(FilesServiceWatchResponseSchema, payload).event
    switch (message.case) {
      case 'starting':
        yield { type: 'starting', subscriptionId: message.value.subscriptionId }
        break
      case 'ready':
        yield { type: 'ready', subscriptionId: message.value.subscriptionId }
        break
      case 'changed':
        yield {
          type: 'changed',
          worktree: message.value.worktree,
          events: message.value.events.map(fileChangeEvent)
        }
        break
      case 'error':
        yield { type: 'error', message: message.value.message }
        break
      case 'end':
        yield { type: 'end' }
        break
      case undefined:
        throw new RuntimeProtocolError(StatusCode.DATA_LOSS, 'File watch sent an empty message')
    }
  }
}

async function* logTailWatchMessages(stream: RuntimeStream): AsyncIterable<LogTailWatchMessage> {
  for await (const payload of stream.events) {
    const message = fromBinary(FilesServiceWatchLogTailResponseSchema, payload).event
    switch (message.case) {
      case 'ready':
        yield { type: 'ready', subscriptionId: message.value.subscriptionId }
        break
      case 'changed':
        yield { type: 'changed', eventType: logTailChangeEventType(message.value.eventType) }
        break
      case 'end':
        yield { type: 'end' }
        break
      case undefined:
        throw new RuntimeProtocolError(StatusCode.DATA_LOSS, 'Log tail watch sent an empty message')
    }
  }
}

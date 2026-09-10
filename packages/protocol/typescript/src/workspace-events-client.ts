import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import { StatusCode } from '../generated/agent_start/protocol/v1/errors_pb.js'
import {
  WorkspaceConsoleEntrySchema,
  WorkspaceConsoleSource,
  WorkspaceEventsService,
  WorkspaceEventsServiceAppendConsoleRequestSchema,
  WorkspaceEventsServiceAppendConsoleResponseSchema,
  WorkspaceEventsServiceAppendPerformanceRequestSchema,
  WorkspaceEventsServiceAppendPerformanceResponseSchema,
  WorkspaceEventsServiceListRequestSchema,
  WorkspaceEventsServiceListResponseSchema,
  WorkspaceEventsServiceWatchRequestSchema,
  WorkspaceEventsServiceWatchResponseSchema,
  type WorkspaceConsoleEntry
} from '../generated/agent_start/runtime/v1/workspace_events_pb.js'
import { RuntimeProtocolError } from './error.js'
import type { RuntimeCallOptions, RuntimeStream, RuntimeTransport } from './transport.js'
import {
  journalCursor,
  journalNumber,
  workspaceEventRecord,
  type WorkspaceEventRecord,
  type WorkspaceEventWatchMessage
} from './workspace-events-values.js'

const WATCH_PROCEDURE = `/${WorkspaceEventsService.typeName}/${WorkspaceEventsService.method.watch.name}`
const LIST_PROCEDURE = `/${WorkspaceEventsService.typeName}/${WorkspaceEventsService.method.list.name}`
const APPEND_CONSOLE_PROCEDURE = `/${WorkspaceEventsService.typeName}/${WorkspaceEventsService.method.appendConsole.name}`
const APPEND_PERFORMANCE_PROCEDURE = `/${WorkspaceEventsService.typeName}/${WorkspaceEventsService.method.appendPerformance.name}`

export type WorkspaceEventWatchInput = Readonly<{
  afterId?: number
  scope: string
}>

export type WorkspaceEventListInput = Readonly<{
  afterId?: number
  limit?: number
  scope: string
}>

export type WorkspaceEventListResult = Readonly<{
  events: WorkspaceEventRecord[]
  latestId: number
  revision: number
}>

export type WorkspaceConsoleSensorEntry = Readonly<{
  occurredAt: number
  source: 'console' | 'exception' | 'log'
  stack?: string
  text: string
}>

export type WorkspaceConsoleAppendInput = Readonly<{
  entries: readonly WorkspaceConsoleSensorEntry[]
  pageUrl: string
  projectId: string
  worktreeId: string
}>

export type WorkspaceConsoleAppendResult = Readonly<{
  claimedTerminalHandle: string | null
  eventsAppended: number
}>

export type WorkspacePerformanceAppendInput = Readonly<{
  artifactId: string
  metricCount: number
  pageUrl: string
  projectId: string
  worktreeId: string
}>

export type WorkspaceEventWatch = Readonly<{
  messages: AsyncIterable<WorkspaceEventWatchMessage>
  cancel: (reason?: string) => Promise<void>
}>

export class WorkspaceEventsClient {
  private readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  /**
   * Page through one scope's journal in event order. `afterId` resumes after a
   * previously applied event, matching the watch cursor semantics.
   */
  async list(
    input: WorkspaceEventListInput,
    options?: RuntimeCallOptions
  ): Promise<WorkspaceEventListResult> {
    const response = await this.transport.unary({
      method: LIST_PROCEDURE,
      payload: toBinary(
        WorkspaceEventsServiceListRequestSchema,
        create(WorkspaceEventsServiceListRequestSchema, {
          scope: requiredScope(input.scope),
          afterId: journalCursor(input.afterId ?? 0, 'Workspace event cursor'),
          ...(input.limit !== undefined ? { limit: input.limit } : {})
        })
      ),
      ...(options ? { options } : {})
    })
    const decoded = fromBinary(WorkspaceEventsServiceListResponseSchema, response)
    return {
      events: decoded.events.map(workspaceEventRecord),
      latestId: journalNumber(decoded.latestId, 'Workspace event id'),
      revision: journalNumber(decoded.revision, 'Workspace event revision')
    }
  }

  async appendConsole(
    input: WorkspaceConsoleAppendInput,
    options?: RuntimeCallOptions
  ): Promise<WorkspaceConsoleAppendResult> {
    const response = await this.transport.unary({
      method: APPEND_CONSOLE_PROCEDURE,
      payload: toBinary(
        WorkspaceEventsServiceAppendConsoleRequestSchema,
        create(WorkspaceEventsServiceAppendConsoleRequestSchema, {
          entries: input.entries.map(consoleEntry),
          pageUrl: input.pageUrl,
          projectId: input.projectId,
          worktreeId: input.worktreeId
        })
      ),
      ...(options ? { options } : {})
    })
    const decoded = fromBinary(WorkspaceEventsServiceAppendConsoleResponseSchema, response)
    return {
      claimedTerminalHandle: decoded.claimedTerminalHandle ?? null,
      eventsAppended: decoded.eventsAppended
    }
  }

  async appendPerformance(
    input: WorkspacePerformanceAppendInput,
    options?: RuntimeCallOptions
  ): Promise<WorkspaceEventRecord> {
    const response = await this.transport.unary({
      method: APPEND_PERFORMANCE_PROCEDURE,
      payload: toBinary(
        WorkspaceEventsServiceAppendPerformanceRequestSchema,
        create(WorkspaceEventsServiceAppendPerformanceRequestSchema, {
          artifactId: input.artifactId,
          metricCount: input.metricCount,
          pageUrl: input.pageUrl,
          projectId: input.projectId,
          worktreeId: input.worktreeId
        })
      ),
      ...(options ? { options } : {})
    })
    const decoded = fromBinary(WorkspaceEventsServiceAppendPerformanceResponseSchema, response)
    if (!decoded.event) {
      throw new RuntimeProtocolError(
        StatusCode.DATA_LOSS,
        'Workspace performance append returned no event'
      )
    }
    return workspaceEventRecord(decoded.event)
  }

  /**
   * Tail the journal from `afterId`. The stream restarts from this request when
   * a routed transport is replaced, so callers resume by reopening the watch
   * with the last event they applied.
   */
  async watch(
    input: WorkspaceEventWatchInput,
    options?: RuntimeCallOptions
  ): Promise<WorkspaceEventWatch> {
    const stream = await this.transport.subscribe({
      method: WATCH_PROCEDURE,
      payload: toBinary(
        WorkspaceEventsServiceWatchRequestSchema,
        create(WorkspaceEventsServiceWatchRequestSchema, {
          scope: requiredScope(input.scope),
          afterId: journalCursor(input.afterId ?? 0, 'Workspace event cursor')
        })
      ),
      ...(options ? { options } : {})
    })
    return { messages: watchMessages(stream), cancel: stream.cancel }
  }
}

async function* watchMessages(stream: RuntimeStream): AsyncIterable<WorkspaceEventWatchMessage> {
  let isReady = false
  for await (const payload of stream.events) {
    const message = fromBinary(WorkspaceEventsServiceWatchResponseSchema, payload).event
    switch (message.case) {
      case 'ready':
        isReady = true
        yield {
          type: 'ready',
          afterId: journalNumber(message.value.afterId, 'Workspace event cursor'),
          revision: journalNumber(message.value.revision, 'Workspace event revision')
        }
        break
      case 'appended':
        if (!isReady) {
          throw new RuntimeProtocolError(
            StatusCode.DATA_LOSS,
            'Workspace event watch sent an event before ready'
          )
        }
        yield { type: 'event', event: workspaceEventRecord(message.value) }
        break
      case undefined:
        throw new RuntimeProtocolError(
          StatusCode.DATA_LOSS,
          'Workspace event watch sent an empty message'
        )
    }
  }
}

function requiredScope(value: string): string {
  const scope = value.trim()
  if (scope.length === 0) {
    throw new TypeError('Workspace event scope must not be empty')
  }
  return scope
}

function consoleEntry(entry: WorkspaceConsoleSensorEntry): WorkspaceConsoleEntry {
  return create(WorkspaceConsoleEntrySchema, {
    occurredAt: entry.occurredAt,
    source: consoleSource(entry.source),
    text: entry.text,
    ...(entry.stack !== undefined ? { stack: entry.stack } : {})
  })
}

function consoleSource(source: WorkspaceConsoleSensorEntry['source']): WorkspaceConsoleSource {
  switch (source) {
    case 'console':
      return WorkspaceConsoleSource.CONSOLE
    case 'exception':
      return WorkspaceConsoleSource.EXCEPTION
    case 'log':
      return WorkspaceConsoleSource.LOG
  }
}

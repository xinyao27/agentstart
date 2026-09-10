import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import {
  ShellRuntimeJsonNull,
  ShellRuntimeJsonValueEntrySchema,
  ShellRuntimeJsonValueListSchema,
  ShellRuntimeJsonValueObjectSchema,
  ShellRuntimeJsonValueSchema,
  ShellRuntimeService,
  ShellRuntimeServiceSyncWindowGraphRequestSchema
} from '../generated/agent_start/runtime/v1/shell_runtime_pb.js'
import type { ShellRuntimeJsonValue } from '../generated/agent_start/runtime/v1/shell_runtime_pb.js'
import {
  GetStatusResponseSchema,
  type GetStatusResponse
} from '../generated/agent_start/runtime/v1/status_pb.js'
import type { RuntimeCallOptions, RuntimeTransport } from './transport.js'

export const SHELL_RUNTIME_PROTOCOL_CAPABILITY = 'shell.runtime.protobuf.v1' as const

const SYNC_WINDOW_GRAPH_PROCEDURE = `/${ShellRuntimeService.typeName}/${ShellRuntimeService.method.syncWindowGraph.name}`

// Why: the renderer window graph is a bounded open document (tabs, leaves,
// mobile session snapshots) the daemon validates structurally but does not own
// field-by-field, so it travels as plain JSON.
export type ShellRuntimeWindowGraph = Record<string, unknown>

export class ShellRuntimeClient {
  private readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  /**
   * Publish the renderer's window graph and receive the refreshed runtime
   * status snapshot the authority answers with.
   */
  async syncWindowGraph(
    graph: ShellRuntimeWindowGraph,
    options?: RuntimeCallOptions
  ): Promise<GetStatusResponse> {
    const response = await this.transport.unary({
      method: SYNC_WINDOW_GRAPH_PROCEDURE,
      payload: toBinary(
        ShellRuntimeServiceSyncWindowGraphRequestSchema,
        create(ShellRuntimeServiceSyncWindowGraphRequestSchema, {
          graph: jsonValue(graph)
        })
      ),
      ...(options ? { options } : {})
    })
    return fromBinary(GetStatusResponseSchema, response)
  }
}

function jsonValue(value: unknown): ShellRuntimeJsonValue {
  if (value === null) {
    return create(ShellRuntimeJsonValueSchema, {
      kind: { case: 'nullValue', value: ShellRuntimeJsonNull.VALUE }
    })
  }
  if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return create(ShellRuntimeJsonValueSchema, {
      kind:
        typeof value === 'boolean'
          ? { case: 'boolValue', value }
          : typeof value === 'number'
            ? { case: 'numberValue', value }
            : { case: 'stringValue', value }
    })
  }
  if (Array.isArray(value)) {
    return create(ShellRuntimeJsonValueSchema, {
      kind: {
        case: 'listValue',
        value: create(ShellRuntimeJsonValueListSchema, { values: value.map(jsonValue) })
      }
    })
  }
  if (typeof value === 'object') {
    return create(ShellRuntimeJsonValueSchema, {
      kind: {
        case: 'objectValue',
        value: create(ShellRuntimeJsonValueObjectSchema, {
          entries: Object.entries(value).map(([key, entry]) =>
            create(ShellRuntimeJsonValueEntrySchema, { key, value: jsonValue(entry) })
          )
        })
      }
    })
  }
  return create(ShellRuntimeJsonValueSchema, {
    kind: { case: 'nullValue', value: ShellRuntimeJsonNull.VALUE }
  })
}

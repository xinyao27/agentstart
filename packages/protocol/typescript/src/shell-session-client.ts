import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import { StatusCode } from '../generated/agent_start/protocol/v1/errors_pb.js'
import {
  ShellSessionJsonNull,
  ShellSessionJsonValueEntrySchema,
  ShellSessionJsonValueListSchema,
  ShellSessionJsonValueObjectSchema,
  ShellSessionJsonValueSchema,
  ShellSessionService,
  ShellSessionServiceFlushRequestSchema,
  ShellSessionServiceGetRequestSchema,
  ShellSessionServiceGetResponseSchema,
  ShellSessionServiceMutatedResponseSchema,
  ShellSessionServicePatchRequestSchema,
  ShellSessionServiceSetRequestSchema,
  type ShellSessionJsonValue as ProtocolJsonValue,
  type ShellSessionJsonValueEntry as ProtocolJsonValueEntry
} from '../generated/agent_start/runtime/v1/shell_session_pb.js'
import { RuntimeProtocolError } from './error.js'
import type { RuntimeCallOptions, RuntimeStream, RuntimeTransport } from './transport.js'

export const SHELL_SESSION_PROTOCOL_CAPABILITY = 'shell.session.cas.protobuf.v1' as const

// Why: the durable WorkspaceSession document is schema-open by design — the
// authority strips unknown keys through a versioned schema, so the renderer
// models it as the equally open recursive JSON union the wire carries.
export type ShellSessionJsonValue =
  | string
  | number
  | boolean
  | null
  | ShellSessionJsonValue[]
  | { [key: string]: ShellSessionJsonValue }

export type ShellSessionDocumentValue = Record<string, ShellSessionJsonValue>
export type ShellSessionVersion = { epoch: string; revision: bigint }
export type ShellSessionSnapshot = {
  session: ShellSessionDocumentValue
  version: ShellSessionVersion
}

const GET_PROCEDURE = `/${ShellSessionService.typeName}/${ShellSessionService.method.get.name}`
const SET_PROCEDURE = `/${ShellSessionService.typeName}/${ShellSessionService.method.set.name}`
const PATCH_PROCEDURE = `/${ShellSessionService.typeName}/${ShellSessionService.method.patch.name}`
const FLUSH_PROCEDURE = `/${ShellSessionService.typeName}/${ShellSessionService.method.flush.name}`

export class ShellSessionClient {
  private readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  async get(hostId?: string, options?: RuntimeCallOptions): Promise<ShellSessionSnapshot> {
    const response = await this.transport.unary({
      method: GET_PROCEDURE,
      payload: toBinary(
        ShellSessionServiceGetRequestSchema,
        create(ShellSessionServiceGetRequestSchema, hostId ? { hostId } : {})
      ),
      ...(options ? { options } : {})
    })
    return sessionSnapshot(fromBinary(ShellSessionServiceGetResponseSchema, response))
  }

  async watch(hostId?: string, options?: RuntimeCallOptions): Promise<ShellSessionStream> {
    const stream = await this.transport.subscribe({
      method: `/${ShellSessionService.typeName}/${ShellSessionService.method.watch.name}`,
      payload: toBinary(
        ShellSessionServiceGetRequestSchema,
        create(ShellSessionServiceGetRequestSchema, hostId ? { hostId } : {})
      ),
      ...(options ? { options } : {})
    })
    return { events: snapshots(stream), cancel: stream.cancel }
  }

  async set(
    session: ShellSessionDocumentValue,
    expectedVersion: ShellSessionVersion,
    hostId?: string,
    options?: RuntimeCallOptions
  ): Promise<ShellSessionSnapshot> {
    const response = await this.transport.unary({
      method: SET_PROCEDURE,
      payload: toBinary(
        ShellSessionServiceSetRequestSchema,
        create(ShellSessionServiceSetRequestSchema, {
          ...(hostId ? { hostId } : {}),
          session: jsonToValue(session),
          expectedVersion
        })
      ),
      ...(options ? { options } : {})
    })
    return sessionSnapshot(fromBinary(ShellSessionServiceMutatedResponseSchema, response))
  }

  // Why: the authority merges patch keys server-side, so the wire carries the
  // ordered top-level key writes instead of a full document replace.
  async patch(
    patch: ShellSessionDocumentValue,
    expectedVersion: ShellSessionVersion,
    hostId?: string,
    options?: RuntimeCallOptions
  ): Promise<ShellSessionSnapshot> {
    const response = await this.transport.unary({
      method: PATCH_PROCEDURE,
      payload: toBinary(
        ShellSessionServicePatchRequestSchema,
        create(ShellSessionServicePatchRequestSchema, {
          ...(hostId ? { hostId } : {}),
          patch: encodeEntries(patch),
          expectedVersion
        })
      ),
      ...(options ? { options } : {})
    })
    return sessionSnapshot(fromBinary(ShellSessionServiceMutatedResponseSchema, response))
  }

  async flush(options?: RuntimeCallOptions): Promise<void> {
    const response = await this.transport.unary({
      method: FLUSH_PROCEDURE,
      payload: toBinary(
        ShellSessionServiceFlushRequestSchema,
        create(ShellSessionServiceFlushRequestSchema)
      ),
      ...(options ? { options } : {})
    })
    fromBinary(ShellSessionServiceMutatedResponseSchema, response)
  }
}

function decodeJsonValue(value: ProtocolJsonValue | undefined): ShellSessionJsonValue {
  const kind = value?.kind
  if (!kind) {
    // Why: an unset value and an explicit null decode identically, matching
    // the authority's own recursive JSON decoding.
    return null
  }
  switch (kind.case) {
    case 'nullValue':
      return null
    case 'boolValue':
      return kind.value
    case 'numberValue':
      return kind.value
    case 'stringValue':
      return kind.value
    case 'listValue':
      return kind.value.values.map(decodeJsonValue)
    case 'objectValue':
      return jsonEntries(kind.value.entries)
  }
  return null
}

function encodeEntries(value: ShellSessionDocumentValue): ProtocolJsonValueEntry[] {
  return Object.entries(value)
    .filter(([, entry]) => entry !== undefined)
    .map(([key, entry]) =>
      create(ShellSessionJsonValueEntrySchema, { key, value: jsonToValue(entry) })
    )
}

function jsonToValue(value: ShellSessionJsonValue): ProtocolJsonValue {
  if (value === null) {
    return create(ShellSessionJsonValueSchema, {
      kind: { case: 'nullValue', value: ShellSessionJsonNull.VALUE }
    })
  }
  switch (typeof value) {
    case 'boolean':
      return create(ShellSessionJsonValueSchema, { kind: { case: 'boolValue', value } })
    case 'number':
      return create(ShellSessionJsonValueSchema, { kind: { case: 'numberValue', value } })
    case 'string':
      return create(ShellSessionJsonValueSchema, { kind: { case: 'stringValue', value } })
    case 'object':
      return Array.isArray(value)
        ? create(ShellSessionJsonValueSchema, {
            kind: {
              case: 'listValue',
              value: create(ShellSessionJsonValueListSchema, { values: value.map(jsonToValue) })
            }
          })
        : create(ShellSessionJsonValueSchema, {
            kind: {
              case: 'objectValue',
              value: create(ShellSessionJsonValueObjectSchema, {
                entries: encodeEntries(value as ShellSessionDocumentValue)
              })
            }
          })
  }
  return create(ShellSessionJsonValueSchema, {
    kind: { case: 'nullValue', value: ShellSessionJsonNull.VALUE }
  })
}

function jsonEntries(entries: readonly ProtocolJsonValueEntry[]): ShellSessionDocumentValue {
  const record: ShellSessionDocumentValue = {}
  for (const entry of entries) {
    record[entry.key] = decodeJsonValue(entry.value)
  }
  return record
}

function sessionSnapshot(value: {
  session?: ProtocolJsonValue
  version?: { epoch: string; revision: bigint }
}): ShellSessionSnapshot {
  const session = decodeJsonValue(value.session)
  if (!value.version?.epoch || !session || typeof session !== 'object' || Array.isArray(session)) {
    throw new RuntimeProtocolError(StatusCode.FAILED_PRECONDITION, 'session_version_unavailable')
  }
  return { session, version: { epoch: value.version.epoch, revision: value.version.revision } }
}

export type ShellSessionStream = {
  events: AsyncIterable<ShellSessionSnapshot>
  cancel: (reason?: string) => Promise<void>
}
async function* snapshots(stream: RuntimeStream): AsyncIterable<ShellSessionSnapshot> {
  for await (const payload of stream.events) {
    yield sessionSnapshot(fromBinary(ShellSessionServiceGetResponseSchema, payload))
  }
}

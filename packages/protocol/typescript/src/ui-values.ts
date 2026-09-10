import { create } from '@bufbuild/protobuf'

import { StatusCode } from '../generated/agent_start/protocol/v1/errors_pb.js'
import {
  UiJsonNull,
  UiJsonValueEntrySchema,
  UiJsonValueListSchema,
  UiJsonValueObjectSchema,
  UiJsonValueSchema,
  type UiDocument as ProtocolUiDocument,
  type UiJsonValue as ProtocolJsonValue,
  type UiJsonValueEntry as ProtocolJsonValueEntry
} from '../generated/agent_start/runtime/v1/ui_pb.js'
import { RuntimeProtocolError } from './error.js'

export const UI_PROTOCOL_CAPABILITY = 'ui.protobuf.v1' as const

// Why: the UI authority's document is normalized at its known keys but keeps
// unknown top-level keys verbatim (e.g. trustedAgentStartHooks), so the wire's
// recursive JSON value decodes into the equally open recursive union the
// renderer already models.
export type UiJsonValue =
  | string
  | number
  | boolean
  | null
  | UiJsonValue[]
  | { [key: string]: UiJsonValue }

export type UiDocumentValue = Record<string, UiJsonValue>

export function decodeUiDocument(document: ProtocolUiDocument | undefined): UiDocumentValue {
  if (!document) {
    throw invalidResponse('UI document is missing')
  }
  return jsonEntries(document.fields)
}

function decodeJsonValue(value: ProtocolJsonValue | undefined): UiJsonValue {
  const kind = value?.kind
  if (!kind) {
    throw invalidResponse('UI JSON value is missing')
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
  throw invalidResponse('UI JSON value kind is unknown')
}

export function encodeUiEntries(fields: Record<string, unknown>): ProtocolJsonValueEntry[] {
  return Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => create(UiJsonValueEntrySchema, { key, value: encodeJsonValue(value) }))
}

function encodeJsonValue(value: unknown): ProtocolJsonValue {
  if (value === null) {
    return create(UiJsonValueSchema, {
      kind: { case: 'nullValue', value: UiJsonNull.VALUE }
    })
  }
  switch (typeof value) {
    case 'boolean':
      return create(UiJsonValueSchema, { kind: { case: 'boolValue', value } })
    case 'number':
      return create(UiJsonValueSchema, { kind: { case: 'numberValue', value } })
    case 'string':
      return create(UiJsonValueSchema, { kind: { case: 'stringValue', value } })
    case 'object':
      return Array.isArray(value)
        ? create(UiJsonValueSchema, {
            kind: {
              case: 'listValue',
              value: create(UiJsonValueListSchema, { values: value.map(encodeJsonValue) })
            }
          })
        : create(UiJsonValueSchema, {
            kind: {
              case: 'objectValue',
              value: create(UiJsonValueObjectSchema, {
                entries: encodeUiEntries(value as Record<string, unknown>)
              })
            }
          })
  }
  throw invalidResponse('UI state value is not JSON')
}

function jsonEntries(entries: ProtocolJsonValueEntry[]): Record<string, UiJsonValue> {
  const record: Record<string, UiJsonValue> = {}
  for (const entry of entries) {
    record[entry.key] = decodeJsonValue(entry.value)
  }
  return record
}

function invalidResponse(message: string): RuntimeProtocolError {
  return new RuntimeProtocolError(StatusCode.DATA_LOSS, message)
}

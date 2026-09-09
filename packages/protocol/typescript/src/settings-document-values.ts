import { create } from '@bufbuild/protobuf'

import { StatusCode } from '../generated/yiru/protocol/v1/errors_pb.js'
import {
  SettingsJsonNull,
  SettingsJsonValueEntrySchema,
  SettingsJsonValueListSchema,
  SettingsJsonValueObjectSchema,
  SettingsJsonValueSchema,
  type SettingsDocument as ProtocolSettingsDocument,
  type SettingsJsonValue as ProtocolJsonValue,
  type SettingsJsonValueEntry as ProtocolJsonValueEntry
} from '../generated/yiru/runtime/v1/settings_pb.js'
import { RuntimeProtocolError } from './error.js'
import {
  decodeJsonValue,
  decodeSettingsSnapshot,
  type SettingsJsonValue
} from './settings-values.js'

export const SETTINGS_DOCUMENT_PROTOCOL_CAPABILITY = 'settings.document.protobuf.v1' as const

export type SettingsDocumentValue = Record<string, SettingsJsonValue>

// Why: the document carries the typed nine-field snapshot plus ordered JSON
// entries for every other key, so the full workbench settings document is the
// disjoint merge of the two decodes.
export function decodeSettingsDocument(
  document: ProtocolSettingsDocument | undefined
): SettingsDocumentValue {
  if (!document) {
    throw invalidResponse('Settings document is missing')
  }
  const fields: Record<string, SettingsJsonValue> = {}
  for (const entry of document.fields) {
    fields[entry.key] = decodeJsonValue(entry.value)
  }
  return { ...decodeSettingsSnapshot(document.settings), ...fields }
}

export function encodeSettingsUpdates(updates: Record<string, unknown>): ProtocolJsonValueEntry[] {
  return Object.entries(updates)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => create(SettingsJsonValueEntrySchema, { key, value: jsonToValue(value) }))
}

// Why: the workbench writes arbitrary routing-document keys, so the patch
// renders into the same open recursive JSON value the wire models — the
// authority's normalizer strips retired keys, mirroring the legacy verb.
function jsonToValue(value: unknown): ProtocolJsonValue {
  if (value === null) {
    return create(SettingsJsonValueSchema, {
      kind: { case: 'nullValue', value: SettingsJsonNull.VALUE }
    })
  }
  switch (typeof value) {
    case 'boolean':
      return create(SettingsJsonValueSchema, { kind: { case: 'boolValue', value } })
    case 'number':
      return create(SettingsJsonValueSchema, { kind: { case: 'numberValue', value } })
    case 'string':
      return create(SettingsJsonValueSchema, { kind: { case: 'stringValue', value } })
    case 'object':
      return Array.isArray(value)
        ? create(SettingsJsonValueSchema, {
            kind: {
              case: 'listValue',
              value: create(SettingsJsonValueListSchema, { values: value.map(jsonToValue) })
            }
          })
        : create(SettingsJsonValueSchema, {
            kind: {
              case: 'objectValue',
              value: create(SettingsJsonValueObjectSchema, {
                entries: encodeSettingsUpdates(value as Record<string, unknown>)
              })
            }
          })
  }
  throw invalidResponse('Settings value is not JSON')
}

function invalidResponse(message: string): RuntimeProtocolError {
  return new RuntimeProtocolError(StatusCode.DATA_LOSS, message)
}

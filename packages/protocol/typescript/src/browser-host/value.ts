import { create } from '@bufbuild/protobuf'

import {
  BrowserNull,
  BrowserValueEntrySchema,
  BrowserValueListSchema,
  BrowserValueObjectSchema,
  BrowserValueSchema
} from '../../generated/yiru/runtime/v1/browser_pb.js'
import type { BrowserValue } from '../../generated/yiru/runtime/v1/browser_pb.js'

export function encodeBrowserValue(value: unknown): BrowserValue | undefined {
  if (value === undefined) {
    return undefined
  }
  if (value === null) {
    return create(BrowserValueSchema, { kind: { case: 'nullValue', value: BrowserNull.VALUE } })
  }
  if (typeof value === 'boolean') {
    return create(BrowserValueSchema, { kind: { case: 'boolValue', value } })
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return create(BrowserValueSchema, { kind: { case: 'numberValue', value } })
  }
  if (typeof value === 'string') {
    return create(BrowserValueSchema, { kind: { case: 'stringValue', value } })
  }
  if (Array.isArray(value)) {
    return create(BrowserValueSchema, {
      kind: {
        case: 'listValue',
        value: create(BrowserValueListSchema, {
          values: value.map((item) => requiredBrowserValue(item))
        })
      }
    })
  }
  if (isRecord(value)) {
    return create(BrowserValueSchema, {
      kind: {
        case: 'objectValue',
        value: create(BrowserValueObjectSchema, {
          entries: Object.entries(value).map(([key, item]) =>
            create(BrowserValueEntrySchema, { key, value: requiredBrowserValue(item) })
          )
        })
      }
    })
  }
  throw new Error('Browser command returned a non-serializable value')
}

export function readRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error('Browser command returned an invalid object')
  }
  return value
}

export function readArray(value: unknown, key: string): unknown[] {
  const candidate = Reflect.get(readRecord(value), key)
  if (!Array.isArray(candidate)) {
    throw new Error(`Browser command returned an invalid ${key}`)
  }
  return candidate
}

export function readString(value: unknown, key: string): string {
  const candidate = Reflect.get(readRecord(value), key)
  if (typeof candidate !== 'string') {
    throw new Error(`Browser command returned an invalid ${key}`)
  }
  return candidate
}

export function readOptionalString(value: unknown, key: string): string | undefined {
  const candidate = Reflect.get(readRecord(value), key)
  if (candidate === null || candidate === undefined) {
    return undefined
  }
  if (typeof candidate !== 'string') {
    throw new Error(`Browser command returned an invalid ${key}`)
  }
  return candidate
}

export function readNumber(value: unknown, key: string): number {
  const candidate = Reflect.get(readRecord(value), key)
  if (typeof candidate !== 'number' || !Number.isFinite(candidate)) {
    throw new Error(`Browser command returned an invalid ${key}`)
  }
  return candidate
}

export function readOptionalNumber(value: unknown, key: string): number | undefined {
  const candidate = Reflect.get(readRecord(value), key)
  if (candidate === null || candidate === undefined) {
    return undefined
  }
  if (typeof candidate !== 'number' || !Number.isFinite(candidate)) {
    throw new Error(`Browser command returned an invalid ${key}`)
  }
  return candidate
}

export function readBoolean(value: unknown, key: string): boolean {
  const candidate = Reflect.get(readRecord(value), key)
  if (typeof candidate !== 'boolean') {
    throw new Error(`Browser command returned an invalid ${key}`)
  }
  return candidate
}

function requiredBrowserValue(value: unknown): BrowserValue {
  const encoded = encodeBrowserValue(value)
  if (!encoded) {
    throw new Error('Browser command returned undefined inside a collection')
  }
  return encoded
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

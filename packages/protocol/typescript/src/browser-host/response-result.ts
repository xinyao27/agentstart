import { create } from '@bufbuild/protobuf'

import {
  BoolResultSchema,
  ExecuteResponseSchema,
  OutcomeResultSchema,
  StringResultSchema,
  ValueResultSchema,
  type ExecuteResponse
} from '../../generated/yiru/runtime/v1/browser_pb.js'
import { encodeBrowserValue, readBoolean, readNumber, readOptionalString } from './value.js'

export function valueResponse(
  command:
    | 'find'
    | 'get'
    | 'grabAwaitSelection'
    | 'grabCancel'
    | 'grabCaptureSelection'
    | 'grabExtractHover'
    | 'grabSetMode'
    | 'highlight'
    | 'insertText'
    | 'is'
    | 'mouseClick'
    | 'mouseDown'
    | 'mouseMove'
    | 'mouseUp'
    | 'mouseWheel'
    | 'scrollIntoView',
  output: unknown
): ExecuteResponse {
  return create(ExecuteResponseSchema, {
    result: {
      case: command,
      value: create(ValueResultSchema, { value: encodeBrowserValue(output) })
    }
  })
}

export function stringResponse(
  command:
    | 'clear'
    | 'click'
    | 'doubleClick'
    | 'fill'
    | 'focus'
    | 'hover'
    | 'keypress'
    | 'select'
    | 'selectAll',
  value: string
): ExecuteResponse {
  return create(ExecuteResponseSchema, {
    result: { case: command, value: create(StringResultSchema, { value }) }
  })
}

export function boolResponse(
  command:
    | 'check'
    | 'pageControlOpenDevTools'
    | 'pageControlRegister'
    | 'pageControlSetActive'
    | 'pageControlSetAnnotationViewport'
    | 'pageControlSetViewportOverride'
    | 'pageControlUnregister'
    | 'profileClearDefaultCookies'
    | 'type'
    | 'wait',
  value: boolean
): ExecuteResponse {
  return create(ExecuteResponseSchema, {
    result: { case: command, value: create(BoolResultSchema, { value }) }
  })
}

export function outcomeResponse(
  command: 'certificateProceed' | 'profileImportFromBrowser',
  output: unknown
): ExecuteResponse {
  return create(ExecuteResponseSchema, {
    result: {
      case: command,
      value: create(OutcomeResultSchema, {
        ok: readBoolean(output, 'ok'),
        reason: readOptionalString(output, 'reason')
      })
    }
  })
}

export function readUint32(value: unknown, key: string): number {
  const number = readNumber(value, key)
  if (!Number.isSafeInteger(number) || number < 0 || number > 0xffff_ffff) {
    throw new Error(`Browser command returned an invalid ${key}`)
  }
  return number
}

export function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  const decoded = atob(value)
  const bytes = new Uint8Array(decoded.length)
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index)
  }
  return bytes
}

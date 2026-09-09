import { create } from '@bufbuild/protobuf'

import {
  BoolResultSchema,
  BrowserCookieSchema,
  BrowserHeaderSchema,
  ExecuteResponseSchema,
  GeolocationResultSchema,
  InterceptedRequestSchema,
  InterceptEnableResultSchema,
  InterceptListResultSchema,
  ValueResultSchema,
  ViewportResultSchema
} from '../../generated/yiru/runtime/v1/browser_pb.js'
import type { ExecuteResponse } from '../../generated/yiru/runtime/v1/browser_pb.js'
import { CookieGetResultSchema } from '../../generated/yiru/runtime/v1/browser_pb.js'
import {
  encodeBrowserValue,
  readArray,
  readBoolean,
  readNumber,
  readRecord,
  readString
} from './value.js'

type EnvironmentCommand =
  | 'clipboardRead'
  | 'clipboardWrite'
  | 'cookieDelete'
  | 'cookieGet'
  | 'cookieSet'
  | 'dialogAccept'
  | 'dialogDismiss'
  | 'geolocation'
  | 'interceptDisable'
  | 'interceptEnable'
  | 'interceptList'
  | 'setCredentials'
  | 'setDevice'
  | 'setHeaders'
  | 'setMedia'
  | 'setOffline'
  | 'storageLocalClear'
  | 'storageLocalGet'
  | 'storageLocalSet'
  | 'storageSessionClear'
  | 'storageSessionGet'
  | 'storageSessionSet'
  | 'viewport'

export function encodeEnvironmentResponse(
  command: EnvironmentCommand,
  output: unknown
): ExecuteResponse {
  switch (command) {
    case 'cookieGet':
      return create(ExecuteResponseSchema, {
        result: {
          case: 'cookieGet',
          value: create(CookieGetResultSchema, {
            cookies: readArray(output, 'cookies').map((cookie) =>
              create(BrowserCookieSchema, {
                domain: readString(cookie, 'domain'),
                expires: readNumber(cookie, 'expires'),
                httpOnly: readBoolean(cookie, 'httpOnly'),
                name: readString(cookie, 'name'),
                path: readString(cookie, 'path'),
                sameSite: readString(cookie, 'sameSite'),
                secure: readBoolean(cookie, 'secure'),
                value: readString(cookie, 'value')
              })
            )
          })
        }
      })
    case 'cookieSet':
      return boolResponse('cookieSet', readBoolean(output, 'success'))
    case 'cookieDelete':
      return boolResponse('cookieDelete', readBoolean(output, 'deleted'))
    case 'viewport':
      return create(ExecuteResponseSchema, {
        result: {
          case: 'viewport',
          value: create(ViewportResultSchema, {
            deviceScaleFactor: readNumber(output, 'deviceScaleFactor'),
            height: readNumber(output, 'height'),
            mobile: readBoolean(output, 'mobile'),
            width: readNumber(output, 'width')
          })
        }
      })
    case 'geolocation':
      return create(ExecuteResponseSchema, {
        result: {
          case: 'geolocation',
          value: create(GeolocationResultSchema, {
            accuracy: readNumber(output, 'accuracy'),
            latitude: readNumber(output, 'latitude'),
            longitude: readNumber(output, 'longitude')
          })
        }
      })
    case 'interceptEnable':
      return create(ExecuteResponseSchema, {
        result: {
          case: 'interceptEnable',
          value: create(InterceptEnableResultSchema, {
            enabled: readBoolean(output, 'enabled'),
            patterns: readArray(output, 'patterns').map(readArrayString)
          })
        }
      })
    case 'interceptDisable':
      return boolResponse('interceptDisable', readBoolean(output, 'disabled'))
    case 'interceptList':
      return create(ExecuteResponseSchema, {
        result: {
          case: 'interceptList',
          value: create(InterceptListResultSchema, {
            requests: readArray(output, 'requests').map((request) =>
              create(InterceptedRequestSchema, {
                headers: Object.entries(
                  readRecord(Reflect.get(readRecord(request), 'headers'))
                ).map(([name, value]) =>
                  create(BrowserHeaderSchema, { name, value: readHeaderValue(value) })
                ),
                id: readString(request, 'id'),
                method: readString(request, 'method'),
                resourceType: readString(request, 'resourceType'),
                url: readString(request, 'url')
              })
            )
          })
        }
      })
    case 'setDevice':
    case 'setOffline':
    case 'setHeaders':
    case 'setCredentials':
    case 'setMedia':
    case 'clipboardRead':
    case 'clipboardWrite':
    case 'dialogAccept':
    case 'dialogDismiss':
    case 'storageLocalGet':
    case 'storageLocalSet':
    case 'storageLocalClear':
    case 'storageSessionGet':
    case 'storageSessionSet':
    case 'storageSessionClear':
      return create(ExecuteResponseSchema, {
        result: {
          case: command,
          value: create(ValueResultSchema, { value: encodeBrowserValue(output) })
        }
      })
  }
}

function boolResponse(
  command: 'cookieDelete' | 'cookieSet' | 'interceptDisable',
  value: boolean
): ExecuteResponse {
  return create(ExecuteResponseSchema, {
    result: { case: command, value: create(BoolResultSchema, { value }) }
  })
}

function readArrayString(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('Browser command returned an invalid string list')
  }
  return value
}

function readHeaderValue(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('Browser command returned an invalid header value')
  }
  return value
}

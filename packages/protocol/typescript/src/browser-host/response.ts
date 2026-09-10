import { create } from '@bufbuild/protobuf'

import {
  BinaryResultSchema,
  CountResultSchema,
  DetectedBrowserProfileSchema,
  DetectedBrowsersResultSchema,
  DragResultSchema,
  EvalResultSchema,
  ExecuteResponseSchema,
  NavigationResultSchema,
  ScreenshotResultSchema,
  ScrollResultSchema,
  SnapshotRefSchema,
  SnapshotResultSchema
} from '../../generated/agent_start/runtime/v1/browser_pb.js'
import type {
  ExecuteRequest,
  ExecuteResponse
} from '../../generated/agent_start/runtime/v1/browser_pb.js'
import { encodeEnvironmentResponse } from './response-environment.js'
import { encodeObservationResponse } from './response-observation.js'
import {
  boolResponse,
  decodeBase64,
  outcomeResponse,
  readUint32,
  stringResponse,
  valueResponse
} from './response-result.js'
import { encodeSessionResponse } from './response-session.js'
import { readArray, readBoolean, readOptionalString, readRecord, readString } from './value.js'

type CommandCase = Exclude<ExecuteRequest['command']['case'], undefined>

export function encodeBrowserResponse(command: CommandCase, output: unknown): ExecuteResponse {
  switch (command) {
    case 'snapshot': {
      const refs = readArray(output, 'refs').map((item) =>
        create(SnapshotRefSchema, {
          name: readString(item, 'name'),
          ref: readString(item, 'ref'),
          role: readString(item, 'role')
        })
      )
      return create(ExecuteResponseSchema, {
        result: {
          case: 'snapshot',
          value: create(SnapshotResultSchema, {
            browserPageId: readString(output, 'browserPageId'),
            refs,
            snapshot: readString(output, 'snapshot'),
            title: readString(output, 'title'),
            url: readString(output, 'url')
          })
        }
      })
    }
    case 'screenshot':
    case 'fullScreenshot':
      return create(ExecuteResponseSchema, {
        result: {
          case: command,
          value: create(ScreenshotResultSchema, {
            data: decodeBase64(readString(output, 'data')),
            format: readString(output, 'format')
          })
        }
      })
    case 'goto':
    case 'back':
    case 'reload':
    case 'forward':
      return create(ExecuteResponseSchema, {
        result: {
          case: command,
          value: create(NavigationResultSchema, {
            title: readString(output, 'title'),
            url: readString(output, 'url')
          })
        }
      })
    case 'eval':
      return create(ExecuteResponseSchema, {
        result: {
          case: 'eval',
          value: create(EvalResultSchema, {
            origin: readString(output, 'origin'),
            result: readString(output, 'result')
          })
        }
      })
    case 'scroll':
      return create(ExecuteResponseSchema, {
        result: {
          case: 'scroll',
          value: create(ScrollResultSchema, { scrolled: readString(output, 'scrolled') })
        }
      })
    case 'wait':
      return boolResponse('wait', readBoolean(output, 'waited'))
    case 'pdf':
      return create(ExecuteResponseSchema, {
        result: {
          case: 'pdf',
          value: create(BinaryResultSchema, { data: decodeBase64(readString(output, 'data')) })
        }
      })
    case 'click':
    case 'doubleClick':
      return stringResponse(command, readString(output, 'clicked'))
    case 'focus':
      return stringResponse('focus', readString(output, 'focused'))
    case 'clear':
      return stringResponse('clear', readString(output, 'cleared'))
    case 'selectAll':
      return stringResponse('selectAll', readString(output, 'selected'))
    case 'hover':
      return stringResponse('hover', readString(output, 'hovered'))
    case 'fill':
      return stringResponse('fill', readString(output, 'filled'))
    case 'type':
      return boolResponse('type', readBoolean(output, 'typed'))
    case 'select':
      return stringResponse('select', readString(output, 'selected'))
    case 'check':
      return boolResponse('check', readBoolean(output, 'checked'))
    case 'keypress':
      return stringResponse('keypress', readString(output, 'pressed'))
    case 'drag': {
      const dragged = readRecord(Reflect.get(readRecord(output), 'dragged'))
      return create(ExecuteResponseSchema, {
        result: {
          case: 'drag',
          value: create(DragResultSchema, {
            from: readString(dragged, 'from'),
            to: readString(dragged, 'to')
          })
        }
      })
    }
    case 'upload':
      return create(ExecuteResponseSchema, {
        result: {
          case: 'upload',
          value: create(CountResultSchema, { value: readUint32(output, 'uploaded') })
        }
      })
    case 'scrollIntoView':
    case 'get':
    case 'is':
    case 'insertText':
    case 'find':
    case 'highlight':
    case 'mouseMove':
    case 'mouseDown':
    case 'mouseUp':
    case 'mouseWheel':
      return valueResponse(command, output)
    case 'tabList':
    case 'tabShow':
    case 'tabCurrent':
    case 'tabSwitch':
    case 'tabCreate':
    case 'tabClose':
    case 'profileList':
    case 'profileCreate':
    case 'profileDelete':
    case 'tabSetProfile':
    case 'tabProfileShow':
    case 'tabProfileClone':
      return encodeSessionResponse(command, output)
    case 'cookieGet':
    case 'cookieSet':
    case 'cookieDelete':
    case 'viewport':
    case 'geolocation':
    case 'setDevice':
    case 'setOffline':
    case 'setHeaders':
    case 'setCredentials':
    case 'setMedia':
    case 'clipboardRead':
    case 'clipboardWrite':
    case 'dialogAccept':
    case 'dialogDismiss':
    case 'interceptEnable':
    case 'interceptDisable':
    case 'interceptList':
    case 'storageLocalGet':
    case 'storageLocalSet':
    case 'storageLocalClear':
    case 'storageSessionGet':
    case 'storageSessionSet':
    case 'storageSessionClear':
      return encodeEnvironmentResponse(command, output)
    case 'captureStart':
    case 'captureStop':
    case 'console':
    case 'network':
      return encodeObservationResponse(command, output)
    case 'certificateProceed':
    case 'profileImportFromBrowser':
      return outcomeResponse(command, output)
    case 'grabCancel':
    case 'grabSetMode':
    case 'grabAwaitSelection':
    case 'grabCaptureSelection':
    case 'grabExtractHover':
    case 'mouseClick':
      return valueResponse(command, output)
    case 'pageControlOpenDevTools':
    case 'pageControlSetActive':
    case 'pageControlRegister':
    case 'pageControlUnregister':
    case 'pageControlSetViewportOverride':
    case 'pageControlSetAnnotationViewport':
      return boolResponse(command, readBoolean(output, 'accepted'))
    case 'profileClearDefaultCookies':
      return boolResponse(command, readBoolean(output, 'cleared'))
    case 'profileDetectBrowsers':
      return create(ExecuteResponseSchema, {
        result: {
          case: 'profileDetectBrowsers',
          value: create(DetectedBrowsersResultSchema, {
            browsers: readArray(output, 'browsers').map((item) =>
              create(DetectedBrowserProfileSchema, {
                browserFamily: readString(item, 'browserFamily'),
                browserProfile: readOptionalString(item, 'browserProfile')
              })
            )
          })
        }
      })
  }
}

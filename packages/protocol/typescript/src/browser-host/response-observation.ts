import { create } from '@bufbuild/protobuf'

import {
  BoolResultSchema,
  ConsoleEntrySchema,
  ConsoleResultSchema,
  ExecuteResponseSchema,
  NetworkEntrySchema,
  NetworkResultSchema
} from '../../generated/agent_start/runtime/v1/browser_pb.js'
import type { ExecuteResponse } from '../../generated/agent_start/runtime/v1/browser_pb.js'
import {
  readArray,
  readBoolean,
  readNumber,
  readOptionalNumber,
  readOptionalString,
  readString
} from './value.js'

type ObservationCommand = 'captureStart' | 'captureStop' | 'console' | 'network'

export function encodeObservationResponse(
  command: ObservationCommand,
  output: unknown
): ExecuteResponse {
  switch (command) {
    case 'captureStart':
      return create(ExecuteResponseSchema, {
        result: {
          case: 'captureStart',
          value: create(BoolResultSchema, { value: readBoolean(output, 'capturing') })
        }
      })
    case 'captureStop':
      return create(ExecuteResponseSchema, {
        result: {
          case: 'captureStop',
          value: create(BoolResultSchema, { value: readBoolean(output, 'stopped') })
        }
      })
    case 'console':
      return create(ExecuteResponseSchema, {
        result: {
          case: 'console',
          value: create(ConsoleResultSchema, {
            entries: readArray(output, 'entries').map((entry) =>
              create(ConsoleEntrySchema, {
                level: readString(entry, 'level'),
                line: readOptionalNumber(entry, 'line'),
                text: readString(entry, 'text'),
                timestamp: readNumber(entry, 'timestamp'),
                url: readOptionalString(entry, 'url')
              })
            ),
            truncated: readBoolean(output, 'truncated')
          })
        }
      })
    case 'network':
      return create(ExecuteResponseSchema, {
        result: {
          case: 'network',
          value: create(NetworkResultSchema, {
            entries: readArray(output, 'entries').map((entry) =>
              create(NetworkEntrySchema, {
                method: readString(entry, 'method'),
                mimeType: readString(entry, 'mimeType'),
                size: readNumber(entry, 'size'),
                status: readNumber(entry, 'status'),
                timestamp: readNumber(entry, 'timestamp'),
                url: readString(entry, 'url')
              })
            ),
            truncated: readBoolean(output, 'truncated')
          })
        }
      })
  }
}

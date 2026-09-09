import { fromBinary } from '@bufbuild/protobuf'

import {
  SessionTabsServiceAllEventSchema,
  SessionTabsServiceEventSchema
} from '../../generated/yiru/runtime/v1/session_tabs_pb.js'
import type { RuntimeStream } from '../transport.js'
import { sessionTabsSnapshot } from './snapshot-values.js'
import type { SessionTabsAllStreamEventValue, SessionTabsStreamEventValue } from './values.js'

export async function* streamEvents(
  stream: RuntimeStream
): AsyncIterable<SessionTabsStreamEventValue> {
  for await (const payload of stream.events) {
    const message = fromBinary(SessionTabsServiceEventSchema, payload).event
    switch (message.case) {
      case 'snapshot':
        yield { type: 'snapshot', ...sessionTabsSnapshot(message.value) }
        break
      case 'updated':
        yield { type: 'updated', ...sessionTabsSnapshot(message.value) }
        break
      case 'end':
        yield { type: 'end' }
        break
      case undefined:
        break
    }
  }
}

export async function* allStreamEvents(
  stream: RuntimeStream
): AsyncIterable<SessionTabsAllStreamEventValue> {
  for await (const payload of stream.events) {
    const message = fromBinary(SessionTabsServiceAllEventSchema, payload).event
    switch (message.case) {
      case 'snapshots':
        yield { type: 'snapshots', snapshots: message.value.snapshots.map(sessionTabsSnapshot) }
        break
      case 'updated':
        yield { type: 'updated', ...sessionTabsSnapshot(message.value) }
        break
      case 'end':
        yield { type: 'end' }
        break
      case undefined:
        break
    }
  }
}

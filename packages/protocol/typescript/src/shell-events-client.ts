import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import {
  ShellEventsService,
  ShellEventsServiceEventSchema,
  ShellEventsServiceSubscribeRequestSchema
} from '../generated/yiru/runtime/v1/shell_events_pb.js'
import {
  shellEventsSubscriptionEvent,
  type ShellEventsSubscriptionEventValue
} from './shell-events-values.js'
import type { RuntimeCallOptions, RuntimeStream, RuntimeTransport } from './transport.js'

const SUBSCRIBE_PROCEDURE = `/${ShellEventsService.typeName}/${ShellEventsService.method.subscribe.name}`

export type ShellEventsSubscription = {
  events: AsyncIterable<ShellEventsSubscriptionEventValue>
  cancel: (reason?: string) => Promise<void>
}

export class ShellEventsClient {
  private readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  /**
   * Tail the shared shell event log. The first event is the `ready` cursor and
   * `lastSeenSeq` resumes from it; a replay gap arrives as `resync`.
   */
  async subscribe(
    input: { lastSeenSeq?: number } = {},
    options?: RuntimeCallOptions
  ): Promise<ShellEventsSubscription> {
    const stream = await this.transport.subscribe({
      method: SUBSCRIBE_PROCEDURE,
      payload: toBinary(
        ShellEventsServiceSubscribeRequestSchema,
        create(
          ShellEventsServiceSubscribeRequestSchema,
          input.lastSeenSeq === undefined ? {} : { lastSeenSeq: input.lastSeenSeq }
        )
      ),
      ...(options ? { options } : {})
    })
    return { events: streamEvents(stream), cancel: stream.cancel }
  }
}

async function* streamEvents(
  stream: RuntimeStream
): AsyncIterable<ShellEventsSubscriptionEventValue> {
  for await (const payload of stream.events) {
    yield shellEventsSubscriptionEvent(fromBinary(ShellEventsServiceEventSchema, payload))
  }
}

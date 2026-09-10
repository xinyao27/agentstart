import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import {
  DriverEventsService,
  DriverEventsServiceEventSchema,
  DriverEventsServiceSubscribeRequestSchema
} from '../generated/agent_start/runtime/v1/driver_events_pb.js'
import {
  driverEventsSubscriptionEvent,
  type DriverEventsSubscriptionEventValue
} from './driver-events-values.js'
import type { RuntimeCallOptions, RuntimeStream, RuntimeTransport } from './transport.js'

const SUBSCRIBE_PROCEDURE = `/${DriverEventsService.typeName}/${DriverEventsService.method.subscribe.name}`

export type DriverEventsSubscription = {
  events: AsyncIterable<DriverEventsSubscriptionEventValue>
  cancel: (reason?: string) => Promise<void>
}

export class DriverEventsClient {
  private readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  /**
   * Tail cross-client terminal ownership. The stream opens with the `ready`
   * envelope carrying the connection-scoped subscription id, and `end` closes it.
   */
  async subscribe(options?: RuntimeCallOptions): Promise<DriverEventsSubscription> {
    const stream = await this.transport.subscribe({
      method: SUBSCRIBE_PROCEDURE,
      payload: toBinary(
        DriverEventsServiceSubscribeRequestSchema,
        create(DriverEventsServiceSubscribeRequestSchema)
      ),
      ...(options ? { options } : {})
    })
    return { events: streamEvents(stream), cancel: stream.cancel }
  }
}

async function* streamEvents(
  stream: RuntimeStream
): AsyncIterable<DriverEventsSubscriptionEventValue> {
  for await (const payload of stream.events) {
    yield driverEventsSubscriptionEvent(fromBinary(DriverEventsServiceEventSchema, payload))
  }
}

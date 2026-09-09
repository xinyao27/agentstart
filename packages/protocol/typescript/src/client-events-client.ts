import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import {
  ClientEventsService,
  ClientEventsServiceEventSchema,
  ClientEventsServiceSubscribeRequestSchema,
  ClientEventsServiceUnsubscribeRequestSchema,
  ClientEventsServiceUnsubscribeResponseSchema
} from '../generated/yiru/runtime/v1/client_events_pb.js'
import {
  clientEventsSubscriptionEvent,
  type ClientEventsSubscriptionEventValue
} from './client-events-values.js'
import type { RuntimeCallOptions, RuntimeStream, RuntimeTransport } from './transport.js'

const SUBSCRIBE_PROCEDURE = `/${ClientEventsService.typeName}/${ClientEventsService.method.subscribe.name}`
const UNSUBSCRIBE_PROCEDURE = `/${ClientEventsService.typeName}/${ClientEventsService.method.unsubscribe.name}`

export type ClientEventsSubscription = {
  events: AsyncIterable<ClientEventsSubscriptionEventValue>
  cancel: (reason?: string) => Promise<void>
}

export class ClientEventsClient {
  private readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  /**
   * Tail the runtime's catalog invalidation events. The stream opens with the
   * `ready` envelope carrying the subscription id, and `end` closes it.
   */
  async subscribe(options?: RuntimeCallOptions): Promise<ClientEventsSubscription> {
    const stream = await this.transport.subscribe({
      method: SUBSCRIBE_PROCEDURE,
      payload: toBinary(
        ClientEventsServiceSubscribeRequestSchema,
        create(ClientEventsServiceSubscribeRequestSchema)
      ),
      ...(options ? { options } : {})
    })
    return { events: streamEvents(stream), cancel: stream.cancel }
  }

  async unsubscribe(
    input: { subscriptionId: string },
    options?: RuntimeCallOptions
  ): Promise<{ unsubscribed: boolean }> {
    const response = await this.transport.unary({
      method: UNSUBSCRIBE_PROCEDURE,
      payload: toBinary(
        ClientEventsServiceUnsubscribeRequestSchema,
        create(ClientEventsServiceUnsubscribeRequestSchema, {
          subscriptionId: input.subscriptionId
        })
      ),
      ...(options ? { options } : {})
    })
    return fromBinary(ClientEventsServiceUnsubscribeResponseSchema, response)
  }
}

async function* streamEvents(
  stream: RuntimeStream
): AsyncIterable<ClientEventsSubscriptionEventValue> {
  for await (const payload of stream.events) {
    yield clientEventsSubscriptionEvent(fromBinary(ClientEventsServiceEventSchema, payload))
  }
}

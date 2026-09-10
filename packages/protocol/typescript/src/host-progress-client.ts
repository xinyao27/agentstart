import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import { StatusCode } from '../generated/agent_start/protocol/v1/errors_pb.js'
import {
  ProgressEventsService,
  ProgressEventsServiceEventSchema,
  ProgressEventsServiceSubscribeRequestSchema,
  type ProgressEventsServiceEvent
} from '../generated/agent_start/runtime/v1/host_progress_pb.js'
import { RuntimeProtocolError } from './error.js'
import type { RuntimeCallOptions, RuntimeStream, RuntimeTransport } from './transport.js'

export const PROGRESS_EVENTS_PROTOCOL_CAPABILITY = 'runtime.progressEvents.protobuf.v1' as const

const SUBSCRIBE_PROCEDURE = `/${ProgressEventsService.typeName}/${ProgressEventsService.method.subscribe.name}`

export type ProgressEventsSubscriptionEventValue =
  | { type: 'ready'; subscriptionId: string }
  | { type: 'repoCloneProgress'; phase: string; percent: number }
  | { type: 'end' }

export type ProgressEventsSubscription = {
  events: AsyncIterable<ProgressEventsSubscriptionEventValue>
  cancel: (reason?: string) => Promise<void>
}

export class ProgressEventsClient {
  private readonly transport: RuntimeTransport

  constructor(transport: RuntimeTransport) {
    this.transport = transport
  }

  /**
   * Tail long-running host work progress. The stream opens with the `ready`
   * envelope carrying the subscription id, and `end` closes it.
   */
  async subscribe(options?: RuntimeCallOptions): Promise<ProgressEventsSubscription> {
    const stream = await this.transport.subscribe({
      method: SUBSCRIBE_PROCEDURE,
      payload: toBinary(
        ProgressEventsServiceSubscribeRequestSchema,
        create(ProgressEventsServiceSubscribeRequestSchema)
      ),
      ...(options ? { options } : {})
    })
    return { events: streamEvents(stream), cancel: stream.cancel }
  }
}

async function* streamEvents(
  stream: RuntimeStream
): AsyncIterable<ProgressEventsSubscriptionEventValue> {
  for await (const payload of stream.events) {
    yield progressEvent(fromBinary(ProgressEventsServiceEventSchema, payload))
  }
}

function progressEvent(event: ProgressEventsServiceEvent): ProgressEventsSubscriptionEventValue {
  switch (event.event.case) {
    case 'ready':
      return { type: 'ready', subscriptionId: event.event.value.subscriptionId }
    case 'repoCloneProgress':
      return {
        type: 'repoCloneProgress',
        phase: event.event.value.phase,
        percent: event.event.value.percent
      }
    case 'end':
      return { type: 'end' }
    case undefined:
      throw new RuntimeProtocolError(
        StatusCode.DATA_LOSS,
        'Progress event stream sent an empty event'
      )
  }
}

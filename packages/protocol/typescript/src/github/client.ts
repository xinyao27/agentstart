import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import { StatusCode } from '../../generated/yiru/protocol/v1/errors_pb.js'
import {
  GitHubService,
  GitHubServiceSubscribeEventsRequestSchema,
  GitHubServiceSubscribeEventsResponseSchema
} from '../../generated/yiru/runtime/v1/github_pb.js'
import { RuntimeProtocolError } from '../error.js'
import type { RuntimeCallOptions, RuntimeTransport } from '../transport.js'
import { githubPrRefreshEvent, githubWorkItemMutatedEvent } from './events-values.js'
import type { GitHubPRRefreshEvent, GitHubWorkItemMutatedEvent } from './events-values.js'
import { GitHubHostedReviewClient } from './hosted-review-client.js'

export const GITHUB_PROTOCOL_CAPABILITY = 'github.protobuf.v1' as const

export type GitHubEvent =
  | { type: 'workItemMutated'; item: GitHubWorkItemMutatedEvent }
  | { type: 'prRefresh'; event: GitHubPRRefreshEvent }

const SUBSCRIBE_EVENTS_PROCEDURE = `/${GitHubService.typeName}/${GitHubService.method.subscribeEvents.name}`

export class GitHubClient extends GitHubHostedReviewClient {
  constructor(transport: RuntimeTransport) {
    super(transport)
  }

  async subscribeEvents(options?: RuntimeCallOptions): Promise<AsyncIterable<GitHubEvent>> {
    const stream = await this.transport.subscribe({
      method: SUBSCRIBE_EVENTS_PROCEDURE,
      payload: toBinary(
        GitHubServiceSubscribeEventsRequestSchema,
        create(GitHubServiceSubscribeEventsRequestSchema)
      ),
      ...(options ? { options } : {})
    })
    return mapEvents(stream.events)
  }
}

async function* mapEvents(events: AsyncIterable<Uint8Array>): AsyncIterable<GitHubEvent> {
  for await (const payload of events) {
    const response = fromBinary(GitHubServiceSubscribeEventsResponseSchema, payload)
    switch (response.event.case) {
      case 'workItemMutated':
        yield { type: 'workItemMutated', item: githubWorkItemMutatedEvent(response.event.value) }
        break
      case 'prRefresh':
        yield { type: 'prRefresh', event: githubPrRefreshEvent(response.event.value) }
        break
      case 'ready':
        break
      default:
        throw new RuntimeProtocolError(
          StatusCode.DATA_LOSS,
          'GitHub events stream sent an unrecognized event'
        )
    }
  }
}

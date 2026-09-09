import { create, fromBinary, toBinary } from '@bufbuild/protobuf'

import {
  WorktreeService,
  WorktreeServiceSubscribeStateEventsRequestSchema,
  WorktreeServiceSubscribeStateEventsResponseSchema
} from '../generated/yiru/runtime/v1/worktree_pb.js'
import type { RuntimeCallOptions, RuntimeStream, RuntimeTransport } from './transport.js'
import type { WorktreeStateSubscriptionEvent } from './worktree-operation-types.js'
import { worktreeStateSubscriptionEvent } from './worktree-state-values.js'

const procedure = <K extends keyof typeof WorktreeService.method>(name: K) =>
  `/${WorktreeService.typeName}/${WorktreeService.method[name].name}`

export type WorktreeStateEventSubscription = Readonly<{
  messages: AsyncIterable<WorktreeStateSubscriptionEvent>
  cancel: (reason?: string) => Promise<void>
}>

/**
 * Tail base-drift signals for every repo on the host. A routed transport
 * restarts the stream from scratch, so a caller does not need a resume
 * cursor the way `WorkspaceEventsClient.watch` does.
 */
export async function subscribeWorktreeStateEvents(
  transport: RuntimeTransport,
  options?: RuntimeCallOptions
): Promise<WorktreeStateEventSubscription> {
  const stream = await transport.subscribe({
    method: procedure('subscribeStateEvents'),
    payload: toBinary(
      WorktreeServiceSubscribeStateEventsRequestSchema,
      create(WorktreeServiceSubscribeStateEventsRequestSchema, {})
    ),
    ...(options ? { options } : {})
  })
  return { messages: stateEventMessages(stream), cancel: stream.cancel }
}

async function* stateEventMessages(
  stream: RuntimeStream
): AsyncIterable<WorktreeStateSubscriptionEvent> {
  for await (const payload of stream.events) {
    yield worktreeStateSubscriptionEvent(
      fromBinary(WorktreeServiceSubscribeStateEventsResponseSchema, payload)
    )
  }
}

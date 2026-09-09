import {
  WORKSPACE_EVENTS_APPEND_PROTOCOL_CAPABILITY,
  WORKSPACE_EVENTS_PROTOCOL_CAPABILITY,
  WorkspaceEventsClient,
  type WorkspaceEventRecord
} from '@yiru/protocol'

import { openRuntimeProtocolTarget } from './protocol-target'
import type { RuntimeClientTarget } from './runtime-target'
import { readRuntimeStatus } from './status-client'

export type WorkspaceEventWatchInput = Readonly<{
  afterId: number
  scope: string
}>

export async function openWorkspaceEventsClient(
  target: RuntimeClientTarget
): Promise<WorkspaceEventsClient | null> {
  const status = await readRuntimeStatus(target)
  if (!status.capabilities?.includes(WORKSPACE_EVENTS_PROTOCOL_CAPABILITY)) {
    return null
  }
  return new WorkspaceEventsClient(await openRuntimeProtocolTarget(target))
}

// Why: the workspaceEvents journal namespace has no legacy transport left, so a
// missing capability means the connected daemon predates the cutover — an
// error, not a retry on another wire.
export async function requireWorkspaceEventsClient(
  target: RuntimeClientTarget
): Promise<WorkspaceEventsClient> {
  const client = await openWorkspaceEventsClient(target)
  if (!client) {
    throw new Error(
      'workspaceEvents.journal.protobuf.v1 capability is not available on this runtime host'
    )
  }
  return client
}

// Why: the appends mount under their own capability, so a daemon from the
// journal-only intermediate state fails here instead of at the call itself.
export async function requireWorkspaceEventsAppendClient(
  target: RuntimeClientTarget
): Promise<WorkspaceEventsClient> {
  const status = await readRuntimeStatus(target)
  if (!status.capabilities?.includes(WORKSPACE_EVENTS_APPEND_PROTOCOL_CAPABILITY)) {
    throw new Error(
      'workspaceEvents.append.protobuf.v1 capability is not available on this runtime host'
    )
  }
  return new WorkspaceEventsClient(await openRuntimeProtocolTarget(target))
}

/**
 * Tail one scope until the signal aborts or the stream ends, delivering events
 * in journal order. The daemon resumes from `afterId`, so a caller that records
 * the last delivered id reopens the watch without replaying what it applied.
 */
export async function watchWorkspaceEvents(
  target: RuntimeClientTarget,
  input: WorkspaceEventWatchInput,
  signal: AbortSignal,
  onEvent: (event: WorkspaceEventRecord) => Promise<void> | void
): Promise<void> {
  const client = await requireWorkspaceEventsClient(target)
  // Why: while the client opens, the owning surface can unmount (StrictMode
  // remount, dependency churn); opening then only cancels on the next tick.
  if (signal.aborted) {
    return
  }
  const watch = await client.watch(input, { signal })
  // Why: a routed watch restarts from the request it was opened with, so an
  // event the caller already applied is dropped instead of replayed.
  let cursor = input.afterId
  try {
    for await (const message of watch.messages) {
      if (signal.aborted) {
        return
      }
      if (message.type !== 'event' || message.event.id <= cursor) {
        continue
      }
      cursor = message.event.id
      await onEvent(message.event)
    }
  } finally {
    await watch.cancel()
  }
}

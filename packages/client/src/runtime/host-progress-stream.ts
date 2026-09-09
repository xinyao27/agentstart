import {
  PROGRESS_EVENTS_PROTOCOL_CAPABILITY,
  ProgressEventsClient,
  type ProgressEventsSubscriptionEventValue
} from '@yiru/protocol'

import { openRuntimeProtocolTarget } from './protocol-target'
import { targetKey } from './query-target'
import type { RuntimeClientTarget } from './runtime-target'
import { readRuntimeStatus } from './status-client'
import { createRuntimeStreamFanOut } from './stream-fan-out'

const LOCAL_TARGET = { kind: 'local' } as const satisfies RuntimeClientTarget
const hostProgressEventsByTarget = new Map<string, ReturnType<typeof createHostProgressEvents>>()

function requireProgressEventsClient(target: RuntimeClientTarget) {
  return async (): Promise<ProgressEventsClient> => {
    const status = await readRuntimeStatus(target)
    if (!status.capabilities?.includes(PROGRESS_EVENTS_PROTOCOL_CAPABILITY)) {
      // Why: a missing capability means the daemon predates the cutover; the
      // fan-out treats the failure as a reconnect trigger like any dropped
      // stream instead of falling back to the retired JSON transport.
      throw new Error('runtime.progressEvents.protobuf.v1 capability is not available')
    }
    return new ProgressEventsClient(await openRuntimeProtocolTarget(target))
  }
}

function createHostProgressEvents(target: RuntimeClientTarget) {
  return createRuntimeStreamFanOut<ProgressEventsClient, ProgressEventsSubscriptionEventValue>({
    resolveClient: requireProgressEventsClient(target),
    open: (client, signal) => client.subscribe({ signal }).then((stream) => stream.events)
  })
}

function hostProgressEvents(target: RuntimeClientTarget) {
  const key = targetKey(target)
  const existing = hostProgressEventsByTarget.get(key)
  if (existing) {
    return existing
  }
  const created = createHostProgressEvents(target)
  hostProgressEventsByTarget.set(key, created)
  return created
}

export function onHostProgressEvent<TType extends ProgressEventsSubscriptionEventValue['type']>(
  target: RuntimeClientTarget,
  type: TType,
  callback: (event: Extract<ProgressEventsSubscriptionEventValue, { type: TType }>) => void
): () => void {
  return hostProgressEvents(target).subscribe((event) => {
    if (event.type === type) {
      callback(event as Extract<ProgressEventsSubscriptionEventValue, { type: TType }>)
    }
  })
}

export function onLocalHostProgressEvent<
  TType extends ProgressEventsSubscriptionEventValue['type']
>(
  type: TType,
  callback: (event: Extract<ProgressEventsSubscriptionEventValue, { type: TType }>) => void
): () => void {
  return onHostProgressEvent(LOCAL_TARGET, type, callback)
}

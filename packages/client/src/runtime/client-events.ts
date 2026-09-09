import type { ClientEventsSubscriptionEventValue } from '@yiru/protocol'
import type { RuntimeClientEvent } from '~renderer/runtime/client-event-model'

import { requireClientEventsClient } from './client-events-target'
import type { RuntimeClientTarget } from './runtime-target'

export type RuntimeClientEventSubscription = {
  unsubscribe: () => void
}

export async function subscribeRuntimeClientEvents(
  environmentId: string,
  onEvent: (event: RuntimeClientEvent) => void,
  onError: (error: unknown) => void = console.warn
): Promise<RuntimeClientEventSubscription> {
  const controller = new AbortController()
  const target = { kind: 'environment', environmentId } as const satisfies RuntimeClientTarget
  const client = await requireClientEventsClient(target)
  const stream = await client.subscribe({ signal: controller.signal })
  void (async () => {
    try {
      for await (const message of stream.events) {
        if (controller.signal.aborted) {
          return
        }
        if (message.type === 'ready' || message.type === 'end') {
          continue
        }
        onEvent(toRuntimeClientEvent(message))
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        onError(error)
      }
    } finally {
      await stream.cancel()
    }
  })()
  return { unsubscribe: () => controller.abort() }
}

// Why: the worktree's setup/startup/default-tabs payloads are the worktree's
// own open JSON documents, so the workbench launch types reattach here at the
// single adapter boundary every consumer subscribes through.
function toRuntimeClientEvent(
  message: Exclude<ClientEventsSubscriptionEventValue, { type: 'ready' | 'end' }>
): RuntimeClientEvent {
  return message as RuntimeClientEvent
}

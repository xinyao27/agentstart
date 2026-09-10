import {
  SHELL_EVENTS_PROTOCOL_CAPABILITY,
  ShellEventsClient,
  type ShellEventsSubscriptionEventValue
} from '@agentstart/protocol'

import { openRuntimeProtocolTarget } from './protocol-target'
import { readRuntimeStatus } from './status-client'
import { createRuntimeStreamFanOut } from './stream-fan-out'

export type ShellEvent = Exclude<ShellEventsSubscriptionEventValue, { type: 'ready' | 'resync' }>

// Why: shell.events is LOCAL-only by contract, so its stream anchors to the
// fixed local rendering shell, never the active environment — and a missing
// capability means the daemon predates the cutover, an error rather than a
// legacy retry.
async function requireShellEventsClient(): Promise<ShellEventsClient> {
  const target = { kind: 'local' } as const
  const status = await readRuntimeStatus(target)
  if (!status.capabilities?.includes(SHELL_EVENTS_PROTOCOL_CAPABILITY)) {
    throw new Error('shell.events.protobuf.v1 capability is not available')
  }
  return new ShellEventsClient(await openRuntimeProtocolTarget(target))
}

const shellEventFanOut = createRuntimeStreamFanOut<
  ShellEventsClient,
  ShellEventsSubscriptionEventValue
>({
  resolveClient: requireShellEventsClient,
  open: (client, signal) =>
    client.subscribe({ lastSeenSeq }, { signal }).then((stream) => stream.events),
  // Why: menu and window intent delivery must recover without a reconnect
  // stampede when the browser resumes or its transport briefly drops.
  retryDelayMs: (attempt) => {
    const exponentialMs = Math.min(30_000, 500 * 2 ** Math.min(attempt - 1, 6))
    return exponentialMs + Math.floor(Math.random() * Math.min(1_000, exponentialMs / 4))
  }
})

let lastSeenSeq: number | undefined
let stopBootstrap: (() => void) | null = null

function observeShellSubscriptionEvent(event: ShellEventsSubscriptionEventValue): void {
  if (event.type === 'ready') {
    lastSeenSeq = event.seq
    return
  }
  if (event.type === 'resync') {
    lastSeenSeq = event.seq
    return
  }
  lastSeenSeq = Math.max(lastSeenSeq ?? 0, event.seq)
}

export function startShellEventStream(): void {
  stopBootstrap ??= shellEventFanOut.subscribe(observeShellSubscriptionEvent)
}

export function subscribeShellEvent(
  listener: (event: ShellEvent & { seq: number }) => void
): () => void {
  startShellEventStream()
  return shellEventFanOut.subscribe((event) => {
    if (event.type !== 'ready' && event.type !== 'resync') {
      listener(event)
    }
  })
}

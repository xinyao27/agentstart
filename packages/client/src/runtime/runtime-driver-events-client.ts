import {
  DRIVER_EVENTS_PROTOCOL_CAPABILITY,
  DriverEventsClient,
  type DriverEventsSubscriptionEventValue
} from '@yiru/protocol'
type RuntimeDriverEvent = Exclude<DriverEventsSubscriptionEventValue, { type: 'ready' | 'end' }>

import { openRuntimeProtocolTarget } from './protocol-target'
import { readRuntimeStatus } from './status-client'
import { createRuntimeStreamFanOut } from './stream-fan-out'

// Why: these locks describe terminals owned by the shell's runtime. A remote
// PTY carries its own driver state on its dedicated stream. LOCAL admission is
// not contract-guaranteed, so the stream anchors to the local rendering shell
// and a missing capability means the daemon predates the cutover.
async function requireDriverEventsClient(): Promise<DriverEventsClient> {
  const target = { kind: 'local' } as const
  const status = await readRuntimeStatus(target)
  if (!status.capabilities?.includes(DRIVER_EVENTS_PROTOCOL_CAPABILITY)) {
    throw new Error('runtime.driverEvents.protobuf.v1 capability is not available')
  }
  return new DriverEventsClient(await openRuntimeProtocolTarget(target))
}

const runtimeDriverEvents = createRuntimeStreamFanOut<
  DriverEventsClient,
  DriverEventsSubscriptionEventValue
>({
  resolveClient: requireDriverEventsClient,
  open: (client, signal) => client.subscribe({ signal }).then((stream) => stream.events)
})

type RuntimeDriverEventHandlers = {
  onEvent: (event: RuntimeDriverEvent) => void
  onReady: () => void
}

export function subscribeRuntimeDriverEvents(handlers: RuntimeDriverEventHandlers): () => void {
  return runtimeDriverEvents.subscribe((event) => {
    handleRuntimeDriverSubscriptionEvent(event, handlers)
  })
}

function handleRuntimeDriverSubscriptionEvent(
  event: DriverEventsSubscriptionEventValue,
  handlers: RuntimeDriverEventHandlers
): void {
  switch (event.type) {
    case 'ready':
      handlers.onReady()
      return
    case 'terminalDriverChanged':
    case 'terminalFitOverrideChanged':
      handlers.onEvent(event)
      break
    case 'end':
      break
  }
}

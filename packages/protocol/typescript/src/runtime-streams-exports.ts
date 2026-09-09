// Why: the runtime event-stream namespaces that moved off legacy JSON in one
// wave re-export from here so protocol.ts stays under the max-lines budget.
export { ClientEventsClient } from './client-events-client.js'
export type { ClientEventsSubscription } from './client-events-client.js'
export {
  CLIENT_EVENTS_PROTOCOL_CAPABILITY,
  type ClientEventsActivateWorktreeValue,
  type ClientEventsHeadIdentityValue,
  type ClientEventsPlainJsonValue,
  type ClientEventsSubscriptionEventValue
} from './client-events-values.js'
export { DriverEventsClient } from './driver-events-client.js'
export {
  DRIVER_EVENTS_PROTOCOL_CAPABILITY,
  type DriverEventsSubscriptionEventValue,
  type DriverEventsTerminalDriverValue
} from './driver-events-values.js'
export type { DriverEventsSubscription } from './driver-events-client.js'
export { ProgressEventsClient } from './host-progress-client.js'
export {
  PROGRESS_EVENTS_PROTOCOL_CAPABILITY,
  type ProgressEventsSubscription,
  type ProgressEventsSubscriptionEventValue
} from './host-progress-client.js'

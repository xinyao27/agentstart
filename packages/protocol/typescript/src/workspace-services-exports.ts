// Why: the workspace/shell services that moved off legacy JSON in one wave
// re-export from here so protocol.ts stays under the max-lines budget.
export { WorkspaceCleanupClient } from './workspace-cleanup-client.js'
export type { WorkspaceCleanupEvents } from './workspace-cleanup-client.js'
export { WORKSPACE_CLEANUP_PROTOCOL_CAPABILITY } from './workspace-cleanup-values.js'
export type {
  WorkspaceCleanupBlocker,
  WorkspaceCleanupCandidate,
  WorkspaceCleanupDismissal,
  WorkspaceCleanupEvent,
  WorkspaceCleanupReason,
  WorkspaceCleanupScanArgs,
  WorkspaceCleanupScanError,
  WorkspaceCleanupScanProgress,
  WorkspaceCleanupScanResult,
  WorkspaceCleanupTier
} from './workspace-cleanup-values.js'
export { ShellSessionClient } from './shell-session-client.js'
export { SHELL_SESSION_PROTOCOL_CAPABILITY } from './shell-session-client.js'
export type {
  ShellSessionDocumentValue,
  ShellSessionJsonValue,
  ShellSessionVersion,
  ShellSessionSnapshot
} from './shell-session-client.js'
export { ShellTelemetryClient } from './shell-telemetry-client.js'
export { SHELL_TELEMETRY_PROTOCOL_CAPABILITY } from './shell-telemetry-client.js'
export type { ShellTelemetryConsentState } from './shell-telemetry-client.js'
export { RitualClient } from './ritual-client.js'
export { RITUAL_PROTOCOL_CAPABILITY } from './ritual-values.js'
export type {
  RitualProjectResult,
  RitualRunKind,
  RitualRunResult,
  RitualSchedule,
  RitualScheduleStatus
} from './ritual-values.js'
export { WorkspacePortsClient } from './workspace-ports-client.js'
export type { WorkspacePortsEvents } from './workspace-ports-client.js'
export { WORKSPACE_PORTS_PROTOCOL_CAPABILITY } from './workspace-ports-values.js'
export type {
  WorkspacePort,
  WorkspacePortAdvertisedUrlChangedEvent,
  WorkspacePortAttributionConfidence,
  WorkspacePortKillResult,
  WorkspacePortOwner,
  WorkspacePortScanResult,
  WorkspacePortSubscriptionEvent
} from './workspace-ports-values.js'

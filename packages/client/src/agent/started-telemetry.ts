import type { EventProps } from '@yiru/protocol/telemetry/events/catalog'

/** Payload reported only after the matching agent PTY spawn succeeds. */
export type AgentStartedTelemetry = EventProps<'agent_started'>

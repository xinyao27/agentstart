import type { AgentStatusInterruptInput } from '@yiru/protocol'

export type AgentInterruptInferenceRequest = AgentStatusInterruptInput
export type AgentInterruptInputIntent = AgentStatusInterruptInput['intent']
export const AGENT_INTERRUPT_SETTLE_MS = 500

import {
  AgentSessionPhase as ProtocolAgentSessionPhase,
  AgentSessionStatus as ProtocolAgentSessionStatus,
  type AgentSession as ProtocolAgentSession,
  type AgentSessionProvider as ProtocolAgentSessionProvider
} from '../generated/yiru/runtime/v1/agent_session_pb.js'

export const AGENT_SESSION_PROTOCOL_CAPABILITY = 'agentSession.protobuf.v1' as const

export type AgentSessionPhase = 'thinking' | 'waiting-decision' | 'complete'

export type AgentSessionStatus = 'running' | 'complete' | 'interrupted'

export type AgentSessionProviderValue = Readonly<{
  available: boolean
  executable: string | null
  id: string
  label: string
  resumable: boolean
}>

export type AgentSessionValue = Readonly<{
  agent: string
  completedAt: number | null
  createdAt: number
  id: string
  phase: AgentSessionPhase
  status: AgentSessionStatus
  terminalHandle: string
  title: string | null
  updatedAt: number
  worktreeId: string
}>

const PHASES: Readonly<Record<ProtocolAgentSessionPhase, AgentSessionPhase>> = {
  [ProtocolAgentSessionPhase.UNSPECIFIED]: 'thinking',
  [ProtocolAgentSessionPhase.THINKING]: 'thinking',
  [ProtocolAgentSessionPhase.WAITING_DECISION]: 'waiting-decision',
  [ProtocolAgentSessionPhase.COMPLETE]: 'complete'
}

const STATUSES: Readonly<Record<ProtocolAgentSessionStatus, AgentSessionStatus>> = {
  [ProtocolAgentSessionStatus.UNSPECIFIED]: 'interrupted',
  [ProtocolAgentSessionStatus.RUNNING]: 'running',
  [ProtocolAgentSessionStatus.COMPLETE]: 'complete',
  [ProtocolAgentSessionStatus.INTERRUPTED]: 'interrupted'
}

export function agentSessionProviderValue(
  provider: ProtocolAgentSessionProvider
): AgentSessionProviderValue {
  return {
    available: provider.available,
    executable: provider.executable ?? null,
    id: provider.id,
    label: provider.label,
    resumable: provider.resumable
  }
}

export function agentSessionValue(session: ProtocolAgentSession): AgentSessionValue {
  return {
    agent: session.agent,
    completedAt: safeTimestamp(session.completedAt),
    createdAt: safeTimestamp(session.createdAt) ?? 0,
    id: session.id,
    phase: PHASES[session.phase],
    status: STATUSES[session.status],
    terminalHandle: session.terminalHandle,
    title: session.title ?? null,
    updatedAt: safeTimestamp(session.updatedAt) ?? 0,
    worktreeId: session.worktreeId
  }
}

function safeTimestamp(value: bigint | undefined): number | null {
  if (value === undefined) {
    return null
  }
  const timestamp = Number(value)
  return Number.isSafeInteger(timestamp) ? timestamp : null
}
